import * as React from "react"
import {
    openSourcePreferences,
    useSourcePreferences,
} from "../scripts/models/preferences"
import { saveOffline, openOffline } from "../scripts/models/library"
import { editTags } from "./personal/tags"
import intl from "react-intl-universal"
import { QRCodeSVG } from "qrcode.react"
import {
    cutText,
    webSearch,
    getSearchEngineName,
    platformCtrl,
} from "../scripts/utils"
import {
    ContextualMenu,
    IContextualMenuItem,
    ContextualMenuItemType,
    DirectionalHint,
} from "@fluentui/react/lib/ContextualMenu"
import {
    closeContextMenu,
    ContextMenuType,
    toggleSettings,
} from "../scripts/models/app"
import {
    fetchItems,
    markAllRead,
    markRead,
    markUnread,
    RSSItem,
    toggleHidden,
    toggleStarred,
    updateItemMeta,
} from "../scripts/models/item"
import { ViewType, ImageCallbackTypes, ViewConfigs } from "../schema-types"
import { FilterType, RSSFeed } from "../scripts/models/feed"
import { refreshArchive } from "../scripts/models/archive"
import { openOrganize } from "./personal/organize"
import { useAppDispatch, useAppSelector } from "../scripts/reducer"
import {
    setViewConfigs,
    showItem,
    switchFilter,
    switchView,
    toggleFilter,
} from "../scripts/models/page"

export const shareSubmenu = (item: RSSItem): IContextualMenuItem[] => [
    { key: "qr", url: item.link, onRender: renderShareQR },
]

export const renderShareQR = (item: IContextualMenuItem) => (
    <div className="qr-container">
        <QRCodeSVG value={item.url} size={150} />
    </div>
)

function getSearchItem(text: string): IContextualMenuItem {
    const engine = globalThis.settings.getSearchEngine()
    return {
        key: "searchText",
        text: intl.get("context.search", {
            text: cutText(text, 15),
            engine: getSearchEngineName(engine),
        }),
        iconProps: { iconName: "Search" },
        onClick: () => webSearch(text, engine),
    }
}

export function ContextMenu() {
    const { type } = useAppSelector(state => state.app.contextMenu)

    switch (type) {
        case ContextMenuType.Hidden:
            return null
        case ContextMenuType.Item:
            return <ItemContextMenu />
        case ContextMenuType.Text:
            return <TextContextMenu />
        case ContextMenuType.Image:
            return <ImageContextMenu />
        case ContextMenuType.View:
            return <ViewContextMenu />
        case ContextMenuType.Group:
            return <GroupContextMenu />
        case ContextMenuType.MarkRead:
            return <MarkReadContextMenu />
    }
}

function ItemContextMenu() {
    const dispatch = useAppDispatch()
    const viewConfigs = useAppSelector(state => state.page.viewConfigs)
    const target = useAppSelector(state => state.app.contextMenu.target)
    const item = target[0] as RSSItem
    const feedId = target[1] as string
    const source = useAppSelector(state => state.sources[item.source])
    const preferences = useSourcePreferences(source)
    const saved = useAppSelector(state =>
        state.library.saved.includes(item._id)
    )

    const menuItems: IContextualMenuItem[] = [
        {
            key: "later",
            text: intl.get(
                item.readLater ? "personal.removeLater" : "personal.laterAction"
            ),
            iconProps: { iconName: "Clock" },
            onClick: () => {
                void dispatch(
                    updateItemMeta(item, { readLater: !item.readLater })
                ).catch(error =>
                    window.utils.showErrorBox(
                        intl.get("personal.failed"),
                        String(error)
                    )
                )
            },
        },
        ...(preferences.offlineEnabled
            ? [
                  {
                      key: "saveOffline",
                      text: intl.get("personal.offlineSave"),
                      iconProps: { iconName: "Save" },
                      onClick: () => {
                          void dispatch(saveOffline(item._id))
                      },
                  },
              ]
            : []),
        ...(saved
            ? [
                  {
                      key: "openOffline",
                      text: intl.get("personal.openOffline"),
                      iconProps: { iconName: "OfflineStorage" },
                      onClick: () => openOffline(item._id),
                  },
                  {
                      key: "showFile",
                      text: intl.get("personal.showFile"),
                      iconProps: { iconName: "FolderOpen" },
                      onClick: () => openOffline(item._id, true),
                  },
              ]
            : []),
        {
            key: "showItem",
            text: intl.get("context.read"),
            iconProps: { iconName: "TextDocument" },
            onClick: () => {
                dispatch(markRead(item))
                dispatch(showItem(feedId, item))
            },
        },
        {
            key: "openInBrowser",
            text: intl.get("openExternal"),
            iconProps: { iconName: "NavigateExternalInline" },
            onClick: e => {
                dispatch(markRead(item))
                void window.personal.opened?.(item._id).catch(console.error)
                globalThis.utils.openExternal(item.link, platformCtrl(e))
            },
        },
        {
            key: "markAsRead",
            text: item.hasRead
                ? intl.get("article.markUnread")
                : intl.get("article.markRead"),
            iconProps: item.hasRead
                ? {
                      iconName: "RadioBtnOn",
                      style: { fontSize: 14, textAlign: "center" },
                  }
                : { iconName: "StatusCircleRing" },
            onClick: () => {
                if (item.hasRead) {
                    dispatch(markUnread(item))
                } else {
                    dispatch(markRead(item))
                }
            },
            split: true,
            subMenuProps: {
                items: [
                    {
                        key: "markBelow",
                        text: intl.get("article.markBelow"),
                        iconProps: {
                            iconName: "Down",
                            style: { fontSize: 14 },
                        },
                        onClick: () => {
                            dispatch(markAllRead(null, item.date))
                        },
                    },
                    {
                        key: "markAbove",
                        text: intl.get("article.markAbove"),
                        iconProps: {
                            iconName: "Up",
                            style: { fontSize: 14 },
                        },
                        onClick: () => {
                            dispatch(markAllRead(null, item.date, false))
                        },
                    },
                ],
            },
        },
        {
            key: "toggleStarred",
            text: item.starred
                ? intl.get("article.unstar")
                : intl.get("article.star"),
            iconProps: {
                iconName: item.starred ? "FavoriteStar" : "FavoriteStarFill",
            },
            onClick: () => {
                dispatch(toggleStarred(item))
            },
        },
        {
            key: "toggleHidden",
            text: item.hidden
                ? intl.get("article.unhide")
                : intl.get("article.hide"),
            iconProps: {
                iconName: item.hidden ? "View" : "Hide3",
            },
            onClick: () => {
                dispatch(toggleHidden(item))
            },
        },
        {
            key: "tags",
            text: intl.get("personal.editTags"),
            iconProps: { iconName: "Tag" },
            onClick: () => {
                editTags(item._id)
            },
        },
        {
            key: "divider_1",
            itemType: ContextualMenuItemType.Divider,
        },
        {
            key: "share",
            text: intl.get("context.share"),
            iconProps: { iconName: "Share" },
            subMenuProps: {
                items: shareSubmenu(item),
            },
        },
        {
            key: "copyTitle",
            text: intl.get("context.copyTitle"),
            onClick: () => {
                globalThis.utils.writeClipboard(item.title)
            },
        },
        {
            key: "copyURL",
            text: intl.get("context.copyURL"),
            onClick: () => {
                globalThis.utils.writeClipboard(item.link)
            },
        },
        ...(viewConfigs === undefined
            ? []
            : [
                  {
                      key: "divider_2",
                      itemType: ContextualMenuItemType.Divider,
                  },
                  {
                      key: "view",
                      text: intl.get("context.view"),
                      subMenuProps: {
                          items: [
                              {
                                  key: "showCover",
                                  text: intl.get("context.showCover"),
                                  canCheck: true,
                                  checked: Boolean(
                                      viewConfigs & ViewConfigs.ShowCover
                                  ),
                                  onClick: () =>
                                      dispatch(
                                          setViewConfigs(
                                              viewConfigs ^
                                                  ViewConfigs.ShowCover
                                          )
                                      ),
                              },
                              {
                                  key: "showSnippet",
                                  text: intl.get("context.showSnippet"),
                                  canCheck: true,
                                  checked: Boolean(
                                      viewConfigs & ViewConfigs.ShowSnippet
                                  ),
                                  onClick: () =>
                                      dispatch(
                                          setViewConfigs(
                                              viewConfigs ^
                                                  ViewConfigs.ShowSnippet
                                          )
                                      ),
                              },
                              {
                                  key: "fadeRead",
                                  text: intl.get("context.fadeRead"),
                                  canCheck: true,
                                  checked: Boolean(
                                      viewConfigs & ViewConfigs.FadeRead
                                  ),
                                  onClick: () =>
                                      dispatch(
                                          setViewConfigs(
                                              viewConfigs ^ ViewConfigs.FadeRead
                                          )
                                      ),
                              },
                          ],
                      },
                  },
              ]),
    ]
    return <ContextMenuBase menuItems={menuItems} />
}

function TextContextMenu() {
    const target = useAppSelector(state => state.app.contextMenu.target) as [
        string,
        string
    ]
    const text = target[0]
    const url = target[1]
    const menuItems: IContextualMenuItem[] = text
        ? [
              {
                  key: "copyText",
                  text: intl.get("context.copy"),
                  iconProps: { iconName: "Copy" },
                  onClick: () => {
                      globalThis.utils.writeClipboard(text)
                  },
              },
              getSearchItem(text),
          ]
        : []
    if (url) {
        menuItems.push({
            key: "urlSection",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                topDivider: menuItems.length > 0,
                items: [
                    {
                        key: "openInBrowser",
                        text: intl.get("openExternal"),
                        iconProps: {
                            iconName: "NavigateExternalInline",
                        },
                        onClick: e => {
                            globalThis.utils.openExternal(url, platformCtrl(e))
                        },
                    },
                    {
                        key: "copyURL",
                        text: intl.get("context.copyURL"),
                        iconProps: { iconName: "Link" },
                        onClick: () => {
                            globalThis.utils.writeClipboard(url)
                        },
                    },
                ],
            },
        })
    }
    return <ContextMenuBase menuItems={menuItems} />
}

function ImageContextMenu() {
    const menuItems: IContextualMenuItem[] = [
        {
            key: "openInBrowser",
            text: intl.get("openExternal"),
            iconProps: { iconName: "NavigateExternalInline" },
            onClick: e => {
                if (platformCtrl(e)) {
                    globalThis.utils.imageCallback(
                        ImageCallbackTypes.OpenExternalBg
                    )
                } else {
                    globalThis.utils.imageCallback(
                        ImageCallbackTypes.OpenExternal
                    )
                }
            },
        },
        {
            key: "saveImageAs",
            text: intl.get("context.saveImageAs"),
            iconProps: { iconName: "SaveTemplate" },
            onClick: () => {
                globalThis.utils.imageCallback(ImageCallbackTypes.SaveAs)
            },
        },
        {
            key: "copyImage",
            text: intl.get("context.copyImage"),
            iconProps: { iconName: "FileImage" },
            onClick: () => {
                globalThis.utils.imageCallback(ImageCallbackTypes.Copy)
            },
        },
        {
            key: "copyImageURL",
            text: intl.get("context.copyImageURL"),
            iconProps: { iconName: "Link" },
            onClick: () => {
                globalThis.utils.imageCallback(ImageCallbackTypes.CopyLink)
            },
        },
    ]
    return <ContextMenuBase menuItems={menuItems} />
}

function ViewContextMenu() {
    const dispatch = useAppDispatch()
    const viewType = useAppSelector(state => state.page.viewType)
    const filter = useAppSelector(state => state.page.filter.type)

    const menuItems: IContextualMenuItem[] = [
        {
            key: "section_1",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                title: intl.get("context.view"),
                bottomDivider: true,
                items: [
                    {
                        key: "cardView",
                        text: intl.get("context.cardView"),
                        iconProps: { iconName: "GridViewMedium" },
                        canCheck: true,
                        checked: viewType === ViewType.Cards,
                        onClick: () => dispatch(switchView(ViewType.Cards)),
                    },
                    {
                        key: "listView",
                        text: intl.get("context.listView"),
                        iconProps: { iconName: "BacklogList" },
                        canCheck: true,
                        checked: viewType === ViewType.List,
                        onClick: () => dispatch(switchView(ViewType.List)),
                    },
                    {
                        key: "magazineView",
                        text: intl.get("context.magazineView"),
                        iconProps: { iconName: "Articles" },
                        canCheck: true,
                        checked: viewType === ViewType.Magazine,
                        onClick: () => dispatch(switchView(ViewType.Magazine)),
                    },
                    {
                        key: "compactView",
                        text: intl.get("context.compactView"),
                        iconProps: { iconName: "BulletedList" },
                        canCheck: true,
                        checked: viewType === ViewType.Compact,
                        onClick: () => dispatch(switchView(ViewType.Compact)),
                    },
                ],
            },
        },
        {
            key: "section_2",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                title: intl.get("context.filter"),
                bottomDivider: true,
                items: [
                    {
                        key: "allArticles",
                        text: intl.get("allArticles"),
                        iconProps: { iconName: "ClearFilter" },
                        canCheck: true,
                        checked:
                            (filter & ~FilterType.Toggles) ==
                            FilterType.Default,
                        onClick: () =>
                            dispatch(switchFilter(FilterType.Default)),
                    },
                    {
                        key: "unreadOnly",
                        text: intl.get("context.unreadOnly"),
                        iconProps: {
                            iconName: "RadioBtnOn",
                            style: {
                                fontSize: 14,
                                textAlign: "center",
                            },
                        },
                        canCheck: true,
                        checked:
                            (filter & ~FilterType.Toggles) ==
                            FilterType.UnreadOnly,
                        onClick: () =>
                            dispatch(switchFilter(FilterType.UnreadOnly)),
                    },
                    {
                        key: "starredOnly",
                        text: intl.get("context.starredOnly"),
                        iconProps: { iconName: "FavoriteStarFill" },
                        canCheck: true,
                        checked:
                            (filter & ~FilterType.Toggles) ==
                            FilterType.StarredOnly,
                        onClick: () =>
                            dispatch(switchFilter(FilterType.StarredOnly)),
                    },
                ],
            },
        },
        {
            key: "section_3",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                title: intl.get("search"),
                bottomDivider: true,
                items: [
                    {
                        key: "caseSensitive",
                        text: intl.get("context.caseSensitive"),
                        iconProps: {
                            style: {
                                fontSize: 12,
                                fontStyle: "normal",
                            },
                            children: "Aa",
                        },
                        canCheck: true,
                        checked: !(filter & FilterType.CaseInsensitive),
                        onClick: () =>
                            dispatch(toggleFilter(FilterType.CaseInsensitive)),
                    },
                    {
                        key: "fullSearch",
                        text: intl.get("context.fullSearch"),
                        iconProps: { iconName: "Breadcrumb" },
                        canCheck: true,
                        checked: Boolean(filter & FilterType.FullSearch),
                        onClick: () =>
                            dispatch(toggleFilter(FilterType.FullSearch)),
                    },
                ],
            },
        },
        {
            key: "showHidden",
            text: intl.get("context.showHidden"),
            canCheck: true,
            checked: Boolean(filter & FilterType.ShowHidden),
            onClick: () => dispatch(toggleFilter(FilterType.ShowHidden)),
        },
    ]
    return <ContextMenuBase menuItems={menuItems} />
}

function GroupContextMenu() {
    const dispatch = useAppDispatch()
    const sids = useAppSelector(
        state => state.app.contextMenu.target
    ) as number[]

    const menuItems: IContextualMenuItem[] = [
        {
            key: "markAllRead",
            text: intl.get("nav.markAllRead"),
            iconProps: { iconName: "CheckMark" },
            onClick: () => {
                dispatch(markAllRead(sids))
            },
        },
        {
            key: "refresh",
            text: intl.get("nav.refresh"),
            iconProps: { iconName: "Sync" },
            onClick: () => {
                dispatch(fetchItems(false, sids))
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
            text: intl.get("personal.sourceSettings"),
            iconProps: { iconName: "Settings" },
            onClick: () => openSourcePreferences({ sids }),
        },
    ]
    return <ContextMenuBase menuItems={menuItems} />
}

function MarkReadContextMenu() {
    const dispatch = useAppDispatch()
    const feed = useAppSelector(s => s.feeds[s.page.feedId])
    const title = useAppSelector(s => s.app.title)
    const [rows, setRows] = React.useState<RSSItem[]>()
    const [now] = React.useState(Date.now)
    React.useEffect(() => {
        let active = true
        if (feed)
            void RSSFeed.loadFeed(feed, 0, -1).then(rows => {
                if (active) setRows(rows.filter(item => !item.hasRead))
            })
        return () => {
            active = false
        }
    }, [feed])
    const run = async (days?: number) => {
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
                        message: `已标读 ${result.count} 篇${warning}`,
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
                        text: "精细筛选归档…",
                        onClick: () => openOrganize(),
                    },
                ],
            },
        },
    ]
    return <ContextMenuBase menuItems={menuItems} />
}

function ContextMenuBase({
    menuItems,
}: Readonly<{ menuItems: IContextualMenuItem[] }>) {
    const { event, position } = useAppSelector(state => state.app.contextMenu)
    const dispatch = useAppDispatch()

    return (
        <ContextualMenu
            directionalHint={DirectionalHint.bottomLeftEdge}
            items={menuItems}
            target={
                event ||
                (position && {
                    left: position[0],
                    top: position[1],
                })
            }
            onDismiss={() => dispatch(closeContextMenu())}
        />
    )
}
