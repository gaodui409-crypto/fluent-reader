import Store from "electron-store"
import { humanizePersonalError } from "./error-messages"
import {
    collectionKey,
    defaultReadingPreferences,
    ReaderWidthMode,
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
import { normalizeOpenFolders, normalizeUnseenDelta } from "../sidebar-state"

try {
    applyPendingRestore(app.getPath("userData"))
} catch (error) {
    app.whenReady().then(() =>
        dialog.showErrorBox(
            app.getLocale().startsWith("zh")
                ? "备份恢复未完成，已保留原有数据"
                : "Backup restore failed. Existing data has been preserved.",
            String(error)
        )
    )
}
export const store = new Store<SchemaTypes>({ cache: true })

ipcMain.on("get-unseen-delta", event => {
    try {
        const value = store.get("unseenDelta")
        event.returnValue =
            value === undefined ? null : normalizeUnseenDelta(value)
    } catch {
        event.returnValue = normalizeUnseenDelta(undefined)
    }
})
ipcMain.handle("set-unseen-delta", (_, value: unknown) => {
    store.set("unseenDelta", normalizeUnseenDelta(value))
})
ipcMain.on("get-open-folders", event => {
    try {
        const value = store.get("openFolders")
        event.returnValue =
            value === undefined ? null : normalizeOpenFolders(value)
    } catch {
        event.returnValue = []
    }
})
ipcMain.handle("set-open-folders", (_, value: unknown) => {
    store.set("openFolders", normalizeOpenFolders(value))
})

ipcMain.on("get-reading-preferences", event => {
    event.returnValue = {
        ...defaultReadingPreferences,
        ...store.get("readingPreferences", defaultReadingPreferences),
    }
})
ipcMain.handle("set-reading-preferences", (_, value: ReadingPreferences) => {
    const collections: ReadingPreferences["collections"] = {}
    for (const [rawKey, pref] of Object.entries(value?.collections || {})) {
        const key = collectionKey(rawKey)
        if (!key || !pref || typeof pref !== "object") continue
        const view =
            Number.isInteger(pref.view) && pref.view >= 0 && pref.view <= 3
                ? pref.view
                : undefined
        const openTarget = [0, 1, 2, 3].includes(pref.openTarget)
            ? pref.openTarget
            : undefined
        if (view !== undefined || openTarget !== undefined) {
            collections[key] = { view, openTarget }
        }
    }
    const readerWidth: ReaderWidthMode = [
        "narrow",
        "standard",
        "wide",
    ].includes(String(value?.readerWidth))
        ? (value.readerWidth as ReaderWidthMode)
        : "standard"
    const lineHeight =
        typeof value?.lineHeight === "number" &&
        Number.isFinite(value.lineHeight) &&
        value.lineHeight >= 1.4 &&
        value.lineHeight <= 2.4
            ? Math.round(value.lineHeight * 100) / 100
            : 1.82
    store.set("readingPreferences", {
        hoverSummary: !!value?.hoverSummary,
        collapseList: !!value?.collapseList,
        readerWidth,
        lineHeight,
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
        ...ids.filter(id => Number.isInteger(id) && id >= 0).map(id => id + 1),
        0
    )
}
function allocateGroupId(): number {
    const gid = nextGroupId()
    store.set("nextGroupId", gid + 1)
    return gid
}
function normalizeGroups(groups: SourceGroup[]): SourceGroup[] {
    let seen = new Set<number>()
    let next = nextGroupId()
    let normalized = groups.map(group => {
        let gid =
            Number.isInteger(group.gid) &&
            group.gid >= 0 &&
            !seen.has(group.gid)
                ? group.gid
                : next++
        seen.add(gid)
        return { ...group, gid }
    })
    if (next > store.get("nextGroupId", 0)) store.set("nextGroupId", next)
    return normalized
}
ipcMain.on("allocate-group-id", event => {
    event.returnValue = allocateGroupId()
})
ipcMain.handle("set-groups", (_, groups: SourceGroup[]) => {
    store.set(GROUPS_STORE_KEY, normalizeGroups(groups))
})
ipcMain.on("get-groups", event => {
    let stored = store.get(GROUPS_STORE_KEY, [])
    let groups = normalizeGroups(stored)
    if (groups.some((group, index) => group.gid !== stored[index]?.gid)) {
        store.set(GROUPS_STORE_KEY, groups)
    }
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
const PROXY_MODE_KEY = "proxyMode"

function inferProxyMode(address: string): "direct" | "pac" {
    const saved = store.get(PROXY_MODE_KEY)
    if (saved === "direct" || saved === "pac") return saved
    if (!address) return "direct"
    if (/^socks5?h?:\/\//i.test(address)) return "direct"
    if (/\.pac(\?|$)/i.test(address) || /\/pac\b/i.test(address)) return "pac"
    try {
        const u = new URL(address)
        if ((u.pathname === "/" || u.pathname === "") && u.port) return "direct"
    } catch {
        return "direct"
    }
    return "pac"
}

function normalizeDirectProxyRules(raw: string): string {
    const v = raw.trim().replace(/\/+$/, "")
    if (!v) return ""
    if (/^socks5h:\/\//i.test(v))
        return v.replace(/^socks5h:\/\//i, "socks5://")
    if (/^(https?|socks5|socks4):\/\//i.test(v)) return v
    if (/^(\[[0-9a-f:]+\]|[a-z0-9.-]+):\d+$/i.test(v)) return "http://" + v
    return v
}

function getProxyStatus() {
    return store.get(PAC_STATUS_KEY, false)
}
function getProxy() {
    return store.get(PAC_STORE_KEY, "")
}
function getProxyMode(): "direct" | "pac" {
    return inferProxyMode(getProxy())
}
function applyActiveProxy(address: string | null = null) {
    if (address !== null && address !== undefined) {
        store.set(PAC_STORE_KEY, String(address).trim())
    }
    const current = getProxy().trim()
    const applyToSessions = (config: Electron.ProxyConfig) => {
        if (!app.isReady()) return
        void session.defaultSession.setProxy(config).catch(() => {})
        void session
            .fromPartition("persist:sandbox")
            .setProxy(config)
            .catch(() => {})
    }
    if (!getProxyStatus() || !current) {
        applyToSessions({ mode: "system" })
        return
    }
    if (getProxyMode() === "direct") {
        const proxyRules = normalizeDirectProxyRules(current)
        applyToSessions({ proxyRules, proxyBypassRules: "<local>" })
    } else {
        applyToSessions({ pacScript: current })
    }
}
ipcMain.on("get-proxy-status", event => {
    event.returnValue = getProxyStatus()
})
ipcMain.on("toggle-proxy-status", () => {
    store.set(PAC_STATUS_KEY, !getProxyStatus())
    applyActiveProxy()
})
ipcMain.on("get-proxy-mode", event => {
    event.returnValue = getProxyMode()
})
ipcMain.handle("set-proxy-mode", (_, mode: "direct" | "pac") => {
    store.set(PROXY_MODE_KEY, mode === "pac" ? "pac" : "direct")
})
ipcMain.on("get-proxy", event => {
    event.returnValue = getProxy()
})
ipcMain.handle("set-proxy", (_, address: string = null) => {
    applyActiveProxy(address)
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

for (const [key, channel, minimum, fallback] of [
    [
        "articleOverlayWidth",
        "article-overlay-width",
        ARTICLE_OVERLAY_MIN_WIDTH,
        880,
    ],
    ["listViewWidth", "list-view-width", LIST_VIEW_MIN_WIDTH, 340],
] as const) {
    ipcMain.on(`get-${channel}`, event => {
        const width = store.get(key, fallback)
        event.returnValue = Number.isFinite(width)
            ? Math.max(minimum, Math.round(width))
            : fallback
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
                        ? "需要重新填写同步服务账号"
                        : "Re-enter synchronization credentials",
                    zh
                        ? "当前系统账号无法解密先前保存的同步服务密码，请在“选项 → 服务”中重新输入；本地订阅与文章均已保留。\n" +
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
        const locale = store.get("locale", app.getLocale() || "zh-CN")
        return {
            ok: false,
            error: humanizePersonalError(String(error), locale),
        }
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
        case ViewType.Magazine:
            event.returnValue = store.get(
                "magazineViewConfigs" as keyof SchemaTypes,
                ViewConfigs.ShowCover |
                    ViewConfigs.ShowSnippet |
                    ViewConfigs.FadeRead
            )
            break
        case ViewType.Cards:
            event.returnValue = store.get(
                "cardViewConfigs" as keyof SchemaTypes,
                ViewConfigs.ShowCover |
                    ViewConfigs.ShowSnippet |
                    ViewConfigs.FadeRead
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
            case ViewType.Magazine:
                store.set("magazineViewConfigs" as keyof SchemaTypes, configs)
                break
            case ViewType.Cards:
                store.set("cardViewConfigs" as keyof SchemaTypes, configs)
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
