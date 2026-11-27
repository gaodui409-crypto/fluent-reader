import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { app, ipcMain, dialog, nativeTheme } from "electron"
import * as fs from "node:fs"
import * as path from "node:path"
import type Store from "electron-store"
import type { SchemaTypes, StoredRules } from "../schema-types"
import { ThemeSettings } from "../schema-types"
import { sourcesTable, itemsTable } from "../db/schema"
import * as schema from "../db/schema"
import { WindowManager } from "./window"
import performUpdate from "./update-scripts"
import { transformLovefieldRules } from "./utils"
import { getValidDate } from "../scripts/date"
import { htmlText } from "./web-content"
import { initPersonal } from "./personal"
import { protectServiceConfig, readServiceConfig } from "./service-secrets"
import {
    clearLibraryData,
    exportLibraryData,
    restoreLibraryData,
    LibraryBackup,
} from "./library-backup"
import type {
    DatabaseQuery,
    DatabaseResult,
    RestoreDialogTexts,
} from "../bridges/db"
import { assertTrustedMainFrame } from "./ipc-guard"
import {
    ensureRuntimeSchemaIndexes,
    registerSafeRegexFunctions,
} from "./sqlite-runtime"

export { ensureRuntimeSchemaIndexes }

let sqlite: Database.Database
let db: ReturnType<typeof drizzle>
let storeRef: Store<SchemaTypes>
let managerRef: WindowManager
let restartFn: () => void
let resetPersonalRef: (() => void) | null = null

const FORBIDDEN_SQL_PATTERN = /^\s*(?:attach|detach)\b/i

function optimizeDB() {
    if (!sqlite || !sqlite.open) return
    try {
        sqlite.pragma("optimize")
    } catch (err) {
        // Statistics maintenance must not turn a committed write into a failure.
        console.warn("SQLite optimize error:", err)
    }
}

async function handleExportAll() {
    if (!managerRef.hasWindow()) return
    const result = await dialog.showSaveDialog(managerRef.mainWindow, {
        defaultPath: "Fluent_Reader_Backup.frdata",
        filters: [{ name: "Fluent Reader Data", extensions: ["frdata"] }],
    })
    if (result.canceled || !result.filePath) return
    try {
        readServiceConfig(storeRef)
        const sources = db.select().from(sourcesTable).all()
        const items = db.select().from(itemsTable).all()
        const output = {
            ...storeRef.store,
            sqlite: { sources, items, library: exportLibraryData(sqlite) },
        }
        fs.writeFileSync(result.filePath, JSON.stringify(output))
    } catch (err) {
        dialog.showErrorBox("导出失败", String(err))
    }
}

async function handleImportAll(texts: RestoreDialogTexts): Promise<boolean> {
    if (!managerRef.hasWindow()) return true
    const openResult = await dialog.showOpenDialog(managerRef.mainWindow, {
        filters: [
            { name: "Fluent Reader Data", extensions: ["frdata", "json"] },
        ],
        properties: ["openFile"],
    })
    if (openResult.canceled || openResult.filePaths.length === 0) return true

    let configs: Record<string, unknown>
    try {
        const data = fs.readFileSync(openResult.filePaths[0], "utf-8")
        configs = JSON.parse(data)
        if (!configs || typeof configs !== "object" || Array.isArray(configs))
            throw new Error("备份文件格式无法识别。")
        if (
            configs.serviceConfigs &&
            !(configs.serviceConfigs as { encrypted?: string }).encrypted
        )
            configs.serviceConfigs = protectServiceConfig(
                configs.serviceConfigs as import("../schema-types").ServiceConfigs
            )
    } catch (err) {
        dialog.showErrorBox("导入失败", String(err))
        return true
    }

    const confirmed = await dialog.showMessageBox(managerRef.mainWindow, {
        type: "warning",
        title: texts.title,
        message: texts.title,
        detail: texts.message,
        buttons: [texts.cancel, texts.confirm],
        defaultId: 0,
        cancelId: 0,
    })
    if (confirmed.response !== 1) return true

    type InsertSource = typeof sourcesTable.$inferInsert
    type InsertItem = typeof itemsTable.$inferInsert

    let typedSources: InsertSource[] = []
    let typedItems: InsertItem[] = []
    let storedRules: StoredRules = {}
    const restoreDate = new Date()

    const mapSource = (s: Record<string, unknown>): InsertSource => ({
        sid: s.sid as number,
        url: s.url as string,
        iconurl: (s.iconurl as string) || null,
        name: s.name as string,
        openTarget: (s.openTarget as number) || 0,
        lastFetched: getValidDate(s.lastFetched, new Date(0)),
        serviceRef: (s.serviceRef as string) || null,
        fetchFrequency: (s.fetchFrequency as number) || 0,
        textDir: (s.textDir as number) || 0,
        hidden: Boolean(s.hidden),
        archived: Boolean(s.archived),
    })

    const mapItem = (i: Record<string, unknown>): InsertItem => {
        const fetchedDate = getValidDate(i.fetchedDate, i.date, restoreDate)
        return {
            _id: i._id as number,
            source: i.source as number,
            guid: typeof i.guid === "string" && i.guid.trim() ? i.guid : null,
            title: (i.title as string) || "",
            link: (i.link as string) || "",
            date: getValidDate(i.date, fetchedDate),
            fetchedDate,
            thumb: (i.thumb as string) || null,
            content: (i.content as string) || "",
            snippet: (i.snippet as string) || "",
            creator: (i.creator as string) || null,
            hasRead: Boolean(i.hasRead),
            starred: Boolean(i.starred),
            hidden: Boolean(i.hidden),
            feedHidden: Boolean(i.feedHidden),
            kept: Boolean(i.kept),
            notify: Boolean(i.notify),
            serviceRef: (i.serviceRef as string) || null,
            readLater: Boolean(i.readLater),
            highlight: typeof i.highlight === "string" ? i.highlight : "",
            tags: Array.isArray(i.tags)
                ? i.tags.filter(t => typeof t === "string")
                : [],
            saveRequested: Boolean(i.saveRequested),
        }
    }

    const previousStoreSnapshot = { ...storeRef.store }
    try {
        if (configs.sqlite) {
            const sqliteData = configs.sqlite as {
                sources?: Record<string, unknown>[]
                items?: Record<string, unknown>[]
            }
            typedSources = (sqliteData.sources || []).map(mapSource)
            typedItems = (sqliteData.items || []).map(mapItem)
            storedRules = (configs.sourceRules as StoredRules) || {}
        } else if (configs.lovefield) {
            const lfData = configs.lovefield as {
                sources?: Record<string, unknown>[]
                items?: Record<string, unknown>[]
            }
            const rawSources = lfData.sources || []
            typedSources = rawSources.map(mapSource)
            typedItems = (lfData.items || []).map(mapItem)

            storedRules = transformLovefieldRules(rawSources)
        } else {
            dialog.showErrorBox("导入失败", "备份文件格式无法识别。")
            return true
        }

        const excludedKeys = new Set([
            "lovefield",
            "sqlite",
            "nedb",
            "useNeDB",
            "__internal__",
            "prototype",
            "__proto__",
            "constructor",
        ])
        const nextStoreData: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(configs)) {
            if (excludedKeys.has(key) || value === undefined) continue
            nextStoreData[key] = value
        }
        nextStoreData.dbVersion = "sqlite"
        nextStoreData.sourceRules = storedRules

        db.transaction(tx => {
            clearLibraryData(sqlite)
            tx.delete(itemsTable).run()
            tx.delete(sourcesTable).run()
            for (let i = 0; i < typedSources.length; i += 50) {
                tx.insert(sourcesTable)
                    .values(typedSources.slice(i, i + 50))
                    .run()
            }
            for (let i = 0; i < typedItems.length; i += 50) {
                tx.insert(itemsTable)
                    .values(typedItems.slice(i, i + 50))
                    .run()
            }
            restoreLibraryData(
                sqlite,
                (configs.sqlite as { library?: LibraryBackup })?.library
            )
        })
        optimizeDB()

        try {
            storeRef.store = nextStoreData as unknown as SchemaTypes
        } catch {
            try {
                storeRef.store = previousStoreSnapshot
            } catch {
                // Ignore snapshot restore failure and write sanitized keys individually.
            }
            storeRef.clear()
            for (const [key, value] of Object.entries(nextStoreData)) {
                if (key.includes(".")) continue
                try {
                    storeRef.set(
                        key as keyof SchemaTypes,
                        value as SchemaTypes[keyof SchemaTypes]
                    )
                } catch {
                    // Skip unrecognized corrupt keys from external JSON imports.
                }
            }
            storeRef.set("dbVersion" as keyof SchemaTypes, "sqlite")
            storeRef.set("sourceRules", storedRules)
        }
    } catch (err) {
        dialog.showErrorBox("导入失败", String(err))
        return true
    }

    performUpdate(storeRef)
    nativeTheme.themeSource = storeRef.get("theme", ThemeSettings.Default)
    resetPersonalRef?.()

    restartFn()
    return false
}

export function initDB(
    store: Store<SchemaTypes>,
    manager: WindowManager,
    restart: () => void
): void {
    storeRef = store
    managerRef = manager
    restartFn = restart

    const dbPath = path.join(path.dirname(store.path), "fluent-reader.db")

    sqlite = new Database(dbPath)
    sqlite.pragma("trusted_schema = OFF")
    sqlite.pragma("foreign_keys = ON")
    try {
        sqlite.pragma("journal_mode = WAL")
        sqlite.pragma("synchronous = NORMAL")
    } catch {
        // Fallback smoothly if WAL is unsupported on the underlying filesystem.
    }
    if (
        sqlite
            .prepare("SELECT 1 FROM sqlite_master WHERE name='items'")
            .get() &&
        !sqlite
            .prepare("SELECT 1 FROM sqlite_master WHERE name='article_folders'")
            .get()
    ) {
        const before = path.join(
            path.dirname(store.path),
            "before-article-library"
        )
        if (!fs.existsSync(before + ".db")) {
            fs.writeFileSync(before + ".db", sqlite.serialize())
            if (fs.existsSync(store.path)) {
                fs.copyFileSync(store.path, before + ".json")
            }
        }
    }
    sqlite.function("html_text", { deterministic: true }, htmlText)
    registerSafeRegexFunctions(sqlite)

    db = drizzle(sqlite, { schema })

    // Electron's fs APIs can read migrations directly from app.asar.
    const migrationsFolder = path.join(__dirname, "drizzle")

    migrate(db, { migrationsFolder })
    ensureRuntimeSchemaIndexes(sqlite)

    const executeQuery = ({
        sql,
        params,
        method,
    }: DatabaseQuery): DatabaseResult => {
        if (typeof sql !== "string" || FORBIDDEN_SQL_PATTERN.test(sql)) {
            throw new Error("Disallowed SQL statement.")
        }
        const stmt = sqlite.prepare(sql)
        if (method === "run") {
            const result = stmt.run(params)
            return [result.changes, Number(result.lastInsertRowid)]
        }
        const convert = (row: unknown[]) =>
            row?.map(value =>
                typeof value === "bigint" ? Number(value) : value
            )
        // Drizzle maps columns positionally. Object rows lose duplicate names
        // and reorder numeric aliases; raw rows preserve the actual SQL order.
        stmt.raw()
        if (method === "get") return convert(stmt.get(params) as unknown[])
        return (stmt.all(params) as unknown[][]).map(convert)
    }

    ipcMain.handle(
        "db:execute",
        (
            event,
            sql: string,
            params: unknown[],
            method: "run" | "all" | "values" | "get"
        ) => {
            assertTrustedMainFrame(event, manager)
            try {
                return executeQuery({ sql, params, method })
            } catch (err) {
                console.error("db:execute error:", err)
                throw err
            }
        }
    )

    // Keep the entire batch atomic without interleaving other renderer queries.
    const executeBatch = sqlite.transaction((queries: DatabaseQuery[]) =>
        queries.map(executeQuery)
    )
    ipcMain.handle("db:batch", (event, queries: DatabaseQuery[]) => {
        assertTrustedMainFrame(event, manager)
        if (!Array.isArray(queries)) throw new Error("Invalid SQL batch.")
        try {
            const results = executeBatch(queries)
            optimizeDB()
            return results
        } catch (err) {
            console.error("db:batch error:", err)
            throw err
        }
    })

    ipcMain.handle("db-export-all", event => {
        assertTrustedMainFrame(event, manager)
        return handleExportAll()
    })
    ipcMain.handle("db-import-all", (event, texts: RestoreDialogTexts) => {
        assertTrustedMainFrame(event, manager)
        return handleImportAll(texts)
    })

    try {
        const personalRuntime = initPersonal(sqlite, store, manager)
        resetPersonalRef = personalRuntime.resetAfterImport
    } catch (err) {
        console.error("Personal module initialization error:", err)
        app.whenReady().then(() =>
            dialog.showErrorBox(
                app.getLocale().startsWith("zh")
                    ? "部分扩展功能初始化异常"
                    : "Personal features initialization error",
                String(err)
            )
        )
    }

    // Include all tables on opening this long-lived connection, then maintain
    // statistics after bulk writes, daily, and on an orderly shutdown.
    try {
        sqlite.pragma("optimize=0x10002")
    } catch (err) {
        console.warn("SQLite optimize error:", err)
    }
    const optimizeTimer = setInterval(optimizeDB, 24 * 60 * 60 * 1000)
    optimizeTimer.unref()
    app.once("will-quit", () => {
        clearInterval(optimizeTimer)
        optimizeDB()
        try {
            if (sqlite && sqlite.open) sqlite.close()
        } catch {
            // Ignore close failure during process exit.
        }
    })
}
