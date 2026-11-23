import * as React from "react"
import { useState } from "react"
import intl from "react-intl-universal"
import { ContextualMenu, Icon } from "@fluentui/react"
import { makeStyles, tokens } from "@fluentui/react-components"
import {
    Checkmark16Regular,
    DocumentOnePageMultiple16Regular,
    Search16Regular,
} from "@fluentui/react-icons"
import { ALL } from "../../scripts/models/feed"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { selectCollection } from "../../scripts/models/page"
import { clearReadLater } from "../../scripts/models/library"
import { openBriefings } from "../personal/ai"
import { MenuTreeItem } from "./MenuTreeItem"

const useClasses = makeStyles({
    primaryIcon: {
        color: tokens.colorCompoundBrandForeground1,
    },
    subtleIcon: {
        color: tokens.colorNeutralForeground3,
        fontSize: "14px",
    },
    countText: {
        color: tokens.colorNeutralForeground3,
        fontSize: "12px",
        fontVariantNumeric: "tabular-nums",
    },
    asideWrap: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
    },
    inlineAction: {
        "border": "none",
        "background": "transparent",
        "padding": "2px 4px",
        "borderRadius": "4px",
        "cursor": "pointer",
        "color": tokens.colorNeutralForeground3,
        "lineHeight": 1,
        ":hover": {
            backgroundColor: tokens.colorSubtleBackgroundHover,
            color: tokens.colorNeutralForeground1,
        },
    },
})

export const MenuCollectionsSection: React.FC<{
    selected: string
    searchOn: boolean
    totalUnread: number
    unseenAll: number
    counts: { later: number; starred: number; saved: number }
    onToggleSearch: () => void
    onAllArticles: (init?: boolean) => void
}> = ({
    selected,
    searchOn,
    totalUnread,
    unseenAll,
    counts,
    onToggleSearch,
    onAllArticles,
}) => {
    const c = useClasses()
    const dispatch = useAppDispatch()
    const aiConfigured = useAppSelector(s => s.library.aiConfigured)
    const [laterMenuPos, setLaterMenuPos] = useState<{
        x: number
        y: number
    } | null>(null)

    const runClearLater = () => {
        void dispatch(clearReadLater()).catch(error =>
            window.utils.showErrorBox(
                intl.get("personal.failed"),
                String(error)
            )
        )
    }

    return (
        <>
            <MenuTreeItem
                value="search"
                label={intl.get("search")}
                icon={<Search16Regular className={c.primaryIcon} />}
                aside={
                    searchOn ? (
                        <Checkmark16Regular className={c.primaryIcon} />
                    ) : undefined
                }
                onClick={onToggleSearch}
            />
            <MenuTreeItem
                value={ALL}
                label={intl.get("allArticles")}
                isSelected={selected === ALL}
                icon={
                    <DocumentOnePageMultiple16Regular
                        className={c.primaryIcon}
                    />
                }
                unreadCount={totalUnread}
                deltaCount={unseenAll}
                onClick={() => onAllArticles(selected !== ALL)}
            />
            <MenuTreeItem
                value="later:"
                icon={<Icon iconName="Clock" className={c.subtleIcon} />}
                aside={
                    counts.later > 0 || selected === "later:" ? (
                        <span className={c.asideWrap}>
                            {selected === "later:" && counts.later > 0 && (
                                <button
                                    type="button"
                                    className={c.inlineAction}
                                    title={intl.get("personal.clearReadLater")}
                                    aria-label={intl.get(
                                        "personal.clearReadLater"
                                    )}
                                    onClick={e => {
                                        e.stopPropagation()
                                        runClearLater()
                                    }}>
                                    <Icon
                                        iconName="Broom"
                                        style={{ fontSize: 12 }}
                                    />
                                </button>
                            )}
                            {counts.later > 0 && (
                                <span
                                    className={c.countText}
                                    title={intl.get("organize.totalCount")}>
                                    {counts.later}
                                </span>
                            )}
                        </span>
                    ) : undefined
                }
                label={intl.get("personal.readLater")}
                isSelected={selected === "later:"}
                onClick={() => dispatch(selectCollection("later"))}
                onContextMenu={e => {
                    e.preventDefault()
                    setLaterMenuPos({ x: e.clientX, y: e.clientY })
                }}
            />
            {laterMenuPos && (
                <ContextualMenu
                    target={laterMenuPos}
                    onDismiss={() => setLaterMenuPos(null)}
                    items={[
                        {
                            key: "clearLater",
                            text: intl.get("personal.clearReadLater"),
                            iconProps: { iconName: "Broom" },
                            disabled: counts.later === 0,
                            onClick: runClearLater,
                        },
                    ]}
                />
            )}
            <MenuTreeItem
                value="starred:"
                icon={<Icon iconName="FavoriteStar" className={c.subtleIcon} />}
                aside={
                    counts.starred > 0 ? (
                        <span
                            className={c.countText}
                            title={intl.get("organize.totalCount")}>
                            {counts.starred}
                        </span>
                    ) : undefined
                }
                label={intl.get("personal.favorites")}
                isSelected={selected === "starred:"}
                onClick={() => dispatch(selectCollection("starred"))}
            />
            <MenuTreeItem
                value="saved:"
                icon={
                    <Icon iconName="OfflineStorage" className={c.subtleIcon} />
                }
                aside={
                    counts.saved > 0 ? (
                        <span className={c.countText}>{counts.saved}</span>
                    ) : undefined
                }
                label="离线网页"
                isSelected={selected === "saved:"}
                onClick={() => dispatch(selectCollection("saved"))}
            />
            {aiConfigured && (
                <MenuTreeItem
                    value="briefings"
                    icon={
                        <Icon iconName="ReadingMode" className={c.subtleIcon} />
                    }
                    label={intl.get("ai.briefings")}
                    onClick={openBriefings}
                />
            )}
        </>
    )
}
