import * as React from "react"
import { useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react"
import {
    makeStyles,
    ToggleButton,
    tokens,
    Tree,
} from "@fluentui/react-components"
import { Filter12Filled } from "@fluentui/react-icons"
import { StackShim } from "@fluentui/react-migration-v8-v9"
import { SourceGroup } from "../../schema-types"
import { toggleSettings } from "../../scripts/models/app"
import { useAppDispatch } from "../../scripts/reducer"
import { RSSSource, SourceState } from "../../scripts/models/source"
import { MenuTreeItem, SafeFavicon } from "./MenuTreeItem"

const useClasses = makeStyles({
    subsHeaderStack: {
        marginTop: "16px",
        marginBottom: "4px",
        marginLeft: "12px",
        marginRight: "8px",
    },
    subsHeader: {
        fontSize: "12px",
        color: tokens.colorNeutralForeground3,
        userSelect: "none",
    },
    headerActions: {
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
    },
    addBtn: {
        "border": "none",
        "background": "transparent",
        "padding": "4px 6px",
        "borderRadius": "4px",
        "cursor": "pointer",
        "color": tokens.colorNeutralForeground3,
        "lineHeight": 1,
        ":hover": {
            backgroundColor: tokens.colorSubtleBackgroundHover,
            color: tokens.colorNeutralForeground1,
        },
    },
    favicon: {
        width: "16px",
        height: "16px",
        verticalAlign: "middle",
        userSelect: "none",
        borderRadius: "3px",
    },
})

export const MenuSubscriptionsSection: React.FC<{
    selected: string
    groups: SourceGroup[]
    sources: SourceState
    unseenBySource: Record<number, number>
    onSelectGroup: (group: SourceGroup, menuKey: string) => void
    onSelectSource: (source: RSSSource) => void
    onContextMenu: (
        sids: number[],
        event: React.MouseEvent,
        gid?: number
    ) => void
}> = ({
    selected,
    groups,
    sources,
    unseenBySource,
    onSelectGroup,
    onSelectSource,
    onContextMenu,
}) => {
    const c = useClasses()
    const dispatch = useAppDispatch()
    const [isUnreadSourcesOnly, setIsUnreadSourcesOnly] = useState(() =>
        globalThis.settings.getUnreadSourcesOnly()
    )

    const renderSourceItem = (s: RSSSource | undefined) => {
        if (!s) return null
        const key = "s-" + s.sid
        return (
            <MenuTreeItem
                key={key}
                value={key}
                label={s.name}
                isSelected={selected === key}
                icon={
                    s.iconurl ? (
                        <SafeFavicon src={s.iconurl} className={c.favicon} />
                    ) : undefined
                }
                unreadCount={s.unreadCount}
                deltaCount={Math.min(
                    unseenBySource[s.sid] || 0,
                    s.unreadCount || 0
                )}
                onClick={() => onSelectSource(s)}
                onContextMenu={e => onContextMenu([s.sid], e)}
            />
        )
    }

    if (groups.length === 0) return null

    return (
        <>
            <StackShim
                horizontal
                horizontalAlign="space-between"
                verticalAlign="center"
                className={c.subsHeaderStack}>
                <span className={c.subsHeader}>
                    {intl.get("menu.subscriptions")}
                </span>
                <span className={c.headerActions}>
                    <ToggleButton
                        aria-label={
                            isUnreadSourcesOnly
                                ? intl.get("context.unreadOnly")
                                : intl.get("allArticles")
                        }
                        title={
                            isUnreadSourcesOnly
                                ? "当前仅显示有未读的源（点击显示全部）"
                                : "仅显示有未读文章的订阅源"
                        }
                        checked={isUnreadSourcesOnly}
                        onClick={() => {
                            setIsUnreadSourcesOnly(value => {
                                globalThis.settings.setUnreadSourcesOnly(!value)
                                return !value
                            })
                        }}
                        size="small"
                        appearance="transparent"
                        icon={<Filter12Filled />}>
                        {isUnreadSourcesOnly && intl.get("organize.unreadOnly")}
                    </ToggleButton>
                    <button
                        type="button"
                        className={c.addBtn}
                        title="添加或管理订阅源"
                        aria-label="添加或管理订阅源"
                        onClick={() => dispatch(toggleSettings(true))}>
                        <Icon iconName="Add" style={{ fontSize: 12 }} />
                    </button>
                </span>
            </StackShim>
            {groups
                .filter(g => {
                    if (g.sids.length === 0) return g.isMultiple
                    if (!isUnreadSourcesOnly) return true
                    return g.sids.some(
                        sid => (sources[sid]?.unreadCount || 0) > 0
                    )
                })
                .map(g => {
                    if (g.isMultiple) {
                        const groupSources = g.sids
                            .map(sid => sources[sid])
                            .filter((s): s is RSSSource => Boolean(s))
                        const groupKey = "g-" + g.gid
                        const isGroupSelected = selected === groupKey
                        const groupUnread = groupSources.reduce(
                            (acc, s) => acc + (s.unreadCount || 0),
                            0
                        )
                        const groupDelta = groupSources.reduce(
                            (acc, s) =>
                                acc +
                                Math.min(
                                    unseenBySource[s.sid] || 0,
                                    s.unreadCount || 0
                                ),
                            0
                        )
                        const visibleGroupSources = isUnreadSourcesOnly
                            ? groupSources.filter(s => s.unreadCount > 0)
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
                                        : intl.get("organize.emptyGroup"))
                                }
                                isSelected={isGroupSelected}
                                unreadCount={groupUnread}
                                deltaCount={groupDelta}
                                onClick={() => onSelectGroup(g, groupKey)}
                                onContextMenu={e =>
                                    onContextMenu(g.sids, e, g.gid)
                                }>
                                <Tree>
                                    {visibleGroupSources.map(renderSourceItem)}
                                </Tree>
                            </MenuTreeItem>
                        )
                    } else {
                        return renderSourceItem(sources[g.sids[0]])
                    }
                })}
        </>
    )
}
