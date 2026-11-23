import * as React from "react"
import { useState } from "react"
import { ContextualMenu, Icon } from "@fluentui/react"
import { makeStyles, tokens, Tree } from "@fluentui/react-components"
import type { ArticleFolder } from "../../archive-types"
import { useAppDispatch } from "../../scripts/reducer"
import { selectCollection } from "../../scripts/models/page"
import { refreshArchive } from "../../scripts/models/archive"
import { openFolders } from "../personal/folders"
import { MenuTreeItem } from "./MenuTreeItem"

const useClasses = makeStyles({
    headerRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: "14px",
        marginBottom: "4px",
        marginLeft: "12px",
        marginRight: "8px",
        userSelect: "none",
    },
    sectionHeader: {
        fontSize: "12px",
        color: tokens.colorNeutralForeground3,
    },
    headerBtn: {
        "border": "none",
        "background": "transparent",
        "padding": "2px 6px",
        "borderRadius": "4px",
        "cursor": "pointer",
        "fontSize": "12px",
        "color": tokens.colorNeutralForeground3,
        "display": "inline-flex",
        "alignItems": "center",
        "gap": "4px",
        ":hover": {
            backgroundColor: tokens.colorSubtleBackgroundHover,
            color: tokens.colorNeutralForeground1,
        },
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

export const MenuFoldersAndTagsSection: React.FC<{
    selected: string
    folders: ArticleFolder[]
    unfiledCount?: number
}> = ({ selected, folders, unfiledCount = 0 }) => {
    const c = useClasses()
    const dispatch = useAppDispatch()
    const [ctxMenu, setCtxMenu] = useState<{
        folder: ArticleFolder
        x: number
        y: number
    } | null>(null)

    const moveFolder = (draggedId: number, parentId: number | null) => {
        const from = folders.find(f => f.id === draggedId)
        if (!from || from.id === parentId || from.parentId === parentId) return
        void window.personal
            .archiveSaveFolder({
                ...from,
                parentId,
            })
            .then(() => dispatch(refreshArchive()))
            .catch(e => window.utils.showErrorBox("无法移动文件夹", String(e)))
    }

    const markFolderAllRead = async (folderId: number) => {
        try {
            const rows = (await window.db.execute(
                "SELECT DISTINCT fa.itemId FROM folder_articles fa JOIN article_folders f ON f.id=fa.folderId JOIN items i ON i._id=fa.itemId WHERE f.deleted=0 AND (f.id=? OR f.parentId=?) AND i.hasRead=0",
                [folderId, folderId],
                "all"
            )) as [number][]
            const ids = rows.map(r => Number(r[0])).filter(Boolean)
            if (!ids.length) return
            const result = await window.personal.archiveApply(ids, {
                kind: "read",
            })
            await dispatch(refreshArchive(result))
        } catch (e) {
            window.utils.showErrorBox("操作失败", String(e))
        }
    }

    return (
        <>
            <div
                className={c.headerRow}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                    e.preventDefault()
                    const id = Number(
                        e.dataTransfer.getData("application/x-article-folder")
                    )
                    if (id) moveFolder(id, null)
                }}>
                <span
                    className={c.sectionHeader}
                    title="将子文件夹拖到此处可移回顶层">
                    文章归档
                </span>
                <button
                    type="button"
                    className={c.headerBtn}
                    title="＋管理文章文件夹"
                    aria-label="＋管理文章文件夹"
                    onClick={() => openFolders()}>
                    <Icon iconName="FabricNewFolder" style={{ fontSize: 12 }} />
                    <span>管理</span>
                </button>
            </div>
            <MenuTreeItem
                value="library:"
                icon={<Icon iconName="Library" className={c.subtleIcon} />}
                label="未分类文章"
                aside={
                    unfiledCount > 0 ? (
                        <span className={c.countText}>{unfiledCount}</span>
                    ) : undefined
                }
                isSelected={selected === "library:"}
                onClick={() =>
                    dispatch(selectCollection("library", "", "未分类文章"))
                }
            />
            {folders
                .filter(f => f.parentId === null)
                .map(folder => {
                    const children = folders.filter(
                        f => f.parentId === folder.id
                    )
                    return (
                        <MenuTreeItem
                            key={"folder:" + folder.id}
                            value={"folder:" + folder.id}
                            label={folder.name}
                            icon={
                                <Icon
                                    iconName="FolderHorizontal"
                                    className={c.subtleIcon}
                                />
                            }
                            aside={
                                folder.count > 0 ? (
                                    <span className={c.countText}>
                                        {folder.count}
                                    </span>
                                ) : undefined
                            }
                            itemType={children.length ? "branch" : "leaf"}
                            isSelected={selected === "folder:" + folder.id}
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
                                setCtxMenu({
                                    folder,
                                    x: e.clientX,
                                    y: e.clientY,
                                })
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
                                if (id) moveFolder(id, folder.id)
                            }}>
                            {children.length > 0 && (
                                <Tree>
                                    {children.map(child => (
                                        <MenuTreeItem
                                            key={"folder:" + child.id}
                                            value={"folder:" + child.id}
                                            label={child.name}
                                            aside={
                                                child.count > 0 ? (
                                                    <span
                                                        className={c.countText}>
                                                        {child.count}
                                                    </span>
                                                ) : undefined
                                            }
                                            isSelected={
                                                selected ===
                                                "folder:" + child.id
                                            }
                                            onClick={() =>
                                                dispatch(
                                                    selectCollection(
                                                        "folder",
                                                        String(child.id),
                                                        folder.name +
                                                            " / " +
                                                            child.name
                                                    )
                                                )
                                            }
                                            onContextMenu={e => {
                                                e.preventDefault()
                                                setCtxMenu({
                                                    folder: child,
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                })
                                            }}
                                            draggable
                                            onDragStart={e =>
                                                e.dataTransfer.setData(
                                                    "application/x-article-folder",
                                                    String(child.id)
                                                )
                                            }
                                        />
                                    ))}
                                </Tree>
                            )}
                        </MenuTreeItem>
                    )
                })}
            {ctxMenu && (
                <ContextualMenu
                    target={{ x: ctxMenu.x, y: ctxMenu.y }}
                    onDismiss={() => setCtxMenu(null)}
                    items={[
                        {
                            key: "markRead",
                            text: "将此文件夹文章标为已读",
                            iconProps: { iconName: "CheckMark" },
                            onClick: () => {
                                const id = ctxMenu.folder.id
                                setCtxMenu(null)
                                void markFolderAllRead(id)
                            },
                        },
                        ...(ctxMenu.folder.parentId !== null
                            ? [
                                  {
                                      key: "moveRoot",
                                      text: "移回顶层文件夹",
                                      iconProps: { iconName: "Up" },
                                      onClick: () => {
                                          const id = ctxMenu.folder.id
                                          setCtxMenu(null)
                                          moveFolder(id, null)
                                      },
                                  },
                              ]
                            : []),
                        {
                            key: "manage",
                            text: "重命名 / 管理文件夹…",
                            iconProps: { iconName: "Edit" },
                            onClick: () => {
                                const id = ctxMenu.folder.id
                                setCtxMenu(null)
                                openFolders(id)
                            },
                        },
                        {
                            key: "newFolder",
                            text: "新建文件夹…",
                            iconProps: { iconName: "FabricNewFolder" },
                            onClick: () => {
                                setCtxMenu(null)
                                openFolders()
                            },
                        },
                    ]}
                />
            )}
        </>
    )
}
