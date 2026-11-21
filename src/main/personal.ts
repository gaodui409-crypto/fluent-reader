import { app, dialog, ipcMain, session, Notification } from "electron"
import {
    defaultSourcePreferences,
    PreferenceOverrides,
    resolveSourcePreferences,
    SourcePreferences,
    validateSourcePreferences,
} from "../source-preferences"
import type Database from "better-sqlite3"
import type Store from "electron-store"
import type { SchemaTypes } from "../schema-types"
import { defaultPersonalSettings, PersonalSettings } from "../personal-types"
import type { WindowManager } from "./window"
import { DomainQueue, httpURL } from "./domain-queue"
import { SearchIndex } from "./search-index"
import { Backups } from "./backup"
import { FullText, secureWebWindow, WEB_PARTITION } from "./web-content"
import { OfflinePages } from "./offline"
import { Subscriptions } from "./subscriptions"
import { AI } from "./ai"
import type { AIConfig, AIKind } from "../personal-types"
import { ArticleArchive } from "./archive"
import type { ArchiveAction, ArchiveQuery, ArchiveRule } from "../archive-types"
import { collectionKey } from "../reading-preferences"
import { LinuxDo } from "./linuxdo"
import { linuxDoJSONPath, LINUXDO } from "../linuxdo"

export function initPersonal(
    sqlite: Database.Database,
    store: Store<SchemaTypes>,
    manager: WindowManager
) {
    const settings = (): PersonalSettings => ({
        ...defaultPersonalSettings,
        ...store.get("personal", {} as PersonalSettings),
    })
    const queue = new DomainQueue(settings)
    const preferences = (): PreferenceOverrides =>
        store.get("sourcePreferences", { sources: {}, groups: {} })
    if (!store.has("sourcePreferences")) {
        const initial: PreferenceOverrides = { sources: {}, groups: {} }
        const sources = sqlite
            .prepare("SELECT sid,openTarget,fetchFrequency FROM sources")
            .all() as {
            sid: number
            openTarget: number
            fetchFrequency: number
        }[]
        for (const source of sources) {
            const values: Partial<SourcePreferences> = {}
            if (source.openTarget) values.openTarget = source.openTarget
            if (source.fetchFrequency)
                values.fetchFrequency = source.fetchFrequency
            if (Object.keys(values).length) initial.sources[source.sid] = values
        }
        store.set("sourcePreferences", initial)
    }
    const sourcePreferences = (sid: number) => {
        const source = sqlite
            .prepare(
                "SELECT sid,openTarget,fetchFrequency FROM sources WHERE sid=?"
            )
            .get(sid) as {
            sid: number
            openTarget: number
            fetchFrequency: number
        }
        if (!source) throw new Error("The subscription no longer exists.")
        return resolveSourcePreferences(
            source,
            store.get("sourceGroups", []),
            preferences()
        )
    }
    const index = new SearchIndex(sqlite)
    const backups = new Backups(sqlite, store, settings)
    const fullText = new FullText(sqlite, queue, settings, sourcePreferences)
    const changed = () => {
        if (manager.hasWindow())
            manager.mainWindow.webContents.send("personal:changed")
    }
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
    archive.syncLegacyTopics()
    // Transfer collection preferences by the immutable legacy name; migration is
    // idempotent and does not replace preferences already chosen for the new ID.
    const reading = store.get("readingPreferences")
    if (reading) {
        const next = { ...reading, collections: { ...reading.collections } }
        for (const folder of sqlite
            .prepare(
                "SELECT id,legacyName FROM article_folders WHERE legacyName IS NOT NULL"
            )
            .all() as { id: number; legacyName: string }[]) {
            const old = next.collections["tag:主题/" + folder.legacyName]
            if (old && !next.collections["folder:" + folder.id])
                next.collections["folder:" + folder.id] = old
        }
        store.set("readingPreferences", next)
    }
    const handlers = {
        archiveFolders: () => archive.folders(),
        archiveMemberships: (id: number) =>
            (
                sqlite
                    .prepare(
                        "SELECT fa.folderId FROM folder_articles fa JOIN article_folders f ON f.id=fa.folderId WHERE fa.itemId=? AND f.deleted=0"
                    )
                    .all(id) as { folderId: number }[]
            ).map(r => r.folderId),
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
        ) => archive.applyPreview(token, excluded, action),
        archiveApply: (ids: number[], action: ArchiveAction) =>
            archive.apply(ids, action),
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
        health: () => subscriptions.health(),
        checkHealth: () => subscriptions.check(),
        reportFetch: (sid: number, error: string) =>
            subscriptions.report(sid, error),
        applyRedirect: (sid: number) => subscriptions.applyRedirect(sid),
        opened: (id: number) => subscriptions.opened(id),
        aiSettings: () => ai.settings(),
        saveAI: (config: AIConfig, key?: string) => ai.save(config, key),
        testAI: () => ai.test(),
        aiGenerate: async (id: number, kind: AIKind) => {
            if (kind === "translation") {
                const item = sqlite
                    .prepare("SELECT source FROM items WHERE _id=?")
                    .get(id) as { source: number } | undefined
                if (item && sourcePreferences(item.source).fetchMode !== "off")
                    await fullText.get(id)
            }
            return ai.generate(id, kind)
        },
        aiUsage: () => ai.usage(),
        briefings: () => ai.briefings(),
        createBriefing: () => ai.brief(),
        library: () => ({
            saved: offline.savedIds(),
            removeLaterOnRead: settings().removeLaterOnRead,
            aiConfigured: ai.settings().configured,
            titles: ai.titles(),
        }),
        saveOffline: (id: number) => offline.save(id),
        openOffline: (id: number, reveal: boolean) =>
            offline.open(id, !!reveal),
        tags: () =>
            (
                sqlite
                    .prepare(
                        "SELECT DISTINCT value FROM items,json_each(items.tags) WHERE json_each.type='text' ORDER BY value COLLATE NOCASE"
                    )
                    .all() as { value: string }[]
            ).map(row => row.value),
        preferences,
        savePreferences: (
            target: { sids: number[] } | { gid: number },
            patch: Partial<SourcePreferences>,
            clear: (keyof SourcePreferences)[] = []
        ) => {
            const valid = validateSourcePreferences(patch)
            if (
                !Array.isArray(clear) ||
                clear.some(key => !(key in defaultSourcePreferences))
            )
                throw new Error("Invalid preference reset.")
            const stored = preferences()
            const next: PreferenceOverrides = {
                sources: { ...stored.sources },
                groups: { ...stored.groups },
            }
            const sids = "sids" in target ? target.sids : null
            if (
                sids &&
                (!Array.isArray(sids) || !sids.length || sids.length > 1000)
            )
                throw new Error("Invalid source selection.")
            const ids = sids || [target["gid"]]
            const map = sids ? next.sources : next.groups
            for (const id of ids) {
                if (
                    !Number.isSafeInteger(id) ||
                    (sids
                        ? !sqlite
                              .prepare("SELECT sid FROM sources WHERE sid=?")
                              .get(id)
                        : !store
                              .get("sourceGroups", [])
                              .some(
                                  group => group.gid === id && group.isMultiple
                              ))
                )
                    throw new Error(
                        "The selected subscription or group no longer exists."
                    )
                const values = { ...map[id], ...valid }
                for (const key of clear) delete values[key]
                map[id] = values
            }
            store.set("sourcePreferences", next)
            changed()
            return next
        },
        afterInsert: async (ids: number[]) => {
            if (
                !Array.isArray(ids) ||
                ids.length > 10000 ||
                ids.some(id => !Number.isSafeInteger(id))
            )
                throw new Error("Invalid article list.")
            await archive.afterInsert(ids)
            for (const id of ids) {
                const item = sqlite
                    .prepare(
                        "SELECT source,saveRequested FROM items WHERE _id=?"
                    )
                    .get(id) as { source: number; saveRequested: number }
                if (!item) continue
                const prefs = sourcePreferences(item.source)
                ai.auto(id)
                if (prefs.autoFullText && prefs.fetchMode !== "off")
                    void fullText.get(id).catch(() => {})
                if (
                    prefs.offlineEnabled &&
                    (prefs.autoOffline || item.saveRequested)
                )
                    void offline.save(id).catch(() => {})
            }
            return true
        },
        notifyItem: (id: number) => {
            if (!Number.isSafeInteger(id)) throw new Error("Invalid article.")
            const item = sqlite
                .prepare(
                    "SELECT i.title,s.name FROM items i JOIN sources s ON s.sid=i.source WHERE i._id=?"
                )
                .get(id) as { title: string; name: string }
            if (!item || !Notification.isSupported()) return false
            const notice = new Notification({
                title: item.title,
                body: item.name,
            })
            notice.on("click", () => {
                if (manager.hasWindow()) {
                    manager.mainWindow.show()
                    manager.mainWindow.focus()
                    manager.mainWindow.webContents.send(
                        "personal:openArticle",
                        id
                    )
                }
            })
            notice.show()
            return true
        },
        settings: () => settings(),
        saveSettings: (value: PersonalSettings) => {
            if (
                !value ||
                !Array.isArray(value.siteRules) ||
                value.siteRules.length > 200
            )
                throw new Error("Invalid settings.")
            const next: PersonalSettings = {
                domainInterval: Number(value.domainInterval),
                concurrency: Number(value.concurrency),
                backupFolder: String(value.backupFolder || ""),
                backupSchedule: value.backupSchedule,
                backupKeep: Number(value.backupKeep),
                lastBackup: settings().lastBackup,
                offlineFolder: String(value.offlineFolder || ""),
                removeLaterOnRead: !!value.removeLaterOnRead,
                rssHub: httpURL(
                    value.rssHub || defaultPersonalSettings.rssHub
                ).href.replace(/\/$/, ""),
                staleDays: Number(value.staleDays),
                siteRules: value.siteRules.map(rule => ({
                    host: httpURL("https://" + rule.host).hostname,
                    container: String(rule.container || "").slice(0, 2000),
                    remove: String(rule.remove || "").slice(0, 2000),
                    mode: rule.mode,
                })),
            }
            if (
                !Number.isFinite(next.domainInterval) ||
                next.domainInterval < 0 ||
                next.domainInterval > 3600 ||
                !Number.isInteger(next.concurrency) ||
                next.concurrency < 1 ||
                next.concurrency > 8 ||
                !Number.isInteger(next.backupKeep) ||
                !Number.isInteger(next.staleDays) ||
                next.staleDays < 1 ||
                next.staleDays > 3650 ||
                next.backupKeep < 1 ||
                next.backupKeep > 100 ||
                !["off", "daily", "weekly"].includes(next.backupSchedule) ||
                next.siteRules.some(
                    rule => !["direct", "rendered", "off"].includes(rule.mode)
                )
            )
                throw new Error("Settings are outside the supported range.")
            store.set("personal", next)
            changed()
            return next
        },
        chooseFolder: async () => {
            const choice = await dialog.showOpenDialog({
                properties: ["openDirectory", "createDirectory"],
            })
            return choice.canceled ? null : choice.filePaths[0]
        },
        status: () => ({
            index: index.progress,
            tasks: queue.snapshot(),
            backupRunning: backups.running,
            backupError: backups.error,
            offline: offline.snapshot(),
        }),
        search: (query: string, offset: number) =>
            index.search(String(query), offset),
        rebuildIndex: () => {
            index.start()
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
                throw new Error("Invalid article request.")
            const collectionOverride =
                !!collectionKey(collection || "") &&
                store.get("readingPreferences")?.collections?.[collection]
                    ?.openTarget === 3
            return fullText.get(id, !!force, mode, collectionOverride)
        },
        accounts: async () => {
            const cookies = await session
                .fromPartition(WEB_PARTITION)
                .cookies.get({})
            const counts = new Map<string, number>()
            cookies.forEach(cookie => {
                const host = cookie.domain.replace(/^\./, "")
                counts.set(host, (counts.get(host) || 0) + 1)
            })
            return [...counts]
                .map(([host, count]) => ({ host, count }))
                .sort((a, b) => a.host.localeCompare(b.host))
        },
        clearAccount: async (host: string) => {
            const target = httpURL("https://" + host).hostname
            const web = session.fromPartition(WEB_PARTITION)
            const cookies = await web.cookies.get({})
            for (const cookie of cookies.filter(
                c => c.domain.replace(/^\./, "") === target
            )) {
                await web.cookies.remove(
                    `${cookie.secure ? "https" : "http"}://${target}${
                        cookie.path
                    }`,
                    cookie.name
                )
            }
            for (const protocol of ["https:", "http:"])
                await web.clearStorageData({
                    origin: `${protocol}//${target}`,
                    storages: [
                        "localstorage",
                        "indexdb",
                        "serviceworkers",
                        "cachestorage",
                    ],
                })
            await web.cookies.flushStore()
            return true
        },
        login: async (address: string) => {
            const url = httpURL(
                address.includes("://") ? address : "https://" + address
            )
            const win = secureWebWindow(true)
            win.on("closed", () => {
                void session
                    .fromPartition(WEB_PARTITION)
                    .cookies.flushStore()
                    .catch(() => {})
            })
            await win.loadURL(url.origin)
            return true
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
                return { ok: false, error: String(error).slice(0, 1000) }
            }
        })
    }
    app.whenReady().then(() => {
        const web = session.fromPartition(WEB_PARTITION)
        web.setPermissionRequestHandler((_, __, callback) => callback(false))
        web.setPermissionCheckHandler(() => false)
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
        })
    })
}
