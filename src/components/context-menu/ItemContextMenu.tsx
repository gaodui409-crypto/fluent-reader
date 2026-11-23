import * as React from "react"
import intl from "react-intl-universal"
import {
    IContextualMenuItem,
    ContextualMenuItemType,
} from "@fluentui/react/lib/ContextualMenu"
import { useSourcePreferences } from "../../scripts/models/preferences"
import {
    saveOffline,
    openOffline,
    deleteOffline,
    notifyToast,
} from "../../scripts/models/library"
import { platformCtrl } from "../../scripts/utils"
import {
    markAllRead,
    markRead,
    markUnread,
    RSSItem,
    toggleHidden,
    toggleStarred,
    updateItemMeta,
} from "../../scripts/models/item"
import { selectArticle } from "../../scripts/models/organize"
import { refreshArchive } from "../../scripts/models/archive"
import { ViewConfigs } from "../../schema-types"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { setViewConfigs, showItem } from "../../scripts/models/page"
import { openFolders, useFolders } from "../personal/folders"
import { ContextMenuBase, shareSubmenu } from "./shared"

export function ItemContextMenu() {
    const dispatch = useAppDispatch()
    const { folders } = useFolders()
    const viewConfigs = useAppSelector(state => state.page.viewConfigs)
    const menuKey = useAppSelector(state => state.app.menuKey)
    const target = useAppSelector(state => state.app.contextMenu.target)
    const item = target?.[0] as RSSItem | undefined
    const feedId = target?.[1] as string | undefined
    const source = useAppSelector(state =>
        item ? state.sources[item.source] : undefined
    )
    const preferences = useSourcePreferences(source)
    const saved = useAppSelector(state =>
        item ? state.library.saved.includes(item._id) : false
    )
    const offlineTask = useAppSelector(state =>
        item ? state.library.offlineTasks?.[item._id] : undefined
    )
    const selected = useAppSelector(state =>
        item ? state.organize.selected.includes(item._id) : false
    )

    if (!item) return null

    const offlineBusy =
        offlineTask?.state === "waiting" || offlineTask?.state === "running"
    const offlineFailed = offlineTask?.state === "failed"
    const activeFolderId = menuKey?.startsWith("folder:")
        ? Number(menuKey.slice(7))
        : undefined

    const assignToFolder = async (folderId: number, folderName: string) => {
        try {
            const res = await window.personal.archiveApply([item._id], {
                kind: "folder",
                folderId,
            })
            await dispatch(refreshArchive(res))
            notifyToast(`已归入「${folderName}」`, "success")
        } catch (err) {
            notifyToast(`归入文件夹失败：${String(err)}`, "error")
        }
    }

    const removeFromCurrentFolder = async () => {
        if (!activeFolderId) return
        try {
            const res = await window.personal.archiveApply([item._id], {
                kind: "remove",
                folderId: activeFolderId,
            })
            await dispatch(refreshArchive(res))
            notifyToast("已移出当前文件夹", "info")
        } catch (err) {
            notifyToast(`移出失败：${String(err)}`, "error")
        }
    }

    const folderMenuItems: IContextualMenuItem[] = [
        ...folders
            .filter(f => f.parentId === null)
            .flatMap(parent => {
                const children = folders.filter(c => c.parentId === parent.id)
                return [
                    {
                        key: "f-" + parent.id,
                        text: parent.name,
                        iconProps: { iconName: "FolderHorizontal" },
                        onClick: () =>
                            void assignToFolder(parent.id, parent.name),
                    },
                    ...children.map(child => ({
                        key: "f-" + child.id,
                        text: `  └ ${child.name}`,
                        iconProps: { iconName: "FolderHorizontal" },
                        onClick: () =>
                            void assignToFolder(
                                child.id,
                                `${parent.name} / ${child.name}`
                            ),
                    })),
                ]
            }),
        ...(folders.length
            ? [
                  {
                      key: "folder_div",
                      itemType: ContextualMenuItemType.Divider,
                  },
              ]
            : []),
        {
            key: "manageFolders",
            text: "＋ 新建 / 管理文章文件夹…",
            iconProps: { iconName: "FabricNewFolder" },
            onClick: () => openFolders(),
        },
    ]

    const menuItems: IContextualMenuItem[] = [
        {
            key: "selectItem",
            text: intl.get(selected ? "organize.deselect" : "organize.select"),
            iconProps: {
                iconName: selected ? "CheckboxComposite" : "Checkbox",
            },
            onClick: () => {
                dispatch(selectArticle(item._id, false))
            },
        },
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
                    notifyToast(
                        `${intl.get("personal.failed")} ${String(error)}`,
                        "error"
                    )
                )
            },
        },
        {
            key: "folderAssign",
            text: "归入文件夹",
            iconProps: { iconName: "FolderHorizontal" },
            subMenuProps: {
                items: folderMenuItems,
            },
        },
        ...(activeFolderId
            ? [
                  {
                      key: "removeFromFolder",
                      text: "移出当前文件夹",
                      iconProps: { iconName: "FolderList" },
                      onClick: () => void removeFromCurrentFolder(),
                  },
              ]
            : []),
        {
            key: "openNotes",
            text: "备注与归类",
            iconProps: { iconName: "EditNote" },
            onClick: () => {
                dispatch(showItem(feedId, item))
                dispatch(markRead(item))
                setTimeout(() => {
                    window.dispatchEvent(
                        new CustomEvent("open-article-notes", {
                            detail: { id: item._id },
                        })
                    )
                }, 80)
            },
        },
        ...(preferences.offlineEnabled
            ? [
                  {
                      key: "saveOffline",
                      disabled: offlineBusy,
                      text: offlineBusy
                          ? "正在保存离线网页…"
                          : offlineFailed
                          ? "离线保存失败，点击重试"
                          : saved
                          ? "重新保存离线网页"
                          : intl.get("personal.offlineSave"),
                      iconProps: {
                          iconName: offlineBusy
                              ? "Sync"
                              : offlineFailed
                              ? "Warning"
                              : "Save",
                      },
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
                  {
                      key: "deleteOffline",
                      text: "删除离线网页",
                      iconProps: { iconName: "Delete" },
                      onClick: () => {
                          void dispatch(deleteOffline(item._id))
                      },
                  },
              ]
            : []),
        {
            key: "showItem",
            text: intl.get("context.read"),
            iconProps: { iconName: "TextDocument" },
            onClick: () => {
                dispatch(showItem(feedId, item))
                dispatch(markRead(item))
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
            iconProps: { iconName: "Copy" },
            onClick: () => {
                globalThis.utils.writeClipboard(item.title)
            },
        },
        {
            key: "copyURL",
            text: intl.get("context.copyURL"),
            iconProps: { iconName: "Link" },
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
