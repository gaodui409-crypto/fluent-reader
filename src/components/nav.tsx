import * as React from "react"
import { openOrganize } from "./personal/organize"
import { ReadingControls } from "./personal/reading-controls"
import { useState, useEffect, useCallback } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { IObjectWithKey } from "@fluentui/react"
import { useAppDispatch, useAppSelector } from "../scripts/reducer"
import { fetchItems } from "../scripts/models/item"
import {
    makeStyles,
    mergeClasses,
    ProgressBar,
} from "@fluentui/react-components"
import {
    toggleMenu,
    toggleLogMenu,
    toggleSettings,
    openViewMenu,
    openMarkAllMenu,
} from "../scripts/models/app"
import { toggleSearch } from "../scripts/models/page"
import { ViewType, WindowStateListenerType } from "../schema-types"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"
import { FlatButtonSeparator } from "./utils/FlatButtonSeparator"
import { useIsWideScreen } from "./utils/hooks/useIsWideScreen"
import { useArticleOverlayOpen } from "./utils/hooks/useArticleOverlayOpen"
import {
    AppWindowFocusChangeEvent,
    useIsBlurred,
} from "./utils/hooks/useIsBlurred"

const useClasses = makeStyles({
    nav: {
        "display": "flex",
        "transition": "padding-left var(--transition-timing) 0.32s",
        "&.searching .refresh-status": { display: "none" },
        "@media (max-width: 1360px)": {
            "&.menu-on.searching .reading-controls, &.menu-on.searching #log-toggle, &.menu-on.searching #full-search-toggle":
                { display: "none" },
        },
        "@media (max-width: 1060px)": {
            "&.searching .reading-controls, &.searching #log-toggle, &.searching #full-search-toggle":
                { display: "none" },
        },
        "@media (max-width: 800px)": {
            "&.searching button": { width: "36px" },
            "&.searching #mark-all-toggle, &.searching #view-toggle": {
                display: "none",
            },
        },
    },
    navContent: {
        flexGrow: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
    },
    windowControls: {
        flexShrink: 0,
    },
    progress: {
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 10,
        width: "100%",
        overflow: "hidden",
        background: "none",
    },
    navBlurred: {
        "--black": "var(--neutralSecondaryAlt)",
    },
    navContentBlurred: {
        position: "relative",
        zIndex: 1,
        filter: "var(--blur)",
    },
    navBtn: {
        height: "var(--navHeight)",
        lineHeight: "var(--navHeight)",
        zIndex: 1,
        position: "relative",
        WebkitAppRegion: "no-drag",
    },
    navBtnSystem: {
        position: "relative",
        zIndex: 10,
    },
    navBtnSystemItemOn: {
        color: "var(--whiteConstant)",
    },
    navBtnMinimize: {
        fontSize: "12px",
    },
    navGroupFirst: {
        marginLeft: "72px",
        flexShrink: 0,
    },
    navGroupRight: {
        marginLeft: "auto",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        zIndex: 2,
    },
    refreshStatus: {
        "display": "inline-block",
        "maxWidth": "176px",
        "marginRight": "4px",
        "overflow": "hidden",
        "textOverflow": "ellipsis",
        "whiteSpace": "nowrap",
        "verticalAlign": "middle",
        "fontSize": "12px",
        "color": "var(--neutralSecondary)",
        "WebkitAppRegion": "drag",
        "@media (max-width: 1080px)": { maxWidth: "95px" },
    },
    notifyDot: {
        color: "var(--primary)",
    },
})

function isInteractiveInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
    )
}

function hasOpenModalOrDialog(): boolean {
    return Array.from(
        document.querySelectorAll<HTMLElement>(
            ".ms-Dialog-main, .ms-Modal-scrollableContent, .fui-DialogSurface, .ms-ContextualMenu, .ms-Dropdown-callout, .ms-ComboBox-callout, .ms-DatePicker-callout, .fui-MenuPopover, .fui-Listbox"
        )
    ).some(
        el =>
            el.getClientRects().length > 0 &&
            getComputedStyle(el).visibility !== "hidden"
    )
}

const Nav: React.FC = () => {
    const searchOn = useAppSelector(state => state.page.searchOn)
    const viewType = useAppSelector(state => state.page.viewType)
    const itemId = useAppSelector(state => state.page.itemId)
    const classes = useClasses()
    const dispatch = useAppDispatch()
    const state = useAppSelector(state => state.app)
    const articleOverlayOpen = useArticleOverlayOpen()
    const [maximized, setMaximized] = useState(globalThis.utils.isMaximized())
    const isWideScreen = useIsWideScreen()
    const isBlurred = useIsBlurred()
    const [isFullscreen, setIsFullscreen] = useState(() =>
        globalThis.utils.isFullscreen()
    )
    const isDarwin = globalThis.utils.platform === "darwin"

    // Only floating search (non-ListView) shares horizontal space with <nav>.
    const floatingSearchOn = searchOn && viewType !== ViewType.List

    const setBodyFullscreenState = useCallback((fullscreen: boolean) => {
        if (fullscreen) document.body.classList.remove("not-fullscreen")
        else document.body.classList.add("not-fullscreen")
    }, [])

    const windowStateListener = useCallback(
        (type: WindowStateListenerType, windowState: boolean) => {
            switch (type) {
                case WindowStateListenerType.Maximized:
                    setMaximized(windowState)
                    break
                case WindowStateListenerType.Fullscreen:
                    setIsFullscreen(windowState)
                    setBodyFullscreenState(windowState)
                    break
                case WindowStateListenerType.Focused:
                    globalThis.dispatchEvent(
                        new CustomEvent<AppWindowFocusChangeEvent["detail"]>(
                            "app-window-focus-change",
                            { detail: { focused: windowState } }
                        )
                    )
                    break
            }
        },
        [setBodyFullscreenState]
    )

    const canFetch = useCallback(
        () =>
            state.sourceInit &&
            state.feedInit &&
            !state.syncing &&
            !state.fetchingItems &&
            !state.refreshRunning,
        [
            state.sourceInit,
            state.feedInit,
            state.syncing,
            state.fetchingItems,
            state.refreshRunning,
        ]
    )

    const fetch = useCallback(() => {
        if (canFetch()) void dispatch(fetchItems()).catch(console.error)
    }, [canFetch, dispatch])

    const menu = useCallback(() => dispatch(toggleMenu()), [dispatch])
    const logs = useCallback(() => dispatch(toggleLogMenu()), [dispatch])
    const search = useCallback(() => dispatch(toggleSearch()), [dispatch])
    const settings = useCallback(() => dispatch(toggleSettings()), [dispatch])
    const markAll = useCallback(() => dispatch(openMarkAllMenu()), [dispatch])
    const markAllDirect = useCallback(openOrganize, [])
    const views = useCallback(() => {
        if (state.contextMenu.event !== "#view-toggle") {
            dispatch(openViewMenu())
        }
    }, [state.contextMenu.event, dispatch])

    const navShortcutsHandler = useCallback(
        (e: KeyboardEvent | IObjectWithKey) => {
            const kb = e as KeyboardEvent
            if (kb.ctrlKey || kb.altKey || kb.metaKey) return
            if (state.settings.display || hasOpenModalOrDialog()) return

            switch (e.key) {
                case "F1":
                    if (!articleOverlayOpen) {
                        kb.preventDefault?.()
                        kb.stopPropagation?.()
                        menu()
                    }
                    return
                case "F2":
                    if (!articleOverlayOpen) {
                        kb.preventDefault?.()
                        kb.stopPropagation?.()
                        search()
                    }
                    return
                case "F5":
                    kb.preventDefault?.()
                    kb.stopPropagation?.()
                    fetch()
                    return
                case "F6":
                    kb.preventDefault?.()
                    kb.stopPropagation?.()
                    markAllDirect()
                    return
                case "F7":
                    if (!articleOverlayOpen) {
                        kb.preventDefault?.()
                        kb.stopPropagation?.()
                        logs()
                    }
                    return
                case "F8":
                    if (!articleOverlayOpen) {
                        kb.preventDefault?.()
                        kb.stopPropagation?.()
                        views()
                    }
                    return
                case "F9":
                    if (!articleOverlayOpen) {
                        kb.preventDefault?.()
                        kb.stopPropagation?.()
                        settings()
                    }
                    return
            }

            // J / K list card keyboard navigation when no article, input, or modal is active
            if (
                !itemId &&
                (e.key === "j" ||
                    e.key === "J" ||
                    e.key === "k" ||
                    e.key === "K") &&
                !isInteractiveInput(kb.target) &&
                !hasOpenModalOrDialog()
            ) {
                const cards = Array.from(
                    document.querySelectorAll<HTMLElement>(
                        "#refocus div[data-iid]"
                    )
                )
                if (!cards.length) return
                kb.preventDefault?.()
                const active = document.activeElement as HTMLElement | null
                const idx = active ? cards.indexOf(active) : -1
                const delta = e.key === "j" || e.key === "J" ? 1 : -1
                const nextIdx =
                    idx < 0
                        ? 0
                        : Math.max(0, Math.min(cards.length - 1, idx + delta))
                const nextCard = cards[nextIdx]
                nextCard?.focus()
                nextCard?.scrollIntoView({ block: "nearest" })
            }
        },
        [
            state.settings.display,
            articleOverlayOpen,
            itemId,
            menu,
            search,
            fetch,
            markAllDirect,
            logs,
            views,
            settings,
        ]
    )

    useEffect(() => {
        setBodyFullscreenState(globalThis.utils.isFullscreen())
        globalThis.utils.addWindowStateListener(windowStateListener)
    }, [setBodyFullscreenState, windowStateListener])

    useEffect(() => {
        window.addEventListener("keydown", navShortcutsHandler, true)
        if (globalThis.utils.platform === "darwin")
            globalThis.utils.addTouchBarEventsListener(navShortcutsHandler)

        return () => {
            window.removeEventListener("keydown", navShortcutsHandler, true)
        }
    }, [navShortcutsHandler])

    const minimize = () => {
        globalThis.utils.minimizeWindow()
    }

    const maximize = () => {
        globalThis.utils.maximizeWindow()
        setMaximized(!maximized)
    }

    const close = () => {
        globalThis.utils.closeWindow()
    }

    const isFetching = !canFetch()

    const getProgress = () => {
        return state.fetchingTotal > 0
            ? state.fetchingProgress / state.fetchingTotal
            : undefined
    }

    const isNonNavButtonShown = !state.settings.display
    const menuOn = state.menu
    const systemItemOnClass = articleOverlayOpen
        ? classes.navBtnSystemItemOn
        : undefined
    const firstGroupClass = mergeClasses(
        isDarwin && !isFullscreen ? classes.navGroupFirst : undefined
    )

    return (
        <nav
            className={mergeClasses(
                classes.nav,
                state.settings.display && "hide-btns",
                state.menu && "menu-on",
                floatingSearchOn && "searching",
                articleOverlayOpen && "item-on",
                isBlurred && classes.navBlurred
            )}>
            <div
                className={mergeClasses(
                    classes.navContent,
                    articleOverlayOpen && classes.navContentBlurred
                )}>
                {!menuOn && isNonNavButtonShown && (
                    <FlatButtonGroup styleClass={firstGroupClass}>
                        <FlatButton
                            styleClass={classes.navBtn}
                            title={`${intl.get("nav.menu")} (F1)`}
                            ariaLabel={intl.get("nav.menu")}
                            id="nav-menu-toggle-btn"
                            onClick={menu}>
                            <Icon
                                iconName={
                                    isDarwin ? "SidePanel" : "GlobalNavButton"
                                }
                            />
                        </FlatButton>
                    </FlatButtonGroup>
                )}
                <span
                    className="title"
                    style={{
                        visibility: floatingSearchOn ? "hidden" : undefined,
                    }}>
                    {state.title}
                </span>
                <FlatButtonGroup styleClass={classes.navGroupRight}>
                    {isNonNavButtonShown && (
                        <>
                            {(state.refreshRunning ||
                                state.refreshCompletedAt > 0) && (
                                <span
                                    className={mergeClasses(
                                        "refresh-status",
                                        classes.refreshStatus
                                    )}
                                    role="status"
                                    aria-live="polite"
                                    title={intl.get("refresh.explanation")}>
                                    {state.refreshRunning
                                        ? intl.get("refresh.working")
                                        : intl.get("refresh.result", {
                                              time: new Date(
                                                  state.refreshCompletedAt
                                              ).toLocaleTimeString([], {
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                              }),
                                              count: state.refreshAdded,
                                          })}
                                    {!state.refreshRunning &&
                                        state.refreshFailures > 0 &&
                                        intl.get("refresh.failures", {
                                            count: state.refreshFailures,
                                        })}
                                </span>
                            )}
                            <FlatButton
                                styleClass={classes.navBtn}
                                fetching={isFetching}
                                disabled={isFetching}
                                onClick={fetch}
                                title={`${intl.get("nav.refresh")} (F5)`}
                                ariaLabel={intl.get("nav.refresh")}>
                                <Icon iconName="Refresh" />
                            </FlatButton>
                            <FlatButton
                                styleClass={classes.navBtn}
                                id="mark-all-toggle"
                                onClick={markAll}
                                title="快捷标为已读"
                                ariaLabel="快捷标为已读"
                                onMouseDown={e => {
                                    if (
                                        state.contextMenu.event ===
                                        "#mark-all-toggle"
                                    )
                                        e.stopPropagation()
                                }}>
                                <Icon iconName="InboxCheck" />
                            </FlatButton>
                            <FlatButton
                                styleClass={classes.navBtn}
                                title="筛选归档 (F6)"
                                ariaLabel="筛选归档"
                                onClick={() => openOrganize()}>
                                <Icon iconName="Filter" />
                            </FlatButton>
                            <FlatButton
                                styleClass={classes.navBtn}
                                id="log-toggle"
                                title={`${intl.get("nav.notifications")} (F7)`}
                                ariaLabel={intl.get("nav.notifications")}
                                onClick={logs}>
                                {state.logMenu.notify ? (
                                    <Icon
                                        iconName="RingerSolid"
                                        className={classes.notifyDot}
                                    />
                                ) : (
                                    <Icon iconName="Ringer" />
                                )}
                            </FlatButton>
                            <span className="reading-controls">
                                <ReadingControls />
                            </span>
                            <FlatButton
                                styleClass={classes.navBtn}
                                id="view-toggle"
                                title={`${intl.get("nav.view")} (F8)`}
                                ariaLabel={intl.get("nav.view")}
                                onClick={views}
                                onMouseDown={e => {
                                    if (
                                        state.contextMenu.event ===
                                        "#view-toggle"
                                    )
                                        e.stopPropagation()
                                }}>
                                <Icon iconName="View" />
                            </FlatButton>
                            <FlatButton
                                styleClass={classes.navBtn}
                                title={`${intl.get(
                                    "personal.search"
                                )} (Ctrl+Shift+F)`}
                                ariaLabel={intl.get("personal.search")}
                                id="full-search-toggle"
                                onClick={() =>
                                    window.dispatchEvent(
                                        new Event("personal-search")
                                    )
                                }>
                                <Icon iconName="Search" />
                            </FlatButton>
                            <FlatButton
                                styleClass={classes.navBtn}
                                title={`${intl.get("nav.settings")} (F9)`}
                                ariaLabel={intl.get("nav.settings")}
                                onClick={settings}>
                                <Icon iconName="Settings" />
                            </FlatButton>
                        </>
                    )}
                    {!isDarwin && <FlatButtonSeparator />}
                </FlatButtonGroup>
            </div>
            {!isDarwin && (
                <FlatButtonGroup styleClass={classes.windowControls}>
                    <FlatButton
                        variant="system"
                        styleClass={mergeClasses(
                            classes.navBtn,
                            classes.navBtnSystem,
                            classes.navBtnMinimize,
                            systemItemOnClass
                        )}
                        title={intl.get("nav.minimize")}
                        ariaLabel={intl.get("nav.minimize")}
                        onClick={minimize}>
                        <Icon iconName="Remove" />
                    </FlatButton>
                    <FlatButton
                        variant="system"
                        styleClass={mergeClasses(
                            classes.navBtn,
                            classes.navBtnSystem,
                            systemItemOnClass
                        )}
                        title={intl.get("nav.maximize")}
                        ariaLabel={intl.get("nav.maximize")}
                        onClick={maximize}>
                        {maximized ? (
                            <Icon
                                iconName="ChromeRestore"
                                style={{ fontSize: 11 }}
                            />
                        ) : (
                            <Icon
                                iconName="Checkbox"
                                style={{ fontSize: 10 }}
                            />
                        )}
                    </FlatButton>
                    <FlatButton
                        variant="close"
                        styleClass={mergeClasses(
                            classes.navBtn,
                            classes.navBtnSystem,
                            systemItemOnClass
                        )}
                        title={intl.get("close")}
                        ariaLabel={intl.get("close")}
                        onClick={close}>
                        <Icon iconName="Cancel" />
                    </FlatButton>
                </FlatButtonGroup>
            )}
            {isFetching && (
                <ProgressBar
                    className={classes.progress}
                    shape="square"
                    value={getProgress()}
                />
            )}
        </nav>
    )
}

export default Nav
