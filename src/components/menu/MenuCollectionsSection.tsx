import * as React from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react"
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
})

export const MenuCollectionsSection: React.FC<{
    selected: string
    searchOn: boolean
    totalUnread: number
    counts: { later: number; starred: number }
    onToggleSearch: () => void
    onAllArticles: (init?: boolean) => void
}> = ({
    selected,
    searchOn,
    totalUnread,
    counts,
    onToggleSearch,
    onAllArticles,
}) => {
    const c = useClasses()
    const dispatch = useAppDispatch()
    const aiConfigured = useAppSelector(s => s.library.aiConfigured)

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
                onClick={() => onAllArticles(selected !== ALL)}
            />
            <MenuTreeItem
                value="later:"
                icon={<Icon iconName="Clock" className={c.subtleIcon} />}
                aside={
                    <span
                        className={c.countText}
                        title={intl.get("organize.totalCount")}>
                        {counts.later}
                    </span>
                }
                label={intl.get("personal.readLater")}
                isSelected={selected === "later:"}
                onClick={() => dispatch(selectCollection("later"))}
            />
            {selected === "later:" && (
                <MenuTreeItem
                    value="clear-read-later"
                    icon={<Icon iconName="Broom" className={c.subtleIcon} />}
                    label={intl.get("personal.clearReadLater")}
                    onClick={() =>
                        void dispatch(clearReadLater()).catch(error =>
                            window.utils.showErrorBox(
                                intl.get("personal.failed"),
                                String(error)
                            )
                        )
                    }
                />
            )}
            <MenuTreeItem
                value="starred:"
                icon={<Icon iconName="FavoriteStar" className={c.subtleIcon} />}
                aside={
                    <span
                        className={c.countText}
                        title={intl.get("organize.totalCount")}>
                        {counts.starred}
                    </span>
                }
                label={intl.get("personal.favorites")}
                isSelected={selected === "starred:"}
                onClick={() => dispatch(selectCollection("starred"))}
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
