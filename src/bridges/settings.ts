import {
    SourceGroup,
    ViewType,
    ThemeSettings,
    SearchEngines,
    ServiceConfigs,
    ViewConfigs,
    StoredRule,
    StoredRules,
    RuleTarget,
    UnseenDelta,
} from "../schema-types"
import { ipcRenderer } from "electron"

const settingsBridge = {
    getUnseenDelta: (): UnseenDelta | null =>
        ipcRenderer.sendSync("get-unseen-delta"),
    setUnseenDelta: (value: UnseenDelta): Promise<void> =>
        ipcRenderer.invoke("set-unseen-delta", value),
    getOpenFolders: (): string[] | null =>
        ipcRenderer.sendSync("get-open-folders"),
    setOpenFolders: (value: string[]): Promise<void> =>
        ipcRenderer.invoke("set-open-folders", value),
    getReadingPreferences:
        (): import("../reading-preferences").ReadingPreferences =>
            ipcRenderer.sendSync("get-reading-preferences"),
    setReadingPreferences: (
        preferences: import("../reading-preferences").ReadingPreferences
    ): Promise<void> =>
        ipcRenderer.invoke("set-reading-preferences", preferences),
    allocateGroupId: (): number => {
        return ipcRenderer.sendSync("allocate-group-id")
    },
    saveGroups: (groups: SourceGroup[]) => {
        return ipcRenderer.invoke("set-groups", groups)
    },
    loadGroups: (): SourceGroup[] => {
        return ipcRenderer.sendSync("get-groups")
    },

    getDefaultMenu: (): boolean => {
        return ipcRenderer.sendSync("get-menu")
    },
    setDefaultMenu: (state: boolean) => {
        ipcRenderer.invoke("set-menu", state)
    },

    getProxyStatus: (): boolean => {
        return ipcRenderer.sendSync("get-proxy-status")
    },
    toggleProxyStatus: () => {
        ipcRenderer.send("toggle-proxy-status")
    },
    getProxyMode: (): "direct" | "pac" => {
        return ipcRenderer.sendSync("get-proxy-mode")
    },
    setProxyMode: (mode: "direct" | "pac") => {
        return ipcRenderer.invoke("set-proxy-mode", mode)
    },
    getProxy: (): string => {
        return ipcRenderer.sendSync("get-proxy")
    },
    setProxy: (address: string = null) => {
        return ipcRenderer.invoke("set-proxy", address)
    },

    getDefaultView: (): ViewType => {
        return ipcRenderer.sendSync("get-view")
    },
    setDefaultView: (viewType: ViewType) => {
        ipcRenderer.invoke("set-view", viewType)
    },

    getThemeSettings: (): ThemeSettings => {
        return ipcRenderer.sendSync("get-theme")
    },
    setThemeSettings: (theme: ThemeSettings) => {
        ipcRenderer.invoke("set-theme", theme)
    },
    shouldUseDarkColors: (): boolean => {
        return ipcRenderer.sendSync("get-theme-dark-color")
    },
    addThemeUpdateListener: (callback: (shouldDark: boolean) => any) => {
        const listener = (_: unknown, shouldDark: boolean) => {
            callback(shouldDark)
        }
        ipcRenderer.on("theme-updated", listener)
        return () => {
            ipcRenderer.removeListener("theme-updated", listener)
        }
    },

    setLocaleSettings: (option: string) => {
        ipcRenderer.invoke("set-locale", option)
    },
    getLocaleSettings: (): string => {
        return ipcRenderer.sendSync("get-locale-settings")
    },
    getCurrentLocale: (): string => {
        return ipcRenderer.sendSync("get-locale")
    },

    getFontSize: (): number => {
        return ipcRenderer.sendSync("get-font-size")
    },
    setFontSize: (size: number) => {
        ipcRenderer.invoke("set-font-size", size)
    },

    getFont: (): string => {
        return ipcRenderer.sendSync("get-font")
    },
    setFont: (font: string) => {
        ipcRenderer.invoke("set-font", font)
    },

    getArticleOverlayWidth: (): number => {
        return ipcRenderer.sendSync("get-article-overlay-width")
    },
    setArticleOverlayWidth: (width: number): Promise<void> => {
        return ipcRenderer.invoke("set-article-overlay-width", width)
    },

    getListViewWidth: (): number => {
        return ipcRenderer.sendSync("get-list-view-width")
    },
    setListViewWidth: (width: number): Promise<void> => {
        return ipcRenderer.invoke("set-list-view-width", width)
    },

    getFetchInterval: (): number => {
        return ipcRenderer.sendSync("get-fetch-interval")
    },
    setFetchInterval: (interval: number): Promise<void> => {
        return ipcRenderer.invoke("set-fetch-interval", interval)
    },

    getSearchEngine: (): SearchEngines => {
        return ipcRenderer.sendSync("get-search-engine")
    },
    setSearchEngine: (engine: SearchEngines) => {
        ipcRenderer.invoke("set-search-engine", engine)
    },

    getServiceConfigs: (): ServiceConfigs => {
        return ipcRenderer.sendSync("get-service-configs")
    },
    setServiceConfigs: async (configs: ServiceConfigs) => {
        const reply = await ipcRenderer.invoke("set-service-configs", configs)
        if (!reply.ok) throw new Error(reply.error)
    },

    getFilterType: (): number => {
        return ipcRenderer.sendSync("get-filter-type")
    },
    setFilterType: (filterType: number) => {
        ipcRenderer.invoke("set-filter-type", filterType)
    },

    getViewConfigs: (view: ViewType): ViewConfigs => {
        return ipcRenderer.sendSync("get-view-configs", view)
    },
    setViewConfigs: (view: ViewType, configs: ViewConfigs) => {
        ipcRenderer.invoke("set-view-configs", view, configs)
    },

    getAllRules: (): StoredRules => {
        const reply = ipcRenderer.sendSync("get-all-rules")
        if (!reply.ok) throw new Error(reply.error)
        return reply.rules
    },
    setRulesForTarget: (
        target: RuleTarget,
        rules: StoredRule[]
    ): Promise<void> => {
        return ipcRenderer.invoke("set-rules-for-target", target, rules)
    },
    migrateLovefieldRules: (
        sources: Record<string, unknown>[]
    ): Promise<void> => {
        return ipcRenderer.invoke("migrate-lovefield-rules", sources)
    },

    getDBVersion: (): string | null => {
        return ipcRenderer.sendSync("get-db-version")
    },
    setDBVersion: (version: string): Promise<void> => {
        return ipcRenderer.invoke("set-db-version", version)
    },

    getUnreadSourcesOnly: (): boolean => {
        return ipcRenderer.sendSync("get-unread-sources-only")
    },
    setUnreadSourcesOnly: (flag: boolean) => {
        ipcRenderer.invoke("set-unread-sources-only", flag)
    },
}

declare global {
    interface Window {
        settings: typeof settingsBridge
    }
    var settings: typeof settingsBridge
}

export default settingsBridge
