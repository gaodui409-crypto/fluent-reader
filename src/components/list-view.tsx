import * as React from "react"
import {
    CSSProperties,
    useLayoutEffect,
    useRef,
    useState,
    useEffect,
} from "react"
import intl from "react-intl-universal"
import { Icon, useTheme } from "@fluentui/react"
import { useAppDispatch, useAppSelector } from "../scripts/reducer"
import { saveReadingPreferences } from "../scripts/models/reading"
import { FlatButton } from "./utils/FlatButton"
import { makeStyles, mergeClasses } from "@griffel/react"
import {
    LIST_ARTICLE_MIN_WIDTH,
    LIST_VIEW_MIN_WIDTH,
    ViewType,
} from "../schema-types"
import Article from "./article"
import { Feed } from "./feeds/feed"
import ArticleSearch from "./utils/article-search"
import { ResizeHandle } from "./utils/ResizeHandle"
import { useResizableWidth } from "./utils/hooks/useResizableWidth"
import { ContextMenuType } from "../scripts/models/app"

const useStyles = makeStyles({
    root: {
        display: "flex",
        height: "calc(100% - var(--selectionHeight, 0px))",
        position: "relative",
        isolation: "isolate",
        marginTop: "calc(-1 * var(--navHeight))",
        marginLeft: 0,
        transition: "margin-left var(--transition-timing) 0.32s",
        overflow: "clip",
        backgroundColor: "var(--colorNeutralBackground1)",
    },
    menuOpen: {
        "@media (min-width: 1280px)": {
            marginLeft: "var(--sidebarWidth, 276px)",
        },
    },
    listPane: {
        width: "var(--list-view-width)",
        minWidth: `${LIST_VIEW_MIN_WIDTH}px`,
        flexShrink: 0,
        backgroundColor: "var(--neutralLighterAlt)",
        borderRight: "1px solid var(--neutralQuaternaryAlt)",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        paddingTop: "var(--navHeight)",
        boxSizing: "border-box",
    },
    articlePane: {
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        paddingTop: "var(--navHeight)",
        height: "100%",
        boxSizing: "border-box",
        backgroundColor: "var(--colorNeutralBackground1)",
        position: "relative",
    },
    paneHeader: {
        "::before": {
            content: '""',
            display: "block",
            width: "100%",
            borderBottom: "1px solid var(--neutralQuaternaryAlt)",
            position: "absolute",
            top: "calc(var(--navHeight) - 1px)",
        },
    },
    feed: {
        "flexGrow": 1,
        "flexBasis": 0,
        "minHeight": 0,
        "& .list-feed": {
            marginTop: 0,
            height: "100%",
        },
    },
    resizeHandle: {
        top: "var(--navHeight)",
        right: "-4px",
    },
    logoPane: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
    },
    logo: {
        display: "block",
        width: "110px",
        height: "110px",
        opacity: 0.55,
        userSelect: "none",
    },
    rail: {
        width: "28px",
        flexShrink: 0,
        paddingTop: "var(--navHeight)",
        backgroundColor: "var(--neutralLighterAlt)",
        borderRight: "1px solid var(--neutralQuaternaryAlt)",
    },
    railButton: { width: "28px", height: "64px" },
    listControl: {
        width: "100%",
        height: "32px",
        lineHeight: "32px",
        textAlign: "right",
        paddingRight: "12px",
        flexShrink: 0,
        fontSize: "12px",
        color: "var(--neutralSecondary)",
    },
    floating: {
        position: "absolute",
        left: "28px",
        top: 0,
        zIndex: 3,
        boxShadow: "6px 0 24px #0004",
    },
    concealed: { visibility: "hidden", pointerEvents: "none" },
})

export function ListView({
    feedId,
    itemId,
    menuOn,
}: Readonly<{
    feedId: string
    itemId: number
    menuOn: boolean
}>) {
    const classes = useStyles()
    const theme = useTheme()
    const dispatch = useAppDispatch()
    const collapsed = useAppSelector(s => s.reading.collapseList)
    const [peek, setPeek] = useState(false)
    const menuActive = useAppSelector(
        s => s.app.contextMenu.type !== ContextMenuType.Hidden
    )
    const interaction = useRef({ menu: false, inside: false })
    interaction.current.menu = menuActive
    const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

    const reveal = () => {
        clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(() => setPeek(true), 140)
    }
    const conceal = () => {
        clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(() => {
            if (!interaction.current.menu && !interaction.current.inside)
                setPeek(false)
        }, 260)
    }

    useEffect(() => {
        if (menuActive) clearTimeout(hoverTimer.current)
        else if (!interaction.current.inside) conceal()
    }, [menuActive])

    useEffect(() => () => clearTimeout(hoverTimer.current), [])

    const container = useRef<HTMLDivElement>(null)
    const [availableWidth, setAvailableWidth] = useState(0)
    const { requestedWidth, handleProps } = useResizableWidth({
        getWidth: window.settings.getListViewWidth,
        saveWidth: window.settings.setListViewWidth,
        minWidth: LIST_VIEW_MIN_WIDTH,
        maxWidth: Math.max(
            LIST_VIEW_MIN_WIDTH,
            availableWidth - LIST_ARTICLE_MIN_WIDTH
        ),
    })

    useLayoutEffect(() => {
        const node = container.current
        if (!node) return
        setAvailableWidth(node.clientWidth)
        const observer = new ResizeObserver(() =>
            setAvailableWidth(node.clientWidth)
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    return (
        <div
            ref={container}
            className={mergeClasses(
                "list-main",
                classes.root,
                menuOn && "menu-on",
                menuOn && classes.menuOpen
            )}
            style={
                {
                    "--list-view-width": `min(${requestedWidth}px, calc(100% - ${LIST_ARTICLE_MIN_WIDTH}px))`,
                } as CSSProperties
            }>
            <div
                className={classes.rail}
                style={{ display: collapsed ? undefined : "none" }}
                onMouseEnter={reveal}
                onMouseLeave={conceal}>
                <FlatButton
                    styleClass={classes.railButton}
                    title={intl.get("organize.expandList")}
                    onClick={() => {
                        setPeek(false)
                        void dispatch(
                            saveReadingPreferences({ collapseList: false })
                        )
                    }}>
                    <Icon iconName="ChevronRight" />
                </FlatButton>
            </div>
            <div
                onMouseEnter={() => {
                    interaction.current.inside = true
                    clearTimeout(hoverTimer.current)
                }}
                onMouseLeave={() => {
                    interaction.current.inside = false
                    conceal()
                }}
                onFocus={() => {
                    clearTimeout(hoverTimer.current)
                    setPeek(true)
                }}
                onBlur={event => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                        conceal()
                }}
                onKeyDown={event => {
                    if (event.key === "Escape" && collapsed && !menuActive) {
                        event.stopPropagation()
                        setPeek(false)
                    }
                }}
                className={mergeClasses(
                    "list-feed-container",
                    classes.listPane,
                    classes.paneHeader,
                    collapsed && classes.floating,
                    collapsed && !peek && classes.concealed
                )}>
                <FlatButton
                    styleClass={classes.listControl}
                    title={intl.get(
                        collapsed ? "organize.pinList" : "organize.collapseList"
                    )}
                    onClick={() => {
                        setPeek(false)
                        void dispatch(
                            saveReadingPreferences({ collapseList: !collapsed })
                        )
                    }}>
                    <Icon iconName={collapsed ? "Pinned" : "ChevronLeft"} />{" "}
                    {intl.get(
                        collapsed ? "organize.pinList" : "organize.collapseList"
                    )}
                </FlatButton>
                <ArticleSearch inline />
                <div className={classes.feed}>
                    <Feed
                        viewType={ViewType.List}
                        feedId={feedId}
                        key={feedId}
                    />
                </div>
                <ResizeHandle
                    label="调整文章列表宽度"
                    cursor="col-resize"
                    {...handleProps}
                    styleClass={classes.resizeHandle}
                />
            </div>
            {itemId ? (
                <div
                    className={mergeClasses(
                        "side-article-wrapper",
                        classes.articlePane,
                        classes.paneHeader
                    )}>
                    <Article itemId={itemId} side />
                </div>
            ) : (
                <div
                    className={mergeClasses(
                        "side-logo-wrapper",
                        classes.articlePane,
                        classes.logoPane
                    )}>
                    <img
                        className={classes.logo}
                        src={
                            theme.isInverted
                                ? "icons/logo-outline-dark.svg"
                                : "icons/logo-outline.svg"
                        }
                        alt="Fluent Reader logo"
                        draggable={false}
                    />
                </div>
            )}
        </div>
    )
}
