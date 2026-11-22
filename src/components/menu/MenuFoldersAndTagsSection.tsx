import * as React from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react"
import { makeStyles, tokens, Tree } from "@fluentui/react-components"
import type { ArticleFolder } from "../../archive-types"
import { useAppDispatch } from "../../scripts/reducer"
import { selectCollection } from "../../scripts/models/page"
import { refreshArchive } from "../../scripts/models/archive"
import { openFolders } from "../personal/folders"
import { MenuTreeItem } from "./MenuTreeItem"

const useClasses = makeStyles({
    sectionHeader: {
        marginTop: "14px",
        marginBottom: "4px",
        marginLeft: "12px",
        marginRight: "12px",
        fontSize: "12px",
        color: tokens.colorNeutralForeground3,
        userSelect: "none",
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
    tags: string[]
}> = ({ selected, folders, tags }) => {
    const c = useClasses()
    const dispatch = useAppDispatch()

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

    return (
        <>
            <div
                className={c.sectionHeader}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                    e.preventDefault()
                    const id = Number(
                        e.dataTransfer.getData("application/x-article-folder")
                    )
                    if (id) moveFolder(id, null)
                }}>
                文章归档
            </div>
            <MenuTreeItem
                value="folder-manager"
                icon={
                    <Icon iconName="FabricNewFolder" className={c.subtleIcon} />
                }
                label="＋管理文章文件夹"
                onClick={() => openFolders()}
            />
            <MenuTreeItem
                value="library:"
                icon={<Icon iconName="Library" className={c.subtleIcon} />}
                label="未分类文章"
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
                                <span className={c.countText}>
                                    {folder.count}
                                </span>
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
                                                <span className={c.countText}>
                                                    {child.count}
                                                </span>
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
                                                openFolders(child.id)
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
            {tags
                .filter(tag => !tag.startsWith("主题/"))
                .map(tag => (
                    <MenuTreeItem
                        key={"tag:" + tag}
                        value={"tag:" + tag}
                        icon={<Icon iconName="Tag" className={c.subtleIcon} />}
                        label={
                            tag.startsWith("主题/")
                                ? intl.get("organize.topicLabel") + tag.slice(3)
                                : "#" + tag
                        }
                        isSelected={selected === "tag:" + tag}
                        onClick={() => dispatch(selectCollection("tag", tag))}
                    />
                ))}
        </>
    )
}
