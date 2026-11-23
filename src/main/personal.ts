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
import { validateArchiveQuery } from "./archive-matcher"
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

function buildMigratedQuery(
    rule: StoredRule,
    scope: { sids?: number[]; gid?: number }
): ArchiveQuery {
    if (
        typeof rule.match !== "boolean" ||
        (rule.enabled !== undefined && typeof rule.enabled !== "boolean")
    )
        throw new Error("旧规则的启用或取反设置无效。")
    const query: ArchiveQuery = {
        include: "",
        exclude: "",
        all: false,
        field: "title",
        ...scope,
    }
    if (rule.conditions !== undefined) {
        query.conditions = rule.conditions.map(c => ({ ...c }))
        query.logic = rule.logic ?? "all"
        query.negate = rule.match === false
    } else {
        query.legacyFilter = {
            type: rule.filter,
            search: rule.search,
            match: rule.match,
        }
    }
    validateArchiveQuery(query)
    return query
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

    const rank = (key: string) =>
        key === "all" ? 0 : key.startsWith("group:") ? 1 : 2
    const entries = Object.entries(storedRules).sort(
        ([a], [b]) => rank(a) - rank(b)
    )
    for (const [targetKey, rules] of entries) {
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
            try {
                if (
                    !rule ||
                    typeof rule !== "object" ||
                    !Array.isArray(rule.actions) ||
                    rule.actions.some(
                        a =>
                            typeof a !== "string" ||
                            !/^[rshlno](?:-(?:true|false))?$/.test(a)
                    ) ||
                    (rule.tags !== undefined &&
                        (!Array.isArray(rule.tags) ||
                            rule.tags.some(t => typeof t !== "string")))
                )
                    throw new Error("旧规则的动作或标签格式损坏。")
                let query: ArchiveQuery
                let migrationError: string | undefined
                try {
                    query = buildMigratedQuery(rule, scope)
                } catch (err) {
                    migrationError =
                        "旧规则无法安全迁移，请重新设置条件：" + String(err)
                    query = {
                        include: "",
                        exclude: "",
                        all: false,
                        field: "title",
                        ...scope,
                    }
                }
                const primaryActions: ArchiveAction[] = []
                let wantNotify: boolean | undefined
                let wantOffline: boolean | undefined

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
                    } else if (code === "n") {
                        wantNotify = flag
                    } else if (code === "o") {
                        wantOffline = flag
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
                                  ...(wantNotify !== undefined
                                      ? { notify: wantNotify }
                                      : {}),
                                  ...(wantOffline !== undefined
                                      ? { autoOffline: wantOffline }
                                      : {}),
                              }
                            : act
                    )
                } else if (highlight) {
                    finalActions = [
                        {
                            kind: "highlight" as ArchiveActionKind,
                            highlight,
                            ...(wantNotify !== undefined
                                ? { notify: wantNotify }
                                : {}),
                            ...(wantOffline !== undefined
                                ? { autoOffline: wantOffline }
                                : {}),
                        },
                    ]
                } else if (wantNotify !== undefined) {
                    finalActions = [
                        {
                            kind: "notify" as ArchiveActionKind,
                            notify: wantNotify,
                            ...(wantOffline !== undefined
                                ? { autoOffline: wantOffline }
                                : {}),
                        },
                    ]
                } else if (wantOffline !== undefined) {
                    finalActions = [
                        {
                            kind: "offline" as ArchiveActionKind,
                            autoOffline: wantOffline,
                        },
                    ]
                }

                if (!finalActions.length) {
                    if (!migrationError) continue
                    finalActions = [{ kind: "notify", notify: false }]
                }

                const summarySeed =
                    query.include ||
                    query.regex ||
                    query.exclude ||
                    `规则 ${idx + 1}`
                const baseLabel = scopePrefix
                    ? `${scopePrefix} · ${summarySeed}`
                    : String(summarySeed)

                const migrationGroup =
                    finalActions.length > 1 ? randomUUID() : undefined
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
                        enabled: !migrationError && rule.enabled !== false,
                        error: migrationError,
                        migrationGroup,
                        query,
                        action: finalActions[aIdx],
                    })
                }
            } catch (err) {
                out.push({
                    id: randomUUID(),
                    name: `${scopePrefix || "全局"} · 损坏规则 ${idx + 1}`,
                    enabled: false,
                    query: {
                        include: "",
                        exclude: "",
                        all: false,
                        field: "title",
                        ...scope,
                    },
                    action: { kind: "notify", notify: false },
                    error: "旧规则无法安全迁移，请重新设置：" + String(err),
                })
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
    // SQLite and electron-store cannot share a transaction. Keep a narrow undo
    // snapshot until both post-commit settings writes have succeeded.
    const tagRows = sqlite
        .prepare("SELECT _id,tags,kept FROM items WHERE tags <> '[]'")
        .all() as { _id: number; tags: string; kept: number }[]
    const folderRows = sqlite
        .prepare("SELECT id,legacyName FROM article_folders")
        .all() as { id: number; legacyName: string | null }[]
    const memberRows = sqlite
        .prepare(
            "SELECT folderId,itemId,stamp FROM folder_articles WHERE itemId IN (SELECT value FROM json_each(?))"
        )
        .all(JSON.stringify(tagRows.map(r => r._id))) as {
        folderId: number
        itemId: number
        stamp: string
    }[]
    const previousReading = store.get("readingPreferences")
    const previousTagsCleaned = store.get("tagsCleaned")
    let committed = false
    try {
        sqlite.transaction(() => {
            archive.syncLegacyTopics()
            if (!store.get("tagsCleaned"))
                sqlite
                    .prepare("UPDATE items SET tags='[]' WHERE tags <> '[]'")
                    .run()
        })()
        committed = true
        prefStore.migrateLegacyFolderReadingPreferences()
        if (!store.get("tagsCleaned")) store.set("tagsCleaned", true)
    } catch (err) {
        if (committed) {
            sqlite.transaction(() => {
                sqlite
                    .prepare(
                        "DELETE FROM folder_articles WHERE itemId IN (SELECT value FROM json_each(?))"
                    )
                    .run(JSON.stringify(tagRows.map(r => r._id)))
                sqlite
                    .prepare(
                        "DELETE FROM article_folders WHERE id NOT IN (SELECT value FROM json_each(?))"
                    )
                    .run(JSON.stringify(folderRows.map(r => r.id)))
                for (const row of folderRows)
                    sqlite
                        .prepare(
                            "UPDATE article_folders SET legacyName=? WHERE id=?"
                        )
                        .run(row.legacyName, row.id)
                for (const row of memberRows)
                    sqlite
                        .prepare(
                            "INSERT INTO folder_articles(folderId,itemId,stamp) VALUES(?,?,?)"
                        )
                        .run(row.folderId, row.itemId, row.stamp)
                for (const row of tagRows)
                    sqlite
                        .prepare("UPDATE items SET tags=?,kept=? WHERE _id=?")
                        .run(row.tags, row.kept, row._id)
            })()
            try {
                if (previousReading === undefined)
                    store.delete("readingPreferences")
                else store.set("readingPreferences", previousReading)
            } catch {
                /* Retry at next startup. */
            }
            try {
                if (previousTagsCleaned === undefined)
                    store.delete("tagsCleaned")
                else store.set("tagsCleaned", previousTagsCleaned)
            } catch {
                /* The original failed store write has not persisted a success flag. */
            }
        }
        console.warn("Legacy folder migration warning (will retry):", err)
        return
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
        if (
            action.notify !== false &&
            (action.kind === "notify" || action.notify)
        ) {
            for (const id of targetIds.slice(0, 5)) {
                try {
                    sendNotificationForItem(id)
                } catch {
                    // Ignore notification failure for batch actions.
                }
            }
        }
        if (
            action.autoOffline !== false &&
            (action.kind === "offline" || action.autoOffline)
        ) {
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
            const offlineSet = new Set(ruleEffects?.offlineIds || [])
            let notifiedCount = 0

            const getItemStmt = sqlite.prepare(
                "SELECT source,saveRequested,notify FROM items WHERE _id=?"
            )
            for (const id of new Set(ids)) {
                try {
                    const item = getItemStmt.get(id) as
                        | {
                              source: number
                              saveRequested: number
                              notify: number
                          }
                        | undefined
                    if (!item) continue
                    if (item.notify && notifiedCount < 5) {
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
