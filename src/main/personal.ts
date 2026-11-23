import { app, dialog, ipcMain, Notification, shell } from "electron"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { randomUUID } from "node:crypto"
import type { SourcePreferences } from "../source-preferences"
import type Database from "better-sqlite3"
import type Store from "electron-store"
import type {
    SchemaTypes,
    SourceGroup,
    StoredRule,
    StoredRules,
} from "../schema-types"
import type {
    AIConfig,
    AIKind,
    OfflineTask,
    PersonalSettings,
    SiteExtractionRule,
} from "../personal-types"
import type { WindowManager } from "./window"
import { DomainQueue } from "./domain-queue"
import { SearchIndex } from "./search-index"
import { Backups } from "./backup"
import { FullText } from "./web-content"
import { OfflinePages } from "./offline"
import { Subscriptions } from "./subscriptions"
import { AI } from "./ai"
import { ArticleArchive } from "./archive"
import type {
    ArchiveAction,
    ArchiveActionKind,
    ArchiveQuery,
    ArchiveRule,
} from "../archive-types"
import { collectionKey } from "../reading-preferences"
import { LinuxDo } from "./linuxdo"
import { linuxDoJSONPath, LINUXDO } from "../linuxdo"
import { PersonalPreferencesStore } from "./personal-preferences"
import {
    clearWebAccount,
    enrichWebAccounts,
    listWebAccounts,
    lockWebPartitionPermissions,
    openWebLoginWindow,
} from "./personal-accounts"
import { humanizePersonalError } from "./error-messages"

const BLOCKED_OPEN_EXTENSIONS = new Set([
    ".exe",
    ".bat",
    ".cmd",
    ".com",
    ".ps1",
    ".vbs",
    ".vbe",
    ".js",
    ".jse",
    ".wsf",
    ".wsh",
    ".msi",
    ".msp",
    ".scr",
    ".hta",
    ".pif",
    ".dll",
    ".reg",
    ".jar",
])

function escapeRegexLiteral(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildMigratedQuery(
    rule: StoredRule,
    scope: { sids?: number[]; gid?: number }
): ArchiveQuery {
    if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
        const conds = rule.conditions.filter(
            c => c && typeof c.value === "string" && c.value.trim()
        )
        if (conds.length > 0) {
            const fields = new Set(conds.map(c => c.field))
            const field: ArchiveQuery["field"] =
                fields.size === 1 ? conds[0].field : "full"
            const caseSensitive = conds.some(c => Boolean(c.caseSensitive))
            const hasRegex = conds.some(c => c.operator === "regex")

            if (hasRegex) {
                if (conds.length === 1 && conds[0].operator === "regex") {
                    const pat = conds[0].value.trim()
                    try {
                        new RegExp(pat, "u")
                        return {
                            include: "",
                            exclude: "",
                            all: false,
                            field,
                            caseSensitive,
                            regex:
                                rule.match === false
                                    ? `^(?![\\s\\S]*(?:${pat}))[\\s\\S]*$`
                                    : pat,
                            ...scope,
                        }
                    } catch {
                        // Fall through to literal fallback if invalid in unicode mode.
                    }
                }
                try {
                    const parts = conds.map(c => {
                        const v = c.value.trim()
                        if (c.operator === "regex") return `(?:${v})`
                        const lit = escapeRegexLiteral(v)
                        return c.operator === "notContains"
                            ? `^(?![\\s\\S]*${lit})[\\s\\S]*$`
                            : lit
                    })
                    const combined =
                        (rule.logic || "all") === "any"
                            ? parts.join("|")
                            : parts.map(p => `(?=[\\s\\S]*${p})`).join("") +
                              "[\\s\\S]*"
                    new RegExp(combined, "u")
                    return {
                        include: "",
                        exclude: "",
                        all: false,
                        field,
                        caseSensitive,
                        regex: combined,
                        ...scope,
                    }
                } catch {
                    // Fall back to literal contains/notContains below.
                }
            }

            const containsVals = conds
                .filter(c => c.operator !== "notContains")
                .map(c => c.value.trim())
            const notContainsVals = conds
                .filter(c => c.operator === "notContains")
                .map(c => c.value.trim())

            if (rule.match === false && !notContainsVals.length) {
                return {
                    include: "",
                    exclude: containsVals.join(", "),
                    all: false,
                    field,
                    caseSensitive,
                    ...scope,
                }
            }
            return {
                include: containsVals.join(", "),
                exclude: notContainsVals.join(", "),
                all: (rule.logic || "all") === "all",
                field,
                caseSensitive,
                ...scope,
            }
        }
    }

    const filter = Number(rule.filter) || 0
    const field: ArchiveQuery["field"] =
        filter & (1 << 3)
            ? "full"
            : filter & (1 << 5)
            ? "author"
            : filter & (1 << 9)
            ? "body"
            : "title"
    const caseSensitive = filter > 0 ? !(filter & (1 << 4)) : false
    const isKeyword = Boolean(filter & (1 << 6))
    const isExclude = Boolean(filter & (1 << 8)) !== (rule.match === false)
    const search = String(rule.search || "").trim()

    if (isKeyword || !search) {
        const keywords = search
            .split(/[\s,，;；]+/)
            .filter(Boolean)
            .join(", ")
        return {
            include: isExclude ? "" : keywords,
            exclude: isExclude ? keywords : "",
            all: !isExclude && Boolean(filter & (1 << 7)),
            field,
            caseSensitive,
            ...scope,
        }
    }

    try {
        const regex = isExclude
            ? `^(?![\\s\\S]*(?:${search}))[\\s\\S]*$`
            : search
        new RegExp(regex, "u")
        return {
            include: "",
            exclude: "",
            all: false,
            field,
            caseSensitive,
            regex,
            ...scope,
        }
    } catch {
        return {
            include: isExclude ? "" : search,
            exclude: isExclude ? search : "",
            all: false,
            field,
            caseSensitive,
            ...scope,
        }
    }
}

export function migrateStoredRulesToArchiveRules(
    sqlite: Database.Database,
    storedRules: StoredRules,
    groups: SourceGroup[] = []
): ArchiveRule[] {
    const out: ArchiveRule[] = []
    if (!storedRules || typeof storedRules !== "object") return out

    const sourceNames = new Map<number, string>(
        (
            sqlite.prepare("SELECT sid,name FROM sources").all() as {
                sid: number
                name: string
            }[]
        ).map(s => [s.sid, s.name])
    )
    const groupNames = new Map<number, string>(
        (groups || []).map(g => [g.gid, g.name || `分组 #${g.gid}`])
    )

    for (const [targetKey, rules] of Object.entries(storedRules)) {
        if (!Array.isArray(rules) || !rules.length) continue
        let scope: { sids?: number[]; gid?: number } = {}
        let scopePrefix = ""
        if (targetKey === "all") {
            scope = {}
        } else if (targetKey.startsWith("source:")) {
            const sid = Number(targetKey.slice(7))
            if (!Number.isSafeInteger(sid)) continue
            scope = { sids: [sid] }
            scopePrefix = sourceNames.get(sid) || `订阅源 #${sid}`
        } else if (targetKey.startsWith("group:")) {
            const gid = Number(targetKey.slice(6))
            if (!Number.isSafeInteger(gid)) continue
            scope = { gid }
            scopePrefix = groupNames.get(gid) || `分组 #${gid}`
        } else {
            continue
        }

        for (let idx = 0; idx < rules.length; idx++) {
            const rule = rules[idx]
            if (!rule || typeof rule !== "object") continue
            try {
                const query = buildMigratedQuery(rule, scope)
                const primaryActions: ArchiveAction[] = []
                let wantNotify = false
                let wantOffline = false

                for (const rawKey of rule.actions || []) {
                    const [code, flagStr] = String(rawKey).split("-")
                    const flag = flagStr ? flagStr === "true" : true
                    if (code === "r") {
                        primaryActions.push({ kind: flag ? "read" : "unread" })
                    } else if (code === "s") {
                        primaryActions.push({ kind: flag ? "star" : "unstar" })
                    } else if (code === "h") {
                        primaryActions.push({
                            kind: flag ? "hide" : "restore",
                        })
                    } else if (code === "l") {
                        primaryActions.push({
                            kind: flag ? "later" : "unlater",
                        })
                    } else if (code === "n" && flag) {
                        wantNotify = true
                    } else if (code === "o" && flag) {
                        wantOffline = true
                    }
                }

                for (const tag of rule.tags || []) {
                    if (typeof tag === "string" && tag.startsWith("主题/")) {
                        const folderName = tag.slice(3).trim()
                        if (!folderName) continue
                        let folder = sqlite
                            .prepare(
                                "SELECT id FROM article_folders WHERE (legacyName=? OR (parentId IS NULL AND name=?)) AND deleted=0"
                            )
                            .get(folderName, folderName) as
                            | { id: number }
                            | undefined
                        if (!folder) {
                            const inserted = sqlite
                                .prepare(
                                    "INSERT INTO article_folders(name,legacyName) VALUES(?,?)"
                                )
                                .run(folderName, folderName)
                            folder = { id: Number(inserted.lastInsertRowid) }
                        }
                        primaryActions.push({
                            kind: "folder",
                            folderId: folder.id,
                        })
                    }
                }

                const highlight =
                    typeof rule.highlight === "string" && rule.highlight.trim()
                        ? rule.highlight.trim().slice(0, 64)
                        : undefined

                let finalActions: ArchiveAction[] = []
                if (primaryActions.length > 0) {
                    finalActions = primaryActions.map((act, i) =>
                        i === 0
                            ? {
                                  ...act,
                                  ...(highlight ? { highlight } : {}),
                                  ...(wantNotify ? { notify: true } : {}),
                                  ...(wantOffline ? { autoOffline: true } : {}),
                              }
                            : act
                    )
                } else if (highlight) {
                    finalActions = [
                        {
                            kind: "highlight" as ArchiveActionKind,
                            highlight,
                            ...(wantNotify ? { notify: true } : {}),
                            ...(wantOffline ? { autoOffline: true } : {}),
                        },
                    ]
                } else if (wantNotify) {
                    finalActions = [
                        {
                            kind: "notify" as ArchiveActionKind,
                            notify: true,
                            ...(wantOffline ? { autoOffline: true } : {}),
                        },
                    ]
                } else if (wantOffline) {
                    finalActions = [
                        {
                            kind: "offline" as ArchiveActionKind,
                            autoOffline: true,
                        },
                    ]
                }

                if (!finalActions.length) continue

                const summarySeed =
                    query.include ||
                    query.regex ||
                    query.exclude ||
                    `规则 ${idx + 1}`
                const baseLabel = scopePrefix
                    ? `${scopePrefix} · ${summarySeed}`
                    : String(summarySeed)

                for (let aIdx = 0; aIdx < finalActions.length; aIdx++) {
                    const suffix =
                        finalActions.length > 1 ? ` (${aIdx + 1})` : ""
                    const name = (
                        baseLabel.slice(0, 110 - suffix.length).trim() ||
                        `自动规则 ${idx + 1}`
                    ).concat(suffix)
                    out.push({
                        id: randomUUID(),
                        name,
                        enabled: rule.enabled !== false,
                        query,
                        action: finalActions[aIdx],
                    })
                }
            } catch (err) {
                console.warn("Skipping malformed legacy rule:", err)
            }
        }
    }
    return out
}

export function runPersonalStartupMigrations(
    sqlite: Database.Database,
    store: Store<SchemaTypes>,
    archive: ArticleArchive,
    prefStore: PersonalPreferencesStore
) {
    try {
        archive.syncLegacyTopics()
        prefStore.migrateLegacyFolderReadingPreferences()
    } catch (err) {
        console.warn("Legacy folder migration warning:", err)
    }
    try {
        if (!store.get("tagsCleaned")) {
            sqlite
                .prepare("UPDATE items SET tags='[]' WHERE tags <> '[]'")
                .run()
            store.set("tagsCleaned", true)
        }
    } catch (err) {
        console.warn("One-time tag cleanup warning:", err)
    }
    try {
        if (!store.get("sourceRulesMigrated")) {
            const rawRules = store.get("sourceRules", {})
            if (rawRules && Object.keys(rawRules).length > 0) {
                ;(store as any).set("legacySourceRulesBackup", rawRules)
                const migrated = migrateStoredRulesToArchiveRules(
                    sqlite,
                    rawRules,
                    store.get("sourceGroups", [])
                )
                if (migrated.length > 0) {
                    const stmt = sqlite.prepare(
                        "INSERT OR IGNORE INTO archive_rules(id,spec) VALUES(?,?)"
                    )
                    sqlite.transaction(() => {
                        for (const rule of migrated) {
                            stmt.run(rule.id, JSON.stringify(rule))
                        }
                    })()
                }
                store.set("sourceRules", {})
            }
            store.set("sourceRulesMigrated", true)
        }
    } catch (err) {
        console.warn("Legacy sourceRules migration warning:", err)
    }
}

export function initPersonal(
    sqlite: Database.Database,
    store: Store<SchemaTypes>,
    manager: WindowManager
) {
    const changed = () => {
        if (
            manager.hasWindow() &&
            !manager.mainWindow.webContents.isDestroyed()
        ) {
            manager.mainWindow.webContents.send("personal:changed")
        }
    }
    const getLocale = () => store.get("locale", app.getLocale() || "zh-CN")
    const formatErr = (msg: string) =>
        msg ? humanizePersonalError(msg, getLocale()) : ""

    const prefStore = new PersonalPreferencesStore(sqlite, store, changed)
    const settings = prefStore.settings
    const preferences = prefStore.preferences
    const sourcePreferences = prefStore.sourcePreferences

    const queue = new DomainQueue(settings)
    const index = new SearchIndex(sqlite)
    const backups = new Backups(sqlite, store, settings, changed)
    const fullText = new FullText(
        sqlite,
        queue,
        settings,
        sourcePreferences,
        changed
    )
    const offline = new OfflinePages(
        sqlite,
        queue,
        settings,
        sourcePreferences,
        changed
    )
    const subscriptions = new Subscriptions(sqlite, queue, settings)
    const linuxdo = new LinuxDo(queue, store, url =>
        subscriptions.request(url, true)
    )
    app.on("browser-window-created", (_, win) => {
        win.once("closed", () => {
            if (win === manager.mainWindow) linuxdo.close()
        })
    })
    subscriptions.specialFeed = address => {
        const path = linuxDoJSONPath(address)
        if (path) return linuxdo.feed(path)
        if (address === LINUXDO + "/top.rss?period=daily#fluent-ranking")
            return linuxdo.ranking(LINUXDO + "/top.rss?period=daily")
        return null
    }
    const ai = new AI(sqlite, store, queue, sourcePreferences, changed)
    const archive = new ArticleArchive(
        sqlite,
        gid =>
            store.get("sourceGroups", []).find(g => g.gid === gid)?.sids || [],
        changed
    )

    runPersonalStartupMigrations(sqlite, store, archive, prefStore)

    const sendNotificationForItem = (id: number): boolean => {
        if (!Number.isSafeInteger(id)) throw new Error("无效的文章。")
        const item = sqlite
            .prepare(
                "SELECT i.title,s.name FROM items i JOIN sources s ON s.sid=i.source WHERE i._id=?"
            )
            .get(id) as { title: string; name: string } | undefined
        if (!item || !Notification.isSupported()) return false
        const notice = new Notification({
            title: item.title,
            body: item.name,
        })
        notice.on("click", () => {
            if (
                manager.hasWindow() &&
                !manager.mainWindow.webContents.isDestroyed()
            ) {
                if (manager.mainWindow.isMinimized())
                    manager.mainWindow.restore()
                manager.mainWindow.show()
                manager.mainWindow.focus()
                manager.mainWindow.webContents.send("personal:openArticle", id)
            }
        })
        notice.show()
        return true
    }

    const triggerActionSideEffects = (
        targetIds: number[],
        action: ArchiveAction
    ) => {
        if (!targetIds.length) return
        if (action.kind === "notify" || action.notify) {
            for (const id of targetIds.slice(0, 5)) {
                try {
                    sendNotificationForItem(id)
                } catch {
                    // Ignore notification failure for batch actions.
                }
            }
        }
        if (action.kind === "offline" || action.autoOffline) {
            for (const id of targetIds) {
                void offline.save(id).catch(err => {
                    console.warn(
                        `Batch offline save failed for item ${id}:`,
                        err
                    )
                })
            }
        }
    }

    const cancelledPendingRequests = new Set<string>()
    const handlers = {
        archiveFolders: () => archive.folders(),
        archiveMemberships: (id: number) => archive.memberships(id),
        archiveSaveFolder: (
            folder: Parameters<ArticleArchive["saveFolder"]>[0]
        ) => archive.saveFolder(folder),
        archiveDeleteFolder: (id: number, moveTo: number | null) =>
            archive.deleteFolder(id, moveTo),
        archiveNote: (id: number) => archive.note(id),
        archiveSaveNote: (id: number, text: string, version: number) =>
            archive.saveNote(id, text, version),
        archivePreview: (query: ArchiveQuery) => archive.preview(query),
        archiveApplyPreview: (
            token: string,
            excluded: number[],
            action: ArchiveAction
        ) => {
            const res = archive.applyPreview(token, excluded, action)
            triggerActionSideEffects(
                res.changes.map(c => c.id),
                action
            )
            return res
        },
        archiveApply: (ids: number[], action: ArchiveAction) => {
            const res = archive.apply(ids, action)
            triggerActionSideEffects(ids, action)
            return res
        },
        archiveUndo: (id: string) => archive.undo(id),
        archiveRules: () => archive.rules(),
        archiveSaveRule: (rule: ArchiveRule) => archive.saveRule(rule),
        archiveDeleteRule: (id: string) => archive.deleteRule(id),
        archiveRetireSource: (id: number) => archive.retireSource(id),
        discover: (url: string) => subscriptions.discover(String(url)),
        feedText: (url: string) => subscriptions.feed(String(url)),
        linuxDoCatalog: (kind: "categories" | "tags", query: string) =>
            linuxdo.catalog(kind, query),
        linuxDoAccount: () => linuxdo.account(),
        linuxDoOpen: () => linuxdo.open(),
        linuxDoReplies: (url: string) => linuxdo.replies(String(url || "")),
        health: () => subscriptions.health(),
        checkHealth: () => subscriptions.check(),
        reportFetch: (sid: number, error: string) =>
            subscriptions.report(sid, error),
        applyRedirect: (sid: number) => subscriptions.applyRedirect(sid),
        opened: (id: number) => subscriptions.opened(id),
        aiSettings: () => ai.settings(),
        saveAI: (config: AIConfig, key?: string) => ai.save(config, key),
        aiSaveProfile: (
            profile: Parameters<AI["saveProfile"]>[0],
            key?: string,
            removeKey = false
        ) => ai.saveProfile(profile, key, !!removeKey),
        aiSelectProfile: (id: string) => ai.selectProfile(String(id || "")),
        aiDeleteProfile: (id: string) => ai.deleteProfile(String(id || "")),
        aiModels: (baseURL: string, key?: string, profileId?: string) =>
            ai.listModels(String(baseURL || ""), key, profileId),
        testAI: () => ai.test(),
        aiGenerate: async (
            id: number,
            kind: AIKind,
            force = false,
            requestId = ""
        ) => {
            const reqId = typeof requestId === "string" ? requestId.trim() : ""
            if (reqId && cancelledPendingRequests.has(reqId)) {
                cancelledPendingRequests.delete(reqId)
                throw new Error("AI 请求已取消。")
            }
            if (kind === "translation") {
                const item = sqlite
                    .prepare("SELECT source FROM items WHERE _id=?")
                    .get(id) as { source: number } | undefined
                if (
                    item &&
                    sourcePreferences(item.source).fetchMode !== "off"
                ) {
                    try {
                        await fullText.get(id)
                    } catch {
                        // Fall back to RSS or offline content when live full-text fails.
                    }
                }
            }
            if (reqId && cancelledPendingRequests.has(reqId)) {
                cancelledPendingRequests.delete(reqId)
                throw new Error("AI 请求已取消。")
            }
            return ai.generate(
                id,
                kind,
                !!force,
                reqId,
                reqId
                    ? ev => {
                          if (
                              manager.hasWindow() &&
                              !manager.mainWindow.webContents.isDestroyed()
                          ) {
                              manager.mainWindow.webContents.send(
                                  "personal:aiStream",
                                  ev
                              )
                          }
                      }
                    : undefined
            )
        },
        aiCancel: (requestId: string) => {
            const reqId = String(requestId || "").trim()
            if (!reqId) return false
            const abortedActive = ai.cancel(reqId)
            if (!abortedActive) {
                cancelledPendingRequests.add(reqId)
                if (cancelledPendingRequests.size > 200) {
                    const oldest = cancelledPendingRequests
                        .values()
                        .next().value
                    if (oldest) cancelledPendingRequests.delete(oldest)
                }
            }
            return true
        },
        aiTranslateSelection: (text: string) =>
            ai.translateSelection(String(text || "")),
        aiArticleState: (id: number) => ai.articleState(id),
        aiUsage: () => {
            const u = ai.usage()
            return { ...u, error: formatErr(u.error) }
        },
        briefings: () => ai.briefings(),
        createBriefing: () => ai.brief(),
        deleteBriefing: (id: number) => {
            const res = ai.deleteBriefing(id)
            changed()
            return res
        },
        library: () => {
            const rawTasks = offline.tasksByItem()
            const offlineTasks: Record<number, OfflineTask> = {}
            for (const [k, t] of Object.entries(rawTasks)) {
                offlineTasks[Number(k)] = { ...t, error: formatErr(t.error) }
            }
            const notedIds = (
                sqlite
                    .prepare(
                        "SELECT itemId FROM article_notes WHERE trim(text)<>''"
                    )
                    .all() as { itemId: number }[]
            ).map(r => r.itemId)
            const folderedIds = (
                sqlite
                    .prepare("SELECT DISTINCT itemId FROM folder_articles")
                    .all() as { itemId: number }[]
            ).map(r => r.itemId)
            return {
                saved: offline.savedIds(),
                notedIds,
                folderedIds,
                offlineTasks,
                removeLaterOnRead: settings().removeLaterOnRead,
                aiConfigured: ai.settings().configured,
                titles: ai.titles(),
            }
        },
        saveOffline: (id: number) => offline.save(id),
        openOffline: (id: number, reveal: boolean) =>
            offline.open(id, !!reveal),
        deleteOffline: (id: number) => offline.remove(id),
        openPath: async (targetPath: string) => {
            const defaultOffline = path.resolve(
                path.join(app.getPath("userData"), "offline")
            )
            const raw = String(targetPath || "").trim()
            const resolved =
                !raw || raw === "default-offline"
                    ? defaultOffline
                    : path.resolve(raw)
            let stat: Awaited<ReturnType<typeof fs.stat>>
            try {
                stat = await fs.stat(resolved)
            } catch (err) {
                if (
                    (err as NodeJS.ErrnoException)?.code === "ENOENT" &&
                    resolved === defaultOffline
                ) {
                    await fs.mkdir(resolved, { recursive: true })
                    stat = await fs.stat(resolved)
                } else {
                    throw new Error("所选文件夹或文件不存在。")
                }
            }
            if (stat.isFile()) {
                const ext = path.extname(resolved).toLowerCase()
                if (BLOCKED_OPEN_EXTENSIONS.has(ext)) {
                    throw new Error("出于安全考虑，不允许直接打开可执行文件。")
                }
            }
            const openError = await shell.openPath(resolved)
            if (openError) throw new Error(openError)
            return true
        },
        previewExtraction: (url: string, rule?: Partial<SiteExtractionRule>) =>
            fullText.preview(String(url || ""), rule),
        tags: () =>
            (
                sqlite
                    .prepare(
                        "SELECT DISTINCT value FROM items,json_each(items.tags) WHERE items.tags <> '[]' AND json_each.type='text' ORDER BY value COLLATE NOCASE"
                    )
                    .all() as { value: string }[]
            ).map(row => row.value),
        preferences,
        savePreferences: (
            target: { sids: number[] } | { gid: number },
            patch: Partial<SourcePreferences>,
            clear: (keyof SourcePreferences)[] = [],
            clearChildSources = false
        ) =>
            prefStore.savePreferences(
                target,
                patch,
                clear,
                !!clearChildSources
            ),
        afterInsert: async (ids: number[]) => {
            if (
                !Array.isArray(ids) ||
                ids.length > 10000 ||
                ids.some(id => !Number.isSafeInteger(id))
            )
                throw new Error("新文章列表数据无效，请刷新重试。")
            const ruleEffects = await archive.afterInsert(ids)
            const notifySet = new Set(ruleEffects?.notifyIds || [])
            const offlineSet = new Set(ruleEffects?.offlineIds || [])
            let notifiedCount = 0

            const getItemStmt = sqlite.prepare(
                "SELECT source,saveRequested FROM items WHERE _id=?"
            )
            for (const id of ids) {
                try {
                    const item = getItemStmt.get(id) as
                        | { source: number; saveRequested: number }
                        | undefined
                    if (!item) continue
                    if (notifySet.has(id) && notifiedCount < 5) {
                        notifiedCount++
                        try {
                            sendNotificationForItem(id)
                        } catch {
                            // Ignore desktop notification errors during sync.
                        }
                    }
                    const prefs = sourcePreferences(item.source)
                    const willFetchFull =
                        prefs.autoFullText && prefs.fetchMode !== "off"
                    ai.auto(id, { skipSummary: willFetchFull })
                    if (willFetchFull) {
                        void fullText
                            .get(id)
                            .catch(err => {
                                console.warn(
                                    `Auto full-text failed for item ${id}:`,
                                    err
                                )
                                changed()
                            })
                            .finally(() => {
                                ai.auto(id, { skipTitle: true })
                            })
                    }
                    if (
                        prefs.offlineEnabled &&
                        (prefs.autoOffline ||
                            item.saveRequested ||
                            offlineSet.has(id))
                    ) {
                        void offline.save(id).catch(err => {
                            console.warn(
                                `Auto offline save failed for item ${id}:`,
                                err
                            )
                        })
                    }
                } catch (err) {
                    console.warn(`afterInsert hook warning for ${id}:`, err)
                }
            }
            return true
        },
        notifyItem: (id: number) => sendNotificationForItem(id),
        settings: () => settings(),
        saveSettings: (value: PersonalSettings) =>
            prefStore.saveSettings(value),
        chooseFolder: async () => {
            const choice = await dialog.showOpenDialog({
                properties: ["openDirectory", "createDirectory"],
            })
            return choice.canceled ? null : choice.filePaths[0]
        },
        status: () => ({
            index: {
                ...index.progress,
                error: formatErr(index.progress.error),
            },
            tasks: queue.snapshot().map(t => ({
                ...t,
                error: formatErr(t.error),
            })),
            queueSummary: queue.summary(),
            backupRunning: backups.running,
            backupError: formatErr(backups.error),
            backupWarning: formatErr(backups.warning),
            aiError: formatErr(ai.error),
            offline: offline.snapshot().map(t => ({
                ...t,
                error: formatErr(t.error),
            })),
        }),
        search: (query: string, offset: number) =>
            index.search(String(query), offset),
        rebuildIndex: () => {
            index.start(true)
            return true
        },
        backup: () => backups.create(),
        restore: () => backups.restore(),
        fullText: (
            id: number,
            force: boolean,
            mode?: "direct" | "rendered",
            collection?: string
        ) => {
            if (
                !Number.isSafeInteger(id) ||
                (mode && !["direct", "rendered"].includes(mode))
            )
                throw new Error("无效的全文抓取请求。")
            const collectionOverride =
                !!collectionKey(collection || "") &&
                store.get("readingPreferences")?.collections?.[collection]
                    ?.openTarget === 3
            return fullText.get(id, !!force, mode, collectionOverride)
        },
        accounts: async () => {
            const rawAccounts = await listWebAccounts()
            const sourceUrls = (
                sqlite.prepare("SELECT url FROM sources").all() as {
                    url: string
                }[]
            ).map(r => r.url)
            return enrichWebAccounts(
                rawAccounts,
                settings().loginHosts || [],
                sourceUrls
            )
        },
        clearAccount: async (host: string) => {
            const ok = await clearWebAccount(host)
            prefStore.removeLoginHost(host)
            changed()
            return ok
        },
        login: async (address: string) => {
            prefStore.addLoginHost(address)
            return openWebLoginWindow(address, changed)
        },
    }

    for (const [name, handler] of Object.entries(handlers)) {
        ipcMain.handle("personal:" + name, async (event, ...args) => {
            if (
                !manager.hasWindow() ||
                event.sender !== manager.mainWindow.webContents ||
                event.senderFrame !== event.sender.mainFrame
            )
                return { ok: false, error: "Untrusted request." }
            try {
                return {
                    ok: true,
                    data: await (handler as (...args: unknown[]) => unknown)(
                        ...args
                    ),
                }
            } catch (error) {
                const raw =
                    error instanceof Error ? error.message : String(error)
                const msg = humanizePersonalError(raw, getLocale())
                return { ok: false, error: msg.slice(0, 1000) }
            }
        })
    }

    app.whenReady().then(() => {
        lockWebPartitionPermissions()
        index.start()
        void backups.scheduled()
        void ai.scheduled()
        const timer = setInterval(() => {
            void backups.scheduled()
            void ai.scheduled()
        }, 60000)
        timer.unref()
        app.once("will-quit", () => {
            clearInterval(timer)
            index.stop()
            archive.close()
        })
    })

    return {
        resetAfterImport: () => {
            try {
                prefStore.ensureInitialSourcePreferences()
                runPersonalStartupMigrations(sqlite, store, archive, prefStore)
                offline.clearTasks()
                index.start(true)
                changed()
            } catch (err) {
                console.warn("Personal state reset warning:", err)
            }
        },
    }
}
