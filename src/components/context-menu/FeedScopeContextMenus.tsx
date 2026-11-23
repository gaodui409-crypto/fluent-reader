import * as React from "react"
import intl from "react-intl-universal"
import {
    IContextualMenuItem,
    ContextualMenuItemType,
} from "@fluentui/react/lib/ContextualMenu"
import { openSourcePreferences } from "../../scripts/models/preferences"
import { GroupMenuTarget, toggleSettings } from "../../scripts/models/app"
import { fetchItems, markAllRead, RSSItem } from "../../scripts/models/item"
import { RSSFeed } from "../../scripts/models/feed"
import { refreshArchive } from "../../scripts/models/archive"
import { openOrganize } from "../personal/organize"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { ContextMenuBase } from "./shared"

export function GroupContextMenu() {
    const dispatch = useAppDispatch()
    const rawTarget = useAppSelector(
        state => state.app.contextMenu.target
    ) as GroupMenuTarget
    const sids = Array.isArray(rawTarget) ? rawTarget : rawTarget?.sids || []
    const gid = Array.isArray(rawTarget) ? undefined : rawTarget?.gid

    const menuItems: IContextualMenuItem[] = [
        {
            key: "markAllRead",
            text: intl.get("nav.markAllRead"),
            iconProps: { iconName: "CheckMark" },
            disabled: sids.length === 0,
            onClick: () => {
                dispatch(markAllRead(sids))
            },
        },
        {
            key: "refresh",
            text: intl.get("nav.refresh"),
            iconProps: { iconName: "Sync" },
            disabled: sids.length === 0,
            onClick: () => {
                void dispatch(fetchItems(false, sids)).catch(console.error)
            },
        },
        {
            key: "manage",
            text: intl.get("context.manageSources"),
            iconProps: { iconName: "Settings" },
            onClick: () => {
                dispatch(toggleSettings(true, sids))
            },
        },
        {
            key: "sourcePreferences",
            text:
                gid !== undefined
                    ? intl.get("personal.groupSettings")
                    : intl.get("personal.sourceSettings"),
            iconProps: { iconName: "Sliders" },
            onClick: () =>
                gid !== undefined
                    ? openSourcePreferences({ gid })
                    : openSourcePreferences({ sids }),
        },
    ]
    return <ContextMenuBase menuItems={menuItems} />
}

export function MarkReadContextMenu() {
    const dispatch = useAppDispatch()
    const feed = useAppSelector(s => s.feeds[s.page.feedId])
    const title = useAppSelector(s => s.app.title)
    const [rows, setRows] = React.useState<RSSItem[]>()
    const [now] = React.useState(Date.now)

    React.useEffect(() => {
        let active = true
        if (feed) {
            void RSSFeed.loadFeed(feed, 0, -1)
                .then(loaded => {
                    if (active) setRows(loaded.filter(item => !item.hasRead))
                })
                .catch(err => {
                    console.error("Failed to count unread feed items:", err)
                    if (active) setRows([])
                })
        }
        return () => {
            active = false
        }
    }, [feed])

    const run = async (days?: number) => {
        if (!feed) return
        try {
            const boundary = days ? Date.now() - days * 86400000 : Infinity
            const current = await RSSFeed.loadFeed(feed, 0, -1)
            const result = await window.personal.archiveApply(
                current
                    .filter(item => !item.hasRead && +item.date < boundary)
                    .map(item => item._id),
                { kind: "read" }
            )
            const warning = await dispatch(refreshArchive(result))
            window.dispatchEvent(
                new CustomEvent("archive-result", {
                    detail: {
                        result,
                        message: `已将 ${result.count} 篇标为已读${warning}`,
                    },
                })
            )
        } catch (error) {
            window.dispatchEvent(
                new CustomEvent("archive-result", {
                    detail: { message: String(error) },
                })
            )
        }
    }

    const menuItems: IContextualMenuItem[] = [
        {
            key: "section_1",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                title: `${title} · ${
                    rows ? rows.length + " 篇未读" : "正在统计…"
                }`,
                items: [
                    {
                        key: "all",
                        text: intl.get("allArticles"),
                        iconProps: { iconName: "ReceiptCheck" },
                        onClick: () => {
                            void run()
                        },
                    },
                    {
                        key: "1d",
                        text: intl.get("app.daysAgo", { days: 1 }),
                        secondaryText:
                            new Date(now - 86400000).toLocaleString() + " 之前",
                        onClick: () => {
                            void run(1)
                        },
                    },
                    {
                        key: "3d",
                        text: intl.get("app.daysAgo", { days: 3 }),
                        onClick: () => {
                            void run(3)
                        },
                    },
                    {
                        key: "7d",
                        text: intl.get("app.daysAgo", { days: 7 }),
                        onClick: () => {
                            void run(7)
                        },
                    },
                    {
                        key: "organize",
                        text: "按条件筛选归档…",
                        iconProps: { iconName: "Filter" },
                        onClick: () => openOrganize(),
                    },
                ],
            },
        },
    ]
    return <ContextMenuBase menuItems={menuItems} />
}
