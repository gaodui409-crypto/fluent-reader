import * as React from "react"
import { useState } from "react"
import intl from "react-intl-universal"
import {
    makeStyles,
    ToggleButton,
    tokens,
    Tree,
} from "@fluentui/react-components"
import { Filter12Filled } from "@fluentui/react-icons"
import { StackShim } from "@fluentui/react-migration-v8-v9"
import { SourceGroup } from "../../schema-types"
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
    onSelectGroup: (group: SourceGroup, menuKey: string) => void
    onSelectSource: (source: RSSSource) => void
    onContextMenu: (sids: number[], event: React.MouseEvent) => void
}> = ({
    selected,
    groups,
    sources,
    onSelectGroup,
    onSelectSource,
    onContextMenu,
}) => {
    const c = useClasses()
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
                <ToggleButton
                    aria-label={
                        isUnreadSourcesOnly
                            ? intl.get("context.unreadOnly")
                            : intl.get("allArticles")
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
                    {isUnreadSourcesOnly && intl.get("context.unreadOnly")}
                </ToggleButton>
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
                                onClick={() => onSelectGroup(g, groupKey)}
                                onContextMenu={e => onContextMenu(g.sids, e)}>
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
