import * as React from "react"
import { useMemo, useCallback, useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import { SourceGroup } from "../schema-types"
import { RSSSource } from "../scripts/models/source"
import { initFeeds } from "../scripts/models/feed"
import { useAppSelector, useAppDispatch } from "../scripts/reducer"
import { toggleMenu, openGroupMenu } from "../scripts/models/app"
import { toggleGroupExpansion } from "../scripts/models/group"
import {
    selectAllArticles,
    selectSources,
    toggleSearch,
} from "../scripts/models/page"
import {
    makeStyles,
    mergeClasses,
    Tree,
    TreeOpenChangeData,
} from "@fluentui/react-components"
import { useFocusFinders } from "@fluentui/react-tabster"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"
import { useIsWideScreen } from "./utils/hooks/useIsWideScreen"
import { useIsBlurred } from "./utils/hooks/useIsBlurred"
import { useArticleOverlayOpen } from "./utils/hooks/useArticleOverlayOpen"
import { Icon } from "@fluentui/react"
import { useFolders } from "./personal/folders"
import { useMenuCollections } from "./menu/useMenuCollections"
import { MenuCollectionsSection } from "./menu/MenuCollectionsSection"
import { MenuFoldersAndTagsSection } from "./menu/MenuFoldersAndTagsSection"
import { MenuSubscriptionsSection } from "./menu/MenuSubscriptionsSection"

const OPEN_FOLDERS_KEY = "personal:openFolders"

function loadOpenFolders(): Set<string> {
    try {
        const raw = localStorage.getItem(OPEN_FOLDERS_KEY)
        if (!raw) return new Set()
        const arr = JSON.parse(raw)
        return Array.isArray(arr)
            ? new Set(arr.filter(v => typeof v === "string"))
            : new Set()
    } catch {
        return new Set()
    }
}

const useMenuClasses = makeStyles({
    menuBtn: {
        height: "var(--navHeight)",
        lineHeight: "var(--navHeight)",
    },
    menuBtnBlurred: {
        color: "var(--neutralSecondaryAlt)",
    },
    menuGroupDarwin: {
        display: "inline-flex",
        float: "right",
    },
    menuHeader: {
        height: "var(--navHeight)",
        WebkitAppRegion: "drag",
    },
    menuContainer: {
        "position": "fixed",
        "zIndex": 5,
        "left": 0,
        "top": 0,
        "width": "100%",
        "height": "100%",
        "pointerEvents": "none",
        "@media (min-width: 1280px)": {
            width: "var(--sidebarWidth, 276px) !important",
            background: "none",
            backdropFilter: "none",
        },
    },
    menuContainerShow: {
        pointerEvents: "unset",
    },
    menuArticleBlurred: {
        filter: "var(--blur)",
    },
    menuInner: {
        "position": "absolute",
        "left": 0,
        "top": 0,
        "width": "var(--sidebarWidth, 276px)",
        "height": "100%",
        "backgroundColor": "var(--neutralLighterAltOpacity)",
        "backdropFilter": "var(--blur)",
        "boxShadow": "5px 0 25px #0004",
        "boxSizing": "border-box",
        "transition":
            "clip-path var(--transition-timing) 0.32s, opacity cubic-bezier(0, 0, 0.2, 1) 0.32s",
        "clipPath": "inset(0 100% 0 0)",
        "opacity": 0,
        "@media (min-width: 1280px)": {
            backgroundColor: "var(--sidebarBg, var(--neutralLighter))",
            boxShadow: "none",
            borderRight: "1px solid var(--neutralQuaternaryAlt)",
        },
    },
    menuInnerShow: {
        "clipPath": "inset(0 -50px 0 0)",
        "opacity": 1,
        "@media (min-width: 1280px)": {
            clipPath: "inset(0)",
        },
    },
    menuInnerDarwin: {
        "@media (min-width: 1280px)": {
            background: "none",
        },
    },
    navWrapper: {
        maxHeight: "calc(100% - var(--navHeight))",
        overflowX: "hidden",
        overflowY: "auto",
        paddingBottom: "16px",
        boxSizing: "border-box",
    },
    tree: {
        paddingTop: 0,
        paddingBottom: 0,
    },
})

export const Menu: React.FC = () => {
    const { folders } = useFolders()
    const [openFoldersSet, setOpenFoldersSet] =
        useState<Set<string>>(loadOpenFolders)
    const dispatch = useAppDispatch()
    const menuClasses = useMenuClasses()
    const { findFirstFocusable } = useFocusFinders()
    const isWideScreen = useIsWideScreen()
    const isDarwin = globalThis.utils.platform === "darwin"
    const isBlurred = useIsBlurred()

    const status = useAppSelector(
        s => s.app.sourceInit && !s.app.settings.display
    )
    const display = useAppSelector(s => s.app.menu)
    const selected = useAppSelector(s => s.app.menuKey)
    const sources = useAppSelector(s => s.sources)
    const groups = useAppSelector(s => s.groups)
    const searchOn = useAppSelector(s => s.page.searchOn)
    const unseenAll = useAppSelector(s => s.app.unseenAll)
    const unseenBySource = useAppSelector(s => s.app.unseenBySource)
    const articleOverlayOpen = useArticleOverlayOpen()
    const { counts } = useMenuCollections()

    const openItems = useMemo(
        () =>
            new Set([
                ...openFoldersSet,
                ...groups
                    .filter(g => g.isMultiple && g.expanded)
                    .map(g => "g-" + g.gid),
            ]),
        [groups, openFoldersSet]
    )

    const handleToggleMenu = useCallback(
        () => dispatch(toggleMenu()),
        [dispatch]
    )
    const handleToggleSearch = useCallback(
        () => dispatch(toggleSearch()),
        [dispatch]
    )
    const handleAllArticles = useCallback(
        (init = false) => {
            dispatch(selectAllArticles(init))
            dispatch(initFeeds())
        },
        [dispatch]
    )
    const handleSelectSourceGroup = useCallback(
        (group: SourceGroup, menuKey: string) => {
            dispatch(selectSources(group.sids, menuKey, group.name))
            dispatch(initFeeds())
        },
        [dispatch]
    )
    const handleSelectSource = useCallback(
        (source: RSSSource) => {
            dispatch(
                selectSources([source.sid], "s-" + source.sid, source.name)
            )
            dispatch(initFeeds())
        },
        [dispatch]
    )
    const handleGroupContextMenu = useCallback(
        (sids: number[], event: React.MouseEvent, gid?: number) => {
            dispatch(openGroupMenu(sids, event, gid))
        },
        [dispatch]
    )

    const handleOpenChange = useCallback(
        (_event: unknown, data: TreeOpenChangeData) => {
            if (
                data.type === "ExpandIconClick" ||
                data.type === "ArrowRight" ||
                data.type === "ArrowLeft"
            ) {
                const value = String(data.value)
                if (value.startsWith("g-")) {
                    const gid = Number.parseInt(value.slice(2))
                    dispatch(toggleGroupExpansion(gid))
                }
                if (value.startsWith("folder:"))
                    setOpenFoldersSet(old => {
                        const next = new Set(old)
                        if (next.has(value)) next.delete(value)
                        else next.add(value)
                        try {
                            localStorage.setItem(
                                OPEN_FOLDERS_KEY,
                                JSON.stringify([...next])
                            )
                        } catch {
                            // Ignore quota errors.
                        }
                        return next
                    })
            }
        },
        [dispatch]
    )

    const totalUnread = useMemo(
        () =>
            Object.values(sources)
                .filter(s => s && !s.hidden)
                .reduce((acc, s) => acc + (s.unreadCount || 0), 0),
        [sources]
    )

    const treeRef = useRef<HTMLDivElement>(null)
    const previousDisplayRef = useRef(display)
    useEffect(() => {
        if (display && !previousDisplayRef.current) {
            findFirstFocusable(treeRef.current)?.focus()
        }
        previousDisplayRef.current = display
    }, [display, findFirstFocusable])

    if (!status) return null

    return (
        <div
            className={mergeClasses(
                menuClasses.menuContainer,
                display && menuClasses.menuContainerShow,
                articleOverlayOpen && menuClasses.menuArticleBlurred
            )}
            onClick={handleToggleMenu}>
            <div
                className={mergeClasses(
                    menuClasses.menuInner,
                    display && menuClasses.menuInnerShow,
                    isDarwin && menuClasses.menuInnerDarwin
                )}
                onClick={e => e.stopPropagation()}>
                <div className={menuClasses.menuHeader}>
                    {display && (
                        <FlatButtonGroup
                            styleClass={
                                isDarwin
                                    ? menuClasses.menuGroupDarwin
                                    : undefined
                            }>
                            <FlatButton
                                styleClass={mergeClasses(
                                    menuClasses.menuBtn,
                                    isBlurred
                                        ? menuClasses.menuBtnBlurred
                                        : undefined
                                )}
                                title={`${intl.get("menu.close")} (F1)`}
                                ariaLabel={intl.get("menu.close")}
                                onClick={handleToggleMenu}>
                                {isWideScreen ? (
                                    <Icon
                                        iconName={
                                            isDarwin
                                                ? "SidePanel"
                                                : "GlobalNavButton"
                                        }
                                    />
                                ) : (
                                    <Icon iconName="Back" />
                                )}
                            </FlatButton>
                        </FlatButtonGroup>
                    )}
                </div>
                <div className={menuClasses.navWrapper}>
                    <Tree
                        ref={treeRef}
                        className={menuClasses.tree}
                        size="small"
                        appearance="subtle-alpha"
                        openItems={openItems}
                        onOpenChange={handleOpenChange}>
                        <MenuCollectionsSection
                            selected={selected}
                            searchOn={searchOn}
                            totalUnread={totalUnread}
                            unseenAll={unseenAll}
                            counts={counts}
                            onToggleSearch={handleToggleSearch}
                            onAllArticles={handleAllArticles}
                        />
                        <MenuFoldersAndTagsSection
                            selected={selected}
                            folders={folders}
                            unfiledCount={counts.unfiled}
                        />
                        <MenuSubscriptionsSection
                            selected={selected}
                            groups={groups}
                            sources={sources}
                            unseenBySource={unseenBySource}
                            onSelectGroup={handleSelectSourceGroup}
                            onSelectSource={handleSelectSource}
                            onContextMenu={handleGroupContextMenu}
                        />
                    </Tree>
                </div>
            </div>
        </div>
    )
}
