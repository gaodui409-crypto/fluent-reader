import * as React from "react"
import { useState } from "react"
import {
    makeStyles,
    mergeClasses,
    tokens,
    TreeItem,
    TreeItemLayout,
    useSubtreeContext_unstable,
} from "@fluentui/react-components"

const useTreeItemClasses = makeStyles({
    treeItem: {
        minHeight: "32px",
        borderRadius: "6px",
        marginLeft: "4px",
        marginRight: "4px",
    },
    treeLeafItem: {
        paddingLeft: "10px",
    },
    treeLeafSubItem: {
        paddingLeft: "22px",
    },
    dragTarget: {
        outline: `2px solid ${tokens.colorBrandStroke1}`,
        outlineOffset: "-2px",
        backgroundColor: tokens.colorSubtleBackgroundHover,
    },
    selectedItem: {
        "backgroundColor": tokens.colorSubtleBackgroundSelected,
        "::after": {
            content: '""',
            position: "absolute",
            left: "2px",
            top: "6px",
            width: "3px",
            height: "20px",
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
        paddingLeft: "6px",
        fontSize: "12px",
        fontVariantNumeric: "tabular-nums",
        flexShrink: 0,
        whiteSpace: "nowrap",
    },
    deltaBadge: {
        color: tokens.colorCompoundBrandForeground1,
        marginLeft: "3px",
        fontWeight: tokens.fontWeightSemibold,
    },
})

export interface MenuTreeItemProps {
    draggable?: boolean
    onDragStart?: React.DragEventHandler
    onDrop?: React.DragEventHandler
    value: string
    itemType?: "leaf" | "branch"
    label: string
    isSelected?: boolean
    icon?: React.ReactElement
    unreadCount?: number
    deltaCount?: number
    aside?: React.ReactElement
    onClick: () => void
    onContextMenu?: (e: React.MouseEvent) => void
    children?: React.ReactNode
}

export const MenuTreeItem: React.FC<MenuTreeItemProps> = ({
    value,
    itemType = "leaf",
    label,
    isSelected = false,
    icon,
    unreadCount,
    deltaCount,
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
    const [dragOver, setDragOver] = useState(false)

    let resolvedAside: React.ReactElement | undefined = aside
    if (resolvedAside === undefined && unreadCount && unreadCount > 0) {
        const shownDelta =
            deltaCount && deltaCount > 0 ? Math.min(deltaCount, unreadCount) : 0
        resolvedAside = (
            <span
                className={c.unreadCount}
                title={
                    shownDelta > 0
                        ? `当前未读 ${unreadCount} 篇，距上次查看新增 ${shownDelta} 篇`
                        : undefined
                }>
                {unreadCount >= 1000 ? "999+" : String(unreadCount)}
                {shownDelta > 0 && (
                    <span className={c.deltaBadge}>
                        (+{shownDelta >= 999 ? "999+" : shownDelta})
                    </span>
                )}
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
            onDragOver={
                onDrop
                    ? e => {
                          e.preventDefault()
                          if (!dragOver) setDragOver(true)
                      }
                    : undefined
            }
            onDragLeave={
                onDrop
                    ? e => {
                          if (
                              !e.currentTarget.contains(
                                  e.relatedTarget as Node | null
                              )
                          ) {
                              setDragOver(false)
                          }
                      }
                    : undefined
            }
            onDrop={
                onDrop
                    ? e => {
                          setDragOver(false)
                          onDrop(e)
                      }
                    : undefined
            }
            onContextMenu={handleContextMenu}>
            <TreeItemLayout
                aria-label={label}
                className={mergeClasses(
                    c.treeItem,
                    itemType === "leaf" && c.treeLeafItem,
                    level > 1 && c.treeLeafSubItem,
                    isSelected && c.selectedItem,
                    dragOver && c.dragTarget
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

export const SafeFavicon: React.FC<{ src?: string; className?: string }> = ({
    src,
    className,
}) => {
    const [failed, setFailed] = useState(false)
    React.useEffect(() => {
        setFailed(false)
    }, [src])
    if (!src || failed) return null
    return (
        <img
            src={src}
            className={className}
            alt=""
            onError={() => setFailed(true)}
        />
    )
}
