import * as React from "react"
import { useMemo, useCallback, useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import { SourceGroup } from "../schema-types"
import { RSSSource } from "../scripts/models/source"
import { ALL, initFeeds } from "../scripts/models/feed"
import { useAppSelector, useAppDispatch } from "../scripts/reducer"
import { toggleMenu, openGroupMenu } from "../scripts/models/app"
import { toggleGroupExpansion } from "../scripts/models/group"
import {
    selectAllArticles,
    selectSources,
    toggleSearch,
    selectCollection,
} from "../scripts/models/page"
import {
    makeStyles,
    mergeClasses,
    ToggleButton,
    tokens,
    Tree,
    TreeItem,
    TreeItemLayout,
    TreeOpenChangeData,
    useSubtreeContext_unstable,
} from "@fluentui/react-components"
import { useFocusFinders } from "@fluentui/react-tabster"
import {
    Checkmark16Regular,
    DocumentOnePageMultiple16Regular,
    Filter12Filled,
    Search16Regular,
} from "@fluentui/react-icons"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"
import { useIsWideScreen } from "./utils/hooks/useIsWideScreen"
import { useIsBlurred } from "./utils/hooks/useIsBlurred"
import { useArticleOverlayOpen } from "./utils/hooks/useArticleOverlayOpen"
import { Icon } from "@fluentui/react"
import { clearReadLater } from "../scripts/models/library"
import { openBriefings } from "./personal/ai"
import { StackShim } from "@fluentui/react-migration-v8-v9"
import { useFolders, openFolders } from "./personal/folders"
import { refreshArchive } from "../scripts/models/archive"

const useMenuClasses = makeStyles({
    menuBtn: {
        height: "var(--navHeight)",
        lineHeight: "var(--navHeight)",
    },
    menuBtnBlurred: {
        color: "var(--neutralSecondaryAlt)",
    },
    menuGroupDarwin: {
        display: "flex",
        flexDirection: "row-reverse",
    },
    menuHeader: {
        height: "var(--navHeight)",
    },
    menuContainer: {
        "position": "fixed",
        "zIndex": 5,
        "left": 0,
        "top": 0,
        "width": "100%",
        "height": "100%",
        "pointerEvents": "none",
        "@media (min-width: 1440px)": {
            width: "280px !important",
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
        "width": "280px",
        "height": "100%",
        "backgroundColor": "var(--neutralLighterAltOpacity)",
        "backdropFilter": "var(--blur)",
        "boxShadow": "5px 0 25px #0004",
        "transition":
            "clip-path var(--transition-timing) 0.367s, opacity cubic-bezier(0, 0, 0.2, 1) 0.367s",
        "clipPath": "inset(0 100% 0 0)",
        "opacity": 0,
        "@media (min-width: 1440px)": {
            "backgroundColor": "var(--neutralLight)",
            "boxShadow": "none",
            "::after": {
                content: '""',
                display: "block",
                pointerEvents: "none",
                position: "absolute",
                top: "-10%",
                right: 0,
                width: "120%",
                height: "120%",
                boxShadow: "inset 5px 0 25px #0004",
            },
        },
    },
    menuInnerShow: {
        "clipPath": "inset(0 -50px 0 0)",
        "opacity": 1,
        "@media (min-width: 1440px)": {
            clipPath: "inset(0)",
        },
    },
    menuInnerDarwin: {
        "@media (min-width: 1440px)": {
            background: "none",
        },
    },
    navWrapper: {
        maxHeight: "calc(100% - var(--navHeight))",
        overflowX: "hidden",
        overflowY: "auto",
    },
    tree: {
        paddingTop: 0,
        paddingBottom: 0,
    },
    subsHeaderStack: {
        marginTop: "16px",
        marginBottom: "4px",
        marginLeft: "8px",
        marginRight: "8px",
    },
    subsHeader: {
        fontSize: "12px",
        color: tokens.colorNeutralForeground4,
        userSelect: "none",
    },
    favicon: {
        width: "16px",
        height: "16px",
        verticalAlign: "middle",
        userSelect: "none",
    },
    primaryIcon: {
        color: tokens.colorCompoundBrandForeground1,
    },
})

export const Menu: React.FC = () => {
    const { folders } = useFolders()
    const [openFoldersSet, setOpenFoldersSet] = useState(new Set<string>())
    const aiConfigured = useAppSelector(s => s.library.aiConfigured)
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
    const articleOverlayOpen = useArticleOverlayOpen()
    const items = useAppSelector(state => state.items)
    const [tags, setTags] = useState<string[]>([])
    const [counts, setCounts] = useState({ later: 0, starred: 0 })
    const feeds = useAppSelector(s => s.feeds)
    const hiddenLater = !!(feeds["later:"]?.filter.type & 4)
    const hiddenStarred = !!(feeds["starred:"]?.filter.type & 4)
    useEffect(() => {
        let active = true
        const timer = setTimeout(() => {
            window.db
                .execute(
                    "SELECT coalesce(sum(i.readLater),0),coalesce(sum(i.starred),0) FROM items i",
                    [],
                    "get"
                )
                .then(row => {
                    if (active)
                        setCounts({
                            later: Number(row[0]),
                            starred: Number(row[1]),
                        })
                })
                .catch(console.error)
            window.personal
                .tags()
                .then(values => {
                    if (active) setTags(values)
                })
                .catch(console.error)
        }, 150)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [items, sources, hiddenLater, hiddenStarred])

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

    const handleToggleMenu = useCallback(() => dispatch(toggleMenu()), [])
    const handleToggleSearch = useCallback(() => dispatch(toggleSearch()), [])
    const handleAllArticles = useCallback((init = false) => {
        dispatch(selectAllArticles(init))
        dispatch(initFeeds())
    }, [])
    const handleSelectSourceGroup = useCallback(
        (group: SourceGroup, menuKey: string) => {
            dispatch(selectSources(group.sids, menuKey, group.name))
            dispatch(initFeeds())
        },
        []
    )
    const handleSelectSource = useCallback((source: RSSSource) => {
        dispatch(selectSources([source.sid], "s-" + source.sid, source.name))
        dispatch(initFeeds())
    }, [])
    const handleGroupContextMenu = useCallback(
        (sids: number[], event: React.MouseEvent) => {
            dispatch(openGroupMenu(sids, event))
        },
        []
    )

    const handleOpenChange = useCallback(
        (_event: any, data: TreeOpenChangeData) => {
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
                        return next
                    })
            }
        },
        []
    )

    const [isUnreadSourcesOnly, setIsUnreadSourcesOnly] = useState(() =>
        globalThis.settings.getUnreadSourcesOnly()
    )

    const totalUnread = useMemo(
        () =>
            Object.values(sources)
                .filter(s => !s.hidden)
                .map(s => s.unreadCount)
                .reduce((a, b) => a + b, 0),
        [sources]
    )

    const treeRef = useRef<HTMLDivElement>(null)
    const previousDisplayRef = useRef(display)
    useEffect(() => {
        if (display && !previousDisplayRef.current) {
            findFirstFocusable(treeRef.current)?.focus()
        }
        previousDisplayRef.current = display
    }, [display])

    const renderSourceItem = (s: RSSSource) => {
        const key = "s-" + s.sid
        return (
            <MenuTreeItem
                key={key}
                value={key}
                label={s.name}
                isSelected={selected === key}
                icon={
                    s.iconurl ? (
                        <img
                            alt=""
                            className={menuClasses.favicon}
                            src={s.iconurl}
                        />
                    ) : undefined
                }
                unreadCount={s.unreadCount}
                onClick={() => handleSelectSource(s)}
                onContextMenu={e => {
                    handleGroupContextMenu([s.sid], e)
                }}
            />
        )
    }

    return (
        status && (
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
                                    title={intl.get("menu.close")}
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
                            <MenuTreeItem
                                value="search"
                                label={intl.get("search")}
                                icon={
                                    <Search16Regular
                                        className={menuClasses.primaryIcon}
                                    />
                                }
                                aside={
                                    searchOn ? (
                                        <Checkmark16Regular
                                            className={menuClasses.primaryIcon}
                                        />
                                    ) : undefined
                                }
                                onClick={handleToggleSearch}
                            />
                            <MenuTreeItem
                                value={ALL}
                                label={intl.get("allArticles")}
                                isSelected={selected === ALL}
                                icon={
                                    <DocumentOnePageMultiple16Regular
                                        className={menuClasses.primaryIcon}
                                    />
                                }
                                unreadCount={totalUnread}
                                onClick={() =>
                                    handleAllArticles(selected !== ALL)
                                }
                            />
                            <MenuTreeItem
                                value="later:"
                                aside={
                                    <span
                                        title={intl.get("organize.totalCount")}>
                                        {counts.later}
                                    </span>
                                }
                                label={intl.get("personal.readLater")}
                                isSelected={selected === "later:"}
                                onClick={() =>
                                    dispatch(selectCollection("later"))
                                }
                            />
                            <MenuTreeItem
                                value="starred:"
                                aside={
                                    <span
                                        title={intl.get("organize.totalCount")}>
                                        {counts.starred}
                                    </span>
                                }
                                label={intl.get("personal.favorites")}
                                isSelected={selected === "starred:"}
                                onClick={() =>
                                    dispatch(selectCollection("starred"))
                                }
                            />
                            {aiConfigured && (
                                <MenuTreeItem
                                    value="briefings"
                                    label={intl.get("ai.briefings")}
                                    onClick={openBriefings}
                                />
                            )}
                            {selected === "later:" && (
                                <MenuTreeItem
                                    value="clear-read-later"
                                    label={intl.get("personal.clearReadLater")}
                                    onClick={() =>
                                        void dispatch(clearReadLater()).catch(
                                            error =>
                                                window.utils.showErrorBox(
                                                    intl.get("personal.failed"),
                                                    String(error)
                                                )
                                        )
                                    }
                                />
                            )}
                            <MenuTreeItem
                                value="folder-manager"
                                label="＋管理文章文件夹"
                                onClick={() => openFolders()}
                            />
                            <MenuTreeItem
                                value="library:"
                                label="未分类资料"
                                isSelected={selected === "library:"}
                                onClick={() =>
                                    dispatch(
                                        selectCollection(
                                            "library",
                                            "",
                                            "未分类资料"
                                        )
                                    )
                                }
                            />
                            {folders
                                .filter(f => f.parentId === null)
                                .map(folder => (
                                    <MenuTreeItem
                                        key={"folder:" + folder.id}
                                        value={"folder:" + folder.id}
                                        label={folder.name}
                                        icon={<Icon iconName="Folder" />}
                                        aside={<span>{folder.count}</span>}
                                        itemType={
                                            folders.some(
                                                f => f.parentId === folder.id
                                            )
                                                ? "branch"
                                                : "leaf"
                                        }
                                        isSelected={
                                            selected === "folder:" + folder.id
                                        }
                                        onClick={() =>
                                            dispatch(
                                                selectCollection(
                                                    "folder",
                                                    String(folder.id),
                                                    folder.name
                                                )
                                            )
                                        }
                                        onContextMenu={e => {
                                            e.preventDefault()
                                            openFolders(folder.id)
                                        }}
                                        draggable
                                        onDragStart={e =>
                                            e.dataTransfer.setData(
                                                "application/x-article-folder",
                                                String(folder.id)
                                            )
                                        }
                                        onDrop={e => {
                                            e.preventDefault()
                                            const id = Number(
                                                e.dataTransfer.getData(
                                                    "application/x-article-folder"
                                                )
                                            )
                                            const from = folders.find(
                                                f => f.id === id
                                            )
                                            if (from)
                                                void window.personal
                                                    .archiveSaveFolder({
                                                        ...from,
                                                        parentId: folder.id,
                                                    })
                                                    .then(() =>
                                                        dispatch(
                                                            refreshArchive()
                                                        )
                                                    )
                                                    .catch(e =>
                                                        window.utils.showErrorBox(
                                                            "文件夹移动失败",
                                                            String(e)
                                                        )
                                                    )
                                        }}>
                                        {folders.some(
                                            f => f.parentId === folder.id
                                        ) && (
                                            <Tree>
                                                {folders
                                                    .filter(
                                                        f =>
                                                            f.parentId ===
                                                            folder.id
                                                    )
                                                    .map(child => (
                                                        <MenuTreeItem
                                                            key={
                                                                "folder:" +
                                                                child.id
                                                            }
                                                            value={
                                                                "folder:" +
                                                                child.id
                                                            }
                                                            label={child.name}
                                                            aside={
                                                                <span>
                                                                    {
                                                                        child.count
                                                                    }
                                                                </span>
                                                            }
                                                            isSelected={
                                                                selected ===
                                                                "folder:" +
                                                                    child.id
                                                            }
                                                            onClick={() =>
                                                                dispatch(
                                                                    selectCollection(
                                                                        "folder",
                                                                        String(
                                                                            child.id
                                                                        ),
                                                                        folder.name +
                                                                            " / " +
                                                                            child.name
                                                                    )
                                                                )
                                                            }
                                                            onContextMenu={e => {
                                                                e.preventDefault()
                                                                openFolders(
                                                                    child.id
                                                                )
                                                            }}
                                                            draggable
                                                            onDragStart={e =>
                                                                e.dataTransfer.setData(
                                                                    "application/x-article-folder",
                                                                    String(
                                                                        child.id
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    ))}
                                            </Tree>
                                        )}
                                    </MenuTreeItem>
                                ))}
                            {tags
                                .filter(tag => !tag.startsWith("主题/"))
                                .map(tag => (
                                    <MenuTreeItem
                                        key={"tag:" + tag}
                                        value={"tag:" + tag}
                                        label={
                                            tag.startsWith("主题/")
                                                ? intl.get(
                                                      "organize.topicLabel"
                                                  ) + tag.slice(3)
                                                : "#" + tag
                                        }
                                        isSelected={selected === "tag:" + tag}
                                        onClick={() =>
                                            dispatch(
                                                selectCollection("tag", tag)
                                            )
                                        }
                                    />
                                ))}
                            {groups.length > 0 && (
                                <StackShim
                                    horizontal
                                    horizontalAlign="space-between"
                                    verticalAlign="center"
                                    className={menuClasses.subsHeaderStack}>
                                    <span className={menuClasses.subsHeader}>
                                        {intl.get("menu.subscriptions")}
                                    </span>
                                    <ToggleButton
                                        aria-label={
                                            isUnreadSourcesOnly
                                                ? intl.get("context.unreadOnly")
                                                : intl.get("allArticles")
                                        }
                                        checked={isUnreadSourcesOnly}
                                        onClick={() => {
                                            setIsUnreadSourcesOnly(value => {
                                                globalThis.settings.setUnreadSourcesOnly(
                                                    !value
                                                )
                                                return !value
                                            })
                                        }}
                                        size="small"
                                        appearance="transparent"
                                        icon={<Filter12Filled />}>
                                        {isUnreadSourcesOnly &&
                                            intl.get("context.unreadOnly")}
                                    </ToggleButton>
                                </StackShim>
                            )}
                            {groups
                                .filter(g => {
                                    if (g.sids.length === 0) return g.isMultiple
                                    if (!isUnreadSourcesOnly) return true
                                    return g.sids.some(
                                        sid => sources[sid]?.unreadCount > 0
                                    )
                                })
                                .map(g => {
                                    if (g.isMultiple) {
                                        const groupSources = g.sids.map(
                                            sid => sources[sid]
                                        )
                                        const groupKey = "g-" + g.gid
                                        const isGroupSelected =
                                            selected === groupKey
                                        const groupUnread = groupSources
                                            .map(s => s.unreadCount)
                                            .reduce((a, b) => a + b, 0)
                                        const visibleGroupSources =
                                            isUnreadSourcesOnly
                                                ? groupSources.filter(
                                                      s => s.unreadCount > 0
                                                  )
                                                : groupSources
                                        return (
                                            <MenuTreeItem
                                                key={groupKey}
                                                value={groupKey}
                                                itemType="branch"
                                                label={
                                                    g.name +
                                                    (g.sids.length
                                                        ? ""
                                                        : intl.get(
                                                              "organize.emptyGroup"
                                                          ))
                                                }
                                                isSelected={isGroupSelected}
                                                unreadCount={groupUnread}
                                                onClick={() =>
                                                    handleSelectSourceGroup(
                                                        g,
                                                        groupKey
                                                    )
                                                }
                                                onContextMenu={e =>
                                                    handleGroupContextMenu(
                                                        g.sids,
                                                        e
                                                    )
                                                }>
                                                <Tree>
                                                    {visibleGroupSources.map(
                                                        renderSourceItem
                                                    )}
                                                </Tree>
                                            </MenuTreeItem>
                                        )
                                    } else {
                                        return renderSourceItem(
                                            sources[g.sids[0]]
                                        )
                                    }
                                })}
                        </Tree>
                    </div>
                </div>
            </div>
        )
    )
}

const useTreeItemClasses = makeStyles({
    treeItem: {
        minHeight: "32px",
    },
    treeLeafItem: {
        paddingLeft: "12px",
    },
    treeLeafSubItem: {
        paddingLeft: "24px",
    },
    selectedItem: {
        "::after": {
            content: '""',
            position: "absolute",
            left: 0,
            top: "4px",
            width: "4px",
            height: "24px",
            borderRadius: tokens.borderRadiusCircular,
            backgroundColor: tokens.colorCompoundBrandForeground1,
        },
    },
    selectedItemText: {
        color: tokens.colorNeutralForeground1,
        fontWeight: tokens.fontWeightSemibold,
    },
    label: {
        minWidth: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
    },
    unreadCount: {
        color: tokens.colorNeutralForeground3,
        marginLeft: "auto",
        paddingLeft: "4px",
        flexShrink: 0,
    },
})

interface MenuTreeItemProps {
    draggable?: boolean
    onDragStart?: React.DragEventHandler
    onDrop?: React.DragEventHandler
    value: string
    itemType?: "leaf" | "branch"
    label: string
    isSelected?: boolean
    icon?: React.ReactElement
    unreadCount?: number
    aside?: React.ReactElement
    onClick: () => void
    onContextMenu?: (e: React.MouseEvent) => void
    children?: React.ReactNode
}

const MenuTreeItem: React.FC<MenuTreeItemProps> = ({
    value,
    itemType = "leaf",
    label,
    isSelected = false,
    icon,
    unreadCount,
    aside,
    onClick,
    onContextMenu,
    children,
    draggable,
    onDragStart,
    onDrop,
}) => {
    const c = useTreeItemClasses()
    const { level } = useSubtreeContext_unstable()
    let resolvedAside: React.ReactElement | undefined = aside
    if (resolvedAside === undefined && unreadCount && unreadCount > 0) {
        resolvedAside = (
            <span className={c.unreadCount}>
                {unreadCount >= 1000 ? "999+" : String(unreadCount)}
            </span>
        )
    }
    const handleContextMenu = onContextMenu
        ? (e: React.MouseEvent) => {
              e.stopPropagation()
              onContextMenu(e)
          }
        : undefined
    return (
        <TreeItem
            value={value}
            itemType={itemType}
            onClick={e => {
                e.stopPropagation()
                onClick()
            }}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDrop ? e => e.preventDefault() : undefined}
            onDrop={onDrop}
            onContextMenu={handleContextMenu}>
            <TreeItemLayout
                aria-label={`${isSelected ? "Selected: " : ""}${label}`}
                className={mergeClasses(
                    c.treeItem,
                    itemType === "leaf" && c.treeLeafItem,
                    level > 1 && c.treeLeafSubItem,
                    isSelected && c.selectedItem
                )}
                iconBefore={icon}
                main={{ className: c.label }}
                aside={resolvedAside}>
                <span className={isSelected ? c.selectedItemText : undefined}>
                    {label}
                </span>
            </TreeItemLayout>
            {children}
        </TreeItem>
    )
}
