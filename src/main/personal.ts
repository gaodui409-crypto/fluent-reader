import { app, dialog, ipcMain, Notification } from "electron"
import type { SourcePreferences } from "../source-preferences"
import type Database from "better-sqlite3"
import type Store from "electron-store"
import type { SchemaTypes } from "../schema-types"
import type {
    AIConfig,
    AIKind,
    OfflineTask,
    PersonalSettings,
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
import type { ArchiveAction, ArchiveQuery, ArchiveRule } from "../archive-types"
import { collectionKey } from "../reading-preferences"
import { LinuxDo } from "./linuxdo"
import { linuxDoJSONPath, LINUXDO } from "../linuxdo"
import { PersonalPreferencesStore } from "./personal-preferences"
import {
    clearWebAccount,
    listWebAccounts,
    lockWebPartitionPermissions,
    openWebLoginWindow,
} from "./personal-accounts"
import { humanizePersonalError } from "./error-messages"

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
    try {
        archive.syncLegacyTopics()
        prefStore.migrateLegacyFolderReadingPreferences()
    } catch (err) {
        console.warn("Legacy folder migration warning:", err)
    }

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
        aiGenerate: async (id: number, kind: AIKind, force = false) => {
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
            return ai.generate(id, kind, !!force)
        },
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
            return {
                saved: offline.savedIds(),
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
            clear: (keyof SourcePreferences)[] = []
        ) => prefStore.savePreferences(target, patch, clear),
        afterInsert: async (ids: number[]) => {
            if (
                !Array.isArray(ids) ||
                ids.length > 10000 ||
                ids.some(id => !Number.isSafeInteger(id))
            )
                throw new Error("新文章列表数据无效，请刷新重试。")
            await archive.afterInsert(ids)
            const getItemStmt = sqlite.prepare(
                "SELECT source,saveRequested FROM items WHERE _id=?"
            )
            for (const id of ids) {
                try {
                    const item = getItemStmt.get(id) as
                        | { source: number; saveRequested: number }
                        | undefined
                    if (!item) continue
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
                        (prefs.autoOffline || item.saveRequested)
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
        notifyItem: (id: number) => {
            if (!Number.isSafeInteger(id)) throw new Error("无效的文章。")
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
                if (
                    manager.hasWindow() &&
                    !manager.mainWindow.webContents.isDestroyed()
                ) {
                    if (manager.mainWindow.isMinimized())
                        manager.mainWindow.restore()
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
        accounts: () => listWebAccounts(),
        clearAccount: (host: string) => clearWebAccount(host),
        login: (address: string) => openWebLoginWindow(address),
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
                archive.syncLegacyTopics()
                prefStore.migrateLegacyFolderReadingPreferences()
                offline.clearTasks()
                index.start(true)
                changed()
            } catch (err) {
                console.warn("Personal state reset warning:", err)
            }
        },
    }
}
