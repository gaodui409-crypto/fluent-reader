import Store from "electron-store"
import {
    defaultReadingPreferences,
    ReadingPreferences,
} from "../reading-preferences"
import {
    SchemaTypes,
    SourceGroup,
    ViewType,
    ThemeSettings,
    SearchEngines,
    SyncService,
    ServiceConfigs,
    ViewConfigs,
    RuleTarget,
    StoredRule,
    getRuleTargetKey,
    ARTICLE_OVERLAY_MIN_WIDTH,
    LIST_VIEW_MIN_WIDTH,
} from "../schema-types"
import { ipcMain, session, nativeTheme, app, dialog } from "electron"
import { WindowManager } from "./window"
import { transformLovefieldRules } from "./utils"
import { applyPendingRestore } from "./restore"
import { validateConditions } from "../rule-conditions"
import { migrateStoredRules } from "../stored-rules"
import { protectServiceConfig, readServiceConfig } from "./service-secrets"

try {
    applyPendingRestore(app.getPath("userData"))
} catch (error) {
    app.whenReady().then(() =>
        dialog.showErrorBox(
            app.getLocale().startsWith("zh")
                ? "备份恢复未完成，已保留原有数据。"
                : "Backup restore failed. Existing data has been preserved.",
            String(error)
        )
    )
}
export const store = new Store<SchemaTypes>({ cache: true })

ipcMain.on("get-reading-preferences", event => {
    event.returnValue = {
        ...defaultReadingPreferences,
        ...store.get("readingPreferences", defaultReadingPreferences),
    }
})
ipcMain.handle("set-reading-preferences", (_, value: ReadingPreferences) => {
    const collections: ReadingPreferences["collections"] = {}
    for (const key of ["later:", "starred:"]) {
        const pref = value.collections?.[key]
        if (!pref) continue
        collections[key] = {
            view:
                Number.isInteger(pref.view) && pref.view >= 0 && pref.view <= 3
                    ? pref.view
                    : undefined,
            openTarget: [0, 1, 3].includes(pref.openTarget)
                ? pref.openTarget
                : undefined,
        }
    }
    store.set("readingPreferences", {
        hoverSummary: !!value.hoverSummary,
        collapseList: !!value.collapseList,
        collections,
    })
})

const GROUPS_STORE_KEY = "sourceGroups"
function nextGroupId(): number {
    const ids = store.get(GROUPS_STORE_KEY, []).map(group => group.gid)
    for (const key of Object.keys(store.get("sourceRules", {}))) {
        if (key.startsWith("group:")) ids.push(Number(key.slice(6)))
    }
    return Math.max(
        store.get("nextGroupId", 0),
        ...ids
            .filter(id => Number.isSafeInteger(id) && id >= 0)
            .map(id => id + 1)
    )
}

function allocateGroupId(): number {
    const gid = nextGroupId()
    store.set("nextGroupId", gid + 1)
    return gid
}

ipcMain.on("allocate-group-id", event => {
    event.returnValue = allocateGroupId()
})
ipcMain.handle("set-groups", (_, groups: SourceGroup[]) => {
    store.set(GROUPS_STORE_KEY, groups)
})
ipcMain.on("get-groups", event => {
    const nextId = nextGroupId()
    if (store.get("nextGroupId", 0) < nextId) store.set("nextGroupId", nextId)
    const groups = store.get(GROUPS_STORE_KEY, []).map(group => ({ ...group }))
    const ids = new Set<number>()
    let changed = false
    for (const group of groups) {
        if (
            !Number.isSafeInteger(group.gid) ||
            group.gid < 0 ||
            ids.has(group.gid)
        ) {
            group.gid = allocateGroupId()
            changed = true
        }
        // Older renderers persisted the transient display index on some groups.
        if ("index" in group) {
            delete group.index
            changed = true
        }
        ids.add(group.gid)
    }
    if (changed) store.set(GROUPS_STORE_KEY, groups)
    event.returnValue = groups
})

const MENU_STORE_KEY = "menuOn"
ipcMain.on("get-menu", event => {
    event.returnValue = store.get(MENU_STORE_KEY, false)
})
ipcMain.handle("set-menu", (_, state: boolean) => {
    store.set(MENU_STORE_KEY, state)
})

const PAC_STORE_KEY = "pac"
const PAC_STATUS_KEY = "pacOn"
function getProxyStatus() {
    return store.get(PAC_STATUS_KEY, false)
}
function toggleProxyStatus() {
    store.set(PAC_STATUS_KEY, !getProxyStatus())
    setProxy()
}
function getProxy() {
    return store.get(PAC_STORE_KEY, "")
}
function setProxy(address = null) {
    if (!address) {
        address = getProxy()
    } else {
        store.set(PAC_STORE_KEY, address)
    }
    if (getProxyStatus()) {
        let rules = { pacScript: address }
        session.defaultSession.setProxy(rules)
        session.fromPartition("persist:sandbox").setProxy(rules)
    }
}
ipcMain.on("get-proxy-status", event => {
    event.returnValue = getProxyStatus()
})
ipcMain.on("toggle-proxy-status", () => {
    toggleProxyStatus()
})
ipcMain.on("get-proxy", event => {
    event.returnValue = getProxy()
})
ipcMain.handle("set-proxy", (_, address = null) => {
    setProxy(address)
})

const VIEW_STORE_KEY = "view"
ipcMain.on("get-view", event => {
    event.returnValue = store.get(VIEW_STORE_KEY, ViewType.Cards)
})
ipcMain.handle("set-view", (_, viewType: ViewType) => {
    store.set(VIEW_STORE_KEY, viewType)
})

const THEME_STORE_KEY = "theme"
ipcMain.on("get-theme", event => {
    event.returnValue = store.get(THEME_STORE_KEY, ThemeSettings.Default)
})
ipcMain.handle("set-theme", (_, theme: ThemeSettings) => {
    store.set(THEME_STORE_KEY, theme)
    nativeTheme.themeSource = theme
})
ipcMain.on("get-theme-dark-color", event => {
    event.returnValue = nativeTheme.shouldUseDarkColors
})
export function setThemeListener(manager: WindowManager) {
    nativeTheme.removeAllListeners()
    nativeTheme.on("updated", () => {
        if (manager.hasWindow()) {
            let contents = manager.mainWindow.webContents
            if (!contents.isDestroyed()) {
                contents.send("theme-updated", nativeTheme.shouldUseDarkColors)
            }
        }
    })
}

const LOCALE_STORE_KEY = "locale"
ipcMain.handle("set-locale", (_, option: string) => {
    store.set(LOCALE_STORE_KEY, option)
})
function getLocaleSettings() {
    return store.get(LOCALE_STORE_KEY, "default")
}
ipcMain.on("get-locale-settings", event => {
    event.returnValue = getLocaleSettings()
})
ipcMain.on("get-locale", event => {
    let setting = getLocaleSettings()
    let locale = setting === "default" ? app.getLocale() : setting
    event.returnValue = locale
})

const FONT_SIZE_STORE_KEY = "fontSize"
ipcMain.on("get-font-size", event => {
    event.returnValue = store.get(FONT_SIZE_STORE_KEY, 16)
})
ipcMain.handle("set-font-size", (_, size: number) => {
    store.set(FONT_SIZE_STORE_KEY, size)
})

const FONT_STORE_KEY = "fontFamily"
ipcMain.on("get-font", event => {
    event.returnValue = store.get(FONT_STORE_KEY, "")
})
ipcMain.handle("set-font", (_, font: string) => {
    store.set(FONT_STORE_KEY, font)
})

for (const [key, channel, minimum] of [
    ["articleOverlayWidth", "article-overlay-width", ARTICLE_OVERLAY_MIN_WIDTH],
    ["listViewWidth", "list-view-width", LIST_VIEW_MIN_WIDTH],
] as const) {
    ipcMain.on(`get-${channel}`, event => {
        const width = store.get(key, minimum)
        event.returnValue = Number.isFinite(width)
            ? Math.max(minimum, Math.round(width))
            : minimum
    })
    ipcMain.handle(`set-${channel}`, (_, width: number) => {
        if (Number.isFinite(width) && width >= minimum) {
            store.set(key, Math.round(width))
        }
    })
}

const FETCH_INTEVAL_STORE_KEY = "fetchInterval"
ipcMain.on("get-fetch-interval", event => {
    event.returnValue = store.get(FETCH_INTEVAL_STORE_KEY, 10)
})
ipcMain.handle("set-fetch-interval", (_, interval: number) => {
    if (!Number.isInteger(interval) || interval < 0 || interval > 1440)
        throw new Error("Invalid automatic fetch interval.")
    store.set(FETCH_INTEVAL_STORE_KEY, interval)
})

const SEARCH_ENGINE_STORE_KEY = "searchEngine"
ipcMain.on("get-search-engine", event => {
    event.returnValue = store.get(SEARCH_ENGINE_STORE_KEY, SearchEngines.Google)
})
ipcMain.handle("set-search-engine", (_, engine: SearchEngines) => {
    store.set(SEARCH_ENGINE_STORE_KEY, engine)
})

const SERVICE_CONFIGS_STORE_KEY = "serviceConfigs"
ipcMain.on("get-service-configs", event => {
    try {
        event.returnValue = readServiceConfig(store)
    } catch (error) {
        event.returnValue = { type: SyncService.None }
        const zh = store.get("locale", "").startsWith("zh")
        // Return immediately so an unavailable key cannot block renderer startup.
        setTimeout(
            () =>
                dialog.showErrorBox(
                    zh
                        ? "同步服务凭据需要重新输入"
                        : "Re-enter synchronization credentials",
                    zh
                        ? "无法读取此系统账号加密的服务凭据。请在选项 → 服务中重新配置；订阅和文章已保留。\n" +
                              String(error)
                        : String(error)
                ),
            0
        )
    }
})
ipcMain.handle("set-service-configs", (_, configs: ServiceConfigs) => {
    try {
        store.set(SERVICE_CONFIGS_STORE_KEY, protectServiceConfig(configs))
        return { ok: true }
    } catch (error) {
        return { ok: false, error: String(error) }
    }
})

const FILTER_TYPE_STORE_KEY = "filterType"
ipcMain.on("get-filter-type", event => {
    event.returnValue = store.get(FILTER_TYPE_STORE_KEY, null)
})
ipcMain.handle("set-filter-type", (_, filterType: number) => {
    store.set(FILTER_TYPE_STORE_KEY, filterType)
})

const LIST_CONFIGS_STORE_KEY = "listViewConfigs"
ipcMain.on("get-view-configs", (event, view: ViewType) => {
    switch (view) {
        case ViewType.List:
            event.returnValue = store.get(
                LIST_CONFIGS_STORE_KEY,
                ViewConfigs.ShowCover
            )
            break
        default:
            event.returnValue = undefined
            break
    }
})
ipcMain.handle(
    "set-view-configs",
    (_, view: ViewType, configs: ViewConfigs) => {
        switch (view) {
            case ViewType.List:
                store.set(LIST_CONFIGS_STORE_KEY, configs)
                break
        }
    }
)

const SOURCE_RULES_STORE_KEY = "sourceRules"

ipcMain.on("get-all-rules", event => {
    try {
        const rules = migrateStoredRules(store.get(SOURCE_RULES_STORE_KEY, {}))
        if (store.get("sourceRulesVersion", 1) < 2) {
            store.set(SOURCE_RULES_STORE_KEY, rules)
            store.set("sourceRulesVersion", 2)
        }
        event.returnValue = { ok: true, rules }
    } catch (error) {
        event.returnValue = { ok: false, error: String(error) }
    }
})
ipcMain.handle(
    "set-rules-for-target",
    (_, target: RuleTarget, rules: StoredRule[]) => {
        if (!Array.isArray(rules) || rules.length > 500)
            throw new Error("Invalid rule list.")
        for (const rule of rules) {
            if (rule.conditions) validateConditions(rule.conditions)
            if (rule.highlight && !/^#[0-9a-f]{6}$/i.test(rule.highlight))
                throw new Error("Invalid highlight color.")
            if (
                rule.tags &&
                (!Array.isArray(rule.tags) ||
                    rule.tags.length > 50 ||
                    rule.tags.some(
                        tag =>
                            typeof tag !== "string" ||
                            !tag.trim() ||
                            tag.length > 100
                    ))
            )
                throw new Error("Invalid rule tags.")
            if (
                !Array.isArray(rule.actions) ||
                rule.actions.some(
                    action =>
                        typeof action !== "string" ||
                        !/^[rshnlo](-true|-false)?$/.test(action)
                )
            )
                throw new Error("Invalid rule action.")
        }
        const key = getRuleTargetKey(target)
        // Keep the read and write together in main so independent targets cannot
        // overwrite each other using stale renderer snapshots.
        const allRules = { ...store.get(SOURCE_RULES_STORE_KEY, {}) }
        if (rules.length > 0) allRules[key] = rules
        else delete allRules[key]
        store.set(SOURCE_RULES_STORE_KEY, allRules)
    }
)
ipcMain.handle(
    "migrate-lovefield-rules",
    (_, sources: Record<string, unknown>[]) => {
        store.set(SOURCE_RULES_STORE_KEY, transformLovefieldRules(sources))
    }
)

const DB_VERSION_STORE_KEY = "dbVersion"
ipcMain.on("get-db-version", event => {
    event.returnValue = store.get(
        DB_VERSION_STORE_KEY as keyof SchemaTypes,
        null
    )
})
ipcMain.handle("set-db-version", (_, version: string) => {
    store.set(DB_VERSION_STORE_KEY as keyof SchemaTypes, version)
})

const UNREAD_SOURCES_ONLY_STORE_KEY = "menuUnreadSourcesOnly"
ipcMain.on("get-unread-sources-only", event => {
    event.returnValue = store.get(UNREAD_SOURCES_ONLY_STORE_KEY, false)
})
ipcMain.handle("set-unread-sources-only", (_, flag: boolean) => {
    store.set(UNREAD_SOURCES_ONLY_STORE_KEY, flag)
})
