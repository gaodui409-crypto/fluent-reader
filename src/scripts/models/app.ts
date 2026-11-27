import { loadStoredUnseen, saveStoredUnseen } from "../sidebar-state"
import intl from "react-intl-universal"
import {
    INIT_SOURCES,
    SourceActionTypes,
    ADD_SOURCE,
    UPDATE_SOURCE,
    DELETE_SOURCE,
    UPDATE_UNREAD_COUNTS,
    initSources,
    updateFavicon,
} from "./source"
import {
    RSSItem,
    ItemActionTypes,
    FETCH_ITEMS,
    MARK_ALL_READ,
    MARK_READ,
    TOGGLE_HIDDEN,
    fetchItems,
} from "./item"
import {
    ActionStatus,
    AppThunk,
    getWindowBreakpoint,
    initTouchBarWithTexts,
} from "../utils"
import { INIT_FEEDS, FeedActionTypes, ALL, initFeeds } from "./feed"
import {
    SourceGroupActionTypes,
    UPDATE_SOURCE_GROUP,
    ADD_SOURCE_TO_GROUP,
    DELETE_SOURCE_GROUP,
    REMOVE_SOURCE_FROM_GROUP,
    REORDER_SOURCE_GROUPS,
} from "./group"
import {
    PageActionTypes,
    SELECT_PAGE,
    PageType,
    selectAllArticles,
} from "./page"
import { getCurrentLocale } from "../settings"
import locales from "../i18n/_locales"
import { SYNC_SERVICE, ServiceActionTypes } from "./service"

export const enum ContextMenuType {
    Hidden,
    Item,
    Text,
    View,
    Group,
    Image,
    MarkRead,
}

export const enum AppLogType {
    Info,
    Warning,
    Failure,
    Article,
}

export class AppLog {
    type: AppLogType
    title: string
    details?: string
    iid?: number
    time: Date

    constructor(
        type: AppLogType,
        title: string,
        details: string = null,
        iid: number = null
    ) {
        this.type = type
        this.title = title
        this.details = details
        this.iid = iid
        this.time = new Date()
    }
}

export type GroupMenuTarget =
    | number[]
    | {
          sids: number[]
          gid?: number
      }

export class AppState {
    locale = null as string
    sourceInit = false
    feedInit = false
    syncing = false
    fetchingItems = false
    fetchingProgress = 0
    fetchingTotal = 0
    lastFetched = new Date()
    refreshRunning = false
    refreshCompletedAt = 0
    refreshAdded = 0
    refreshFailures = 0
    unseenBySource: Record<number, number>
    unseenAll: number
    menu = getWindowBreakpoint() && window.settings.getDefaultMenu()
    menuKey = ALL
    title = ""
    settings = {
        display: false,
        changed: false,
        sids: new Array<number>(),
        saving: false,
    }
    logMenu = {
        display: false,
        notify: false,
        logs: new Array<AppLog>(),
    }

    contextMenu: {
        type: ContextMenuType
        event?: MouseEvent | string
        position?: [number, number]
        target?: [RSSItem, string] | GroupMenuTarget | [string, string]
    }

    constructor() {
        const initialUnseen = loadStoredUnseen()
        this.unseenBySource = initialUnseen.bySource
        this.unseenAll = initialUnseen.all
        this.contextMenu = {
            type: ContextMenuType.Hidden,
        }
    }
}

export const CLOSE_CONTEXT_MENU = "CLOSE_CONTEXT_MENU"
export const OPEN_ITEM_MENU = "OPEN_ITEM_MENU"
export const OPEN_TEXT_MENU = "OPEN_TEXT_MENU"
export const OPEN_VIEW_MENU = "OPEN_VIEW_MENU"
export const OPEN_GROUP_MENU = "OPEN_GROUP_MENU"
export const OPEN_IMAGE_MENU = "OPEN_IMAGE_MENU"
export const OPEN_MARK_ALL_MENU = "OPEN_MARK_ALL_MENU"

interface CloseContextMenuAction {
    type: typeof CLOSE_CONTEXT_MENU
}

interface OpenItemMenuAction {
    type: typeof OPEN_ITEM_MENU
    event: MouseEvent
    item: RSSItem
    feedId: string
}

interface OpenTextMenuAction {
    type: typeof OPEN_TEXT_MENU
    position: [number, number]
    item: [string, string]
}

interface OpenViewMenuAction {
    type: typeof OPEN_VIEW_MENU
}

interface OpenMarkAllMenuAction {
    type: typeof OPEN_MARK_ALL_MENU
}

interface OpenGroupMenuAction {
    type: typeof OPEN_GROUP_MENU
    event: MouseEvent
    sids: number[]
    gid?: number
}

interface OpenImageMenuAction {
    type: typeof OPEN_IMAGE_MENU
    position: [number, number]
}

export type ContextMenuActionTypes =
    | CloseContextMenuAction
    | OpenItemMenuAction
    | OpenTextMenuAction
    | OpenViewMenuAction
    | OpenGroupMenuAction
    | OpenImageMenuAction
    | OpenMarkAllMenuAction

export const TOGGLE_LOGS = "TOGGLE_LOGS"
export const CLEAR_LOGS = "CLEAR_LOGS"
export const PUSH_NOTIFICATION = "PUSH_NOTIFICATION"

interface ToggleLogMenuAction {
    type: typeof TOGGLE_LOGS
}

interface ClearLogsAction {
    type: typeof CLEAR_LOGS
}

interface PushNotificationAction {
    type: typeof PUSH_NOTIFICATION
    iid: number
    title: string
    source: string
}

export type LogMenuActionType =
    | ToggleLogMenuAction
    | ClearLogsAction
    | PushNotificationAction

export const TOGGLE_MENU = "TOGGLE_MENU"
export const SET_MENU_OPEN = "SET_MENU_OPEN"

export type MenuActionTypes =
    | { type: typeof TOGGLE_MENU }
    | { type: typeof SET_MENU_OPEN; open: boolean }

export const TOGGLE_SETTINGS = "TOGGLE_SETTINGS"
export const SAVE_SETTINGS = "SAVE_SETTINGS"
export const FREE_MEMORY = "FREE_MEMORY"

interface ToggleSettingsAction {
    type: typeof TOGGLE_SETTINGS
    open: boolean
    sids: number[]
}
interface SaveSettingsAction {
    type: typeof SAVE_SETTINGS
}
interface FreeMemoryAction {
    type: typeof FREE_MEMORY
    iids: Set<number>
}
export type SettingsActionTypes =
    | ToggleSettingsAction
    | SaveSettingsAction
    | FreeMemoryAction

export function closeContextMenu(): AppThunk {
    return (dispatch, getState) => {
        if (getState().app.contextMenu.type !== ContextMenuType.Hidden) {
            dispatch({ type: CLOSE_CONTEXT_MENU })
        }
    }
}

export function openItemMenu(
    item: RSSItem,
    feedId: string,
    event: React.MouseEvent
): ContextMenuActionTypes {
    return {
        type: OPEN_ITEM_MENU,
        event: event.nativeEvent,
        item: item,
        feedId: feedId,
    }
}

export function openTextMenu(
    position: [number, number],
    text: string,
    url: string = null
): ContextMenuActionTypes {
    return {
        type: OPEN_TEXT_MENU,
        position: position,
        item: [text, url],
    }
}

export const openViewMenu = (): ContextMenuActionTypes => ({
    type: OPEN_VIEW_MENU,
})

export function openGroupMenu(
    sids: number[],
    event: React.MouseEvent,
    gid?: number
): ContextMenuActionTypes {
    return {
        type: OPEN_GROUP_MENU,
        event: event.nativeEvent,
        sids: sids,
        gid,
    }
}

export function openImageMenu(
    position: [number, number]
): ContextMenuActionTypes {
    return {
        type: OPEN_IMAGE_MENU,
        position: position,
    }
}

export const openMarkAllMenu = (): ContextMenuActionTypes => ({
    type: OPEN_MARK_ALL_MENU,
})

export function setMenuOpen(open: boolean): MenuActionTypes {
    return { type: SET_MENU_OPEN, open }
}

export function toggleMenu(): AppThunk {
    return (dispatch, getState) => {
        dispatch({ type: TOGGLE_MENU })
        if (getWindowBreakpoint()) {
            window.settings.setDefaultMenu(getState().app.menu)
        }
    }
}

export const toggleLogMenu = () => ({ type: TOGGLE_LOGS } as const)
export const clearLogs = () => ({ type: CLEAR_LOGS } as const)
export const saveSettings = () => ({ type: SAVE_SETTINGS } as const)

export const toggleSettings = (open = true, sids = new Array<number>()) => ({
    type: TOGGLE_SETTINGS,
    open: open,
    sids: sids,
})

export function exitSettings(): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        if (!getState().app.settings.saving) {
            if (getState().app.settings.changed) {
                dispatch(saveSettings())
                dispatch(selectAllArticles(true))
                await dispatch(initFeeds(true))
                dispatch(toggleSettings(false))
                dispatch(freeMemory())
            } else {
                dispatch(toggleSettings(false))
            }
        }
    }
}

function freeMemory(): AppThunk {
    return (dispatch, getState) => {
        const state = getState()
        const iids = new Set<number>()
        for (let feed of Object.values(state.feeds)) {
            if (feed.loaded) feed.iids.forEach(iids.add, iids)
        }
        if (state.page.itemId !== null) {
            iids.add(state.page.itemId)
        }
        dispatch({
            type: FREE_MEMORY,
            iids: iids,
        })
    }
}

let fetchTimeout: NodeJS.Timeout
export function setupAutoFetch(): AppThunk {
    return (dispatch, getState) => {
        clearTimeout(fetchTimeout)
        const interval = window.settings.getFetchInterval()
        if (!interval) return
        const remaining =
            interval * 60000 -
            (Date.now() - getState().app.lastFetched.getTime())
        fetchTimeout = setTimeout(async () => {
            try {
                await dispatch(refreshIfDue())
            } catch (error) {
                console.error(error)
            } finally {
                // Also re-arm when settings, an active fetch or a failure deferred work.
                dispatch(setupAutoFetch())
            }
        }, Math.max(1000, Math.min(interval * 60000, remaining)))
    }
}

export function refreshIfDue(reconnected = false): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        const state = getState().app
        const interval = window.settings.getFetchInterval()
        if (
            !interval ||
            !state.sourceInit ||
            !state.feedInit ||
            state.settings.display ||
            state.fetchingItems ||
            state.syncing ||
            state.refreshRunning ||
            globalThis.navigator?.onLine === false
        )
            return
        const elapsed = Date.now() - state.lastFetched.getTime()
        if (elapsed < 0 || elapsed >= (reconnected ? 60000 : interval * 60000))
            await dispatch(fetchItems(true))
    }
}

export const REFRESH_STATUS = "REFRESH_STATUS"
export interface RefreshStatusAction {
    type: typeof REFRESH_STATUS
    phase: "start" | "finish" | "error"
}

export function pushNotification(item: RSSItem): AppThunk {
    return (dispatch, getState) => {
        const sourceName =
            getState().sources[item.source]?.name ||
            intl.get("sources.untitled")
        dispatch({
            type: PUSH_NOTIFICATION,
            iid: item._id,
            title: item.title,
            source: sourceName,
        })
    }
}

export const INIT_INTL = "INIT_INTL"
export interface InitIntlAction {
    type: typeof INIT_INTL
    locale: string
}
export const initIntlDone = (locale: string): InitIntlAction => {
    document.documentElement.lang = locale
    return {
        type: INIT_INTL,
        locale: locale,
    }
}

export function initIntl(): AppThunk<Promise<void>> {
    return dispatch => {
        let locale = getCurrentLocale()
        return intl
            .init({
                currentLocale: locale,
                locales: locales,
                fallbackLocale: "en-US",
            })
            .then(() => {
                dispatch(initIntlDone(locale))
            })
    }
}

export function initApp(): AppThunk<Promise<void>> {
    return async dispatch => {
        document.body.classList.add(window.utils.platform)
        await dispatch(initIntl())
        if (window.utils.platform === "darwin") initTouchBarWithTexts()
        try {
            await dispatch(initSources())
        } catch (err) {
            console.error("Failed to initialize sources:", err)
            const details =
                err instanceof Error && err.cause
                    ? String(err.cause)
                    : String(err)
            const zh = getCurrentLocale().startsWith("zh")
            await window.utils.showErrorBox(
                zh
                    ? "本地数据库初始化遇到问题"
                    : "Database initialization failed",
                zh
                    ? `${details}\n\n原有本地数据均已保留，请重启应用重试。`
                    : `${details}\n\nYour existing data has been preserved. Restart Fluent Reader to retry.`
            )
            window.utils.closeWindow()
            return
        }
        await dispatch(initFeeds())
        dispatch(selectAllArticles())
        await dispatch(fetchItems())
        dispatch(updateFavicon())
    }
}

export function appReducer(
    state = new AppState(),
    action:
        | SourceActionTypes
        | ItemActionTypes
        | ContextMenuActionTypes
        | SettingsActionTypes
        | InitIntlAction
        | MenuActionTypes
        | LogMenuActionType
        | RefreshStatusAction
        | FeedActionTypes
        | PageActionTypes
        | SourceGroupActionTypes
        | ServiceActionTypes
): AppState {
    switch (action.type) {
        case INIT_INTL:
            return {
                ...state,
                locale: action.locale,
            }
        case INIT_SOURCES:
            switch (action.status) {
                case ActionStatus.Success:
                    return {
                        ...state,
                        sourceInit: true,
                    }
                default:
                    return state
            }
        case ADD_SOURCE:
            switch (action.status) {
                case ActionStatus.Request:
                    return {
                        ...state,
                        fetchingItems: true,
                        settings: {
                            ...state.settings,
                            changed: true,
                            saving: true,
                        },
                    }
                default:
                    return {
                        ...state,
                        fetchingItems: state.fetchingTotal !== 0,
                        settings: {
                            ...state.settings,
                            saving: action.batch,
                        },
                    }
            }
        case DELETE_SOURCE: {
            const nextBySource = { ...state.unseenBySource }
            const removed = nextBySource[action.source.sid] || 0
            delete nextBySource[action.source.sid]
            const nextAll = Math.max(0, state.unseenAll - removed)
            saveStoredUnseen(nextBySource, nextAll)
            return {
                ...state,
                unseenBySource: nextBySource,
                unseenAll: nextAll,
                settings: {
                    ...state.settings,
                    changed: true,
                },
            }
        }
        case UPDATE_SOURCE:
        case UPDATE_SOURCE_GROUP:
        case ADD_SOURCE_TO_GROUP:
        case REMOVE_SOURCE_FROM_GROUP:
        case REORDER_SOURCE_GROUPS:
        case DELETE_SOURCE_GROUP:
            return {
                ...state,
                settings: {
                    ...state.settings,
                    changed: true,
                },
            }
        case INIT_FEEDS:
            switch (action.status) {
                case ActionStatus.Request:
                    return state
                default:
                    return {
                        ...state,
                        feedInit: true,
                    }
            }
        case SYNC_SERVICE:
            switch (action.status) {
                case ActionStatus.Request:
                    return {
                        ...state,
                        syncing: true,
                    }
                case ActionStatus.Failure:
                    return {
                        ...state,
                        syncing: false,
                        refreshFailures: state.refreshFailures + 1,
                        logMenu: {
                            ...state.logMenu,
                            notify: true,
                            logs: [
                                ...state.logMenu.logs.slice(-99),
                                new AppLog(
                                    AppLogType.Failure,
                                    intl.get("log.syncFailure"),
                                    String(action.err)
                                ),
                            ],
                        },
                    }
                default:
                    return {
                        ...state,
                        syncing: false,
                    }
            }
        case REFRESH_STATUS:
            if (action.phase === "start")
                return {
                    ...state,
                    refreshRunning: true,
                    refreshAdded: 0,
                    refreshFailures: 0,
                    lastFetched: new Date(),
                }
            if (action.phase === "error")
                return { ...state, refreshFailures: state.refreshFailures + 1 }
            return {
                ...state,
                refreshRunning: false,
                fetchingItems: false,
                refreshCompletedAt: Date.now(),
            }
        case FETCH_ITEMS:
            switch (action.status) {
                case ActionStatus.Request:
                    return {
                        ...state,
                        fetchingItems: true,
                        fetchingProgress: 0,
                        fetchingTotal: action.fetchCount,
                    }
                case ActionStatus.Failure:
                    return {
                        ...state,
                        refreshFailures: state.refreshFailures + 1,
                        logMenu: {
                            ...state.logMenu,
                            notify: !state.logMenu.display,
                            logs: [
                                ...state.logMenu.logs.slice(-99),
                                new AppLog(
                                    AppLogType.Failure,
                                    intl.get("log.fetchFailure", {
                                        name:
                                            action.errSource?.name ||
                                            intl.get("sources.untitled"),
                                    }),
                                    String(action.err)
                                ),
                            ],
                        },
                    }
                case ActionStatus.Success: {
                    const isFocused = globalThis.utils?.isFocused?.() ?? true
                    const nextBySource = { ...state.unseenBySource }
                    let nextAll = state.unseenAll
                    for (const item of action.items) {
                        if (item.hasRead || item.hidden || item.feedHidden)
                            continue
                        const viewingSource =
                            isFocused && state.menuKey === "s-" + item.source
                        if (!viewingSource) {
                            nextBySource[item.source] =
                                (nextBySource[item.source] || 0) + 1
                        }
                        const viewingAll = isFocused && state.menuKey === ALL
                        if (!viewingAll) {
                            nextAll += 1
                        }
                    }
                    saveStoredUnseen(nextBySource, nextAll)
                    return {
                        ...state,
                        refreshAdded: state.refreshAdded + action.items.length,
                        unseenBySource: nextBySource,
                        unseenAll: nextAll,
                        fetchingItems: false,
                        fetchingTotal: 0,
                    }
                }
                case ActionStatus.Intermediate:
                    return {
                        ...state,
                        fetchingProgress: state.fetchingProgress + 1,
                    }
                default:
                    return state
            }
        case UPDATE_UNREAD_COUNTS: {
            const nextBySource = { ...state.unseenBySource }
            let reduced = 0
            let changed = false
            for (const [k, prevCount] of Object.entries(nextBySource)) {
                const sid = Number(k)
                const cap = Math.max(0, action.sources[sid]?.unreadCount || 0)
                if (prevCount > cap) {
                    reduced += prevCount - cap
                    changed = true
                    if (cap <= 0) delete nextBySource[sid]
                    else nextBySource[sid] = cap
                }
            }
            const totalUnreadCap = Object.values(action.sources)
                .filter(s => s && !s.hidden)
                .reduce((acc, s) => acc + Math.max(0, s.unreadCount || 0), 0)
            const nextAll = Math.min(
                totalUnreadCap,
                Math.max(0, state.unseenAll - reduced)
            )
            if (!changed && nextAll === state.unseenAll) return state
            saveStoredUnseen(nextBySource, nextAll)
            return {
                ...state,
                unseenBySource: nextBySource,
                unseenAll: nextAll,
            }
        }
        case MARK_READ:
        case TOGGLE_HIDDEN: {
            if (
                action.type === TOGGLE_HIDDEN &&
                (action.item.hidden ||
                    action.item.hasRead ||
                    action.item.feedHidden)
            )
                return state
            if (
                action.type === MARK_READ &&
                (action.item.hidden || action.item.feedHidden)
            )
                return state
            const sid = action.item.source
            const cur = state.unseenBySource[sid] || 0
            if (cur <= 0 && state.unseenAll <= 0) return state
            const nextBySource = { ...state.unseenBySource }
            if (cur <= 1) delete nextBySource[sid]
            else nextBySource[sid] = cur - 1
            const nextAll =
                cur > 0 ? Math.max(0, state.unseenAll - 1) : state.unseenAll
            saveStoredUnseen(nextBySource, nextAll)
            return {
                ...state,
                unseenBySource: nextBySource,
                unseenAll: nextAll,
            }
        }
        case MARK_ALL_READ: {
            if (!action.time) {
                const nextBySource = { ...state.unseenBySource }
                let nextAll = state.unseenAll
                if (!action.sids?.length && !action.itemIds) {
                    nextAll = 0
                    for (const k of Object.keys(nextBySource))
                        delete nextBySource[Number(k)]
                } else if (action.sids?.length) {
                    let cleared = 0
                    for (const sid of action.sids) {
                        cleared += nextBySource[sid] || 0
                        delete nextBySource[sid]
                    }
                    nextAll =
                        state.menuKey === ALL
                            ? 0
                            : Math.max(0, nextAll - cleared)
                }
                saveStoredUnseen(nextBySource, nextAll)
                return {
                    ...state,
                    unseenBySource: nextBySource,
                    unseenAll: nextAll,
                }
            }
            return state
        }
        case SELECT_PAGE:
            switch (action.pageType) {
                case PageType.AllArticles: {
                    saveStoredUnseen(state.unseenBySource, 0)
                    return {
                        ...state,
                        unseenAll: 0,
                        menu: state.menu && action.keepMenu,
                        menuKey: ALL,
                        title: intl.get("allArticles"),
                    }
                }
                case PageType.Sources: {
                    const nextBySource = { ...state.unseenBySource }
                    let cleared = 0
                    if (action.menuKey?.startsWith("s-")) {
                        const sid = Number(action.menuKey.slice(2))
                        cleared += nextBySource[sid] || 0
                        delete nextBySource[sid]
                    } else if (
                        action.menuKey?.startsWith("g-") &&
                        action.sids?.length
                    ) {
                        for (const sid of action.sids) {
                            cleared += nextBySource[sid] || 0
                            delete nextBySource[sid]
                        }
                    }
                    const nextAll = Math.max(0, state.unseenAll - cleared)
                    saveStoredUnseen(nextBySource, nextAll)
                    return {
                        ...state,
                        unseenBySource: nextBySource,
                        unseenAll: nextAll,
                        menu: state.menu && action.keepMenu,
                        menuKey: action.menuKey,
                        title: action.title,
                    }
                }
            }
        case CLOSE_CONTEXT_MENU:
            return {
                ...state,
                contextMenu: {
                    type: ContextMenuType.Hidden,
                },
            }
        case OPEN_ITEM_MENU:
            return {
                ...state,
                contextMenu: {
                    type: ContextMenuType.Item,
                    event: action.event,
                    target: [action.item, action.feedId],
                },
            }
        case OPEN_TEXT_MENU:
            return {
                ...state,
                contextMenu: {
                    type: ContextMenuType.Text,
                    position: action.position,
                    target: action.item,
                },
            }
        case OPEN_VIEW_MENU:
            return {
                ...state,
                contextMenu: {
                    type:
                        state.contextMenu.type === ContextMenuType.View
                            ? ContextMenuType.Hidden
                            : ContextMenuType.View,
                    event: "#view-toggle",
                },
            }
        case OPEN_GROUP_MENU:
            return {
                ...state,
                contextMenu: {
                    type: ContextMenuType.Group,
                    event: action.event,
                    target:
                        action.gid !== undefined
                            ? { sids: action.sids, gid: action.gid }
                            : action.sids,
                },
            }
        case OPEN_IMAGE_MENU:
            return {
                ...state,
                contextMenu: {
                    type: ContextMenuType.Image,
                    position: action.position,
                },
            }
        case OPEN_MARK_ALL_MENU:
            return {
                ...state,
                contextMenu: {
                    type:
                        state.contextMenu.type === ContextMenuType.MarkRead
                            ? ContextMenuType.Hidden
                            : ContextMenuType.MarkRead,
                    event: "#mark-all-toggle",
                },
            }
        case SET_MENU_OPEN:
            return state.menu === action.open
                ? state
                : {
                      ...state,
                      menu: action.open,
                  }
        case TOGGLE_MENU:
            return {
                ...state,
                menu: !state.menu,
            }
        case SAVE_SETTINGS:
            return {
                ...state,
                settings: {
                    ...state.settings,
                    display: true,
                    changed: true,
                    saving: !state.settings.saving,
                },
            }
        case TOGGLE_SETTINGS:
            return {
                ...state,
                settings: {
                    display: action.open,
                    changed: false,
                    sids: action.sids,
                    saving: false,
                },
            }
        case TOGGLE_LOGS:
            return {
                ...state,
                logMenu: {
                    ...state.logMenu,
                    display: !state.logMenu.display,
                    notify: false,
                },
            }
        case CLEAR_LOGS:
            return {
                ...state,
                logMenu: {
                    ...state.logMenu,
                    notify: false,
                    logs: [],
                },
            }
        case PUSH_NOTIFICATION:
            return {
                ...state,
                logMenu: {
                    ...state.logMenu,
                    notify: true,
                    logs: [
                        ...state.logMenu.logs.slice(-99),
                        new AppLog(
                            AppLogType.Article,
                            action.title,
                            action.source,
                            action.iid
                        ),
                    ],
                },
            }
        default:
            return state
    }
}
