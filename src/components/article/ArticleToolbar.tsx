import * as React from "react"
import intl from "react-intl-universal"
import { CommandBarButton, IContextualMenuProps, Stack } from "@fluentui/react"
import { Spinner } from "@fluentui/react-components"
import { makeStyles, mergeClasses } from "@griffel/react"
import {
    markRead,
    markUnread,
    RSSItem,
    toggleStarred,
    updateItemMeta,
} from "../../scripts/models/item"
import { RSSSource } from "../../scripts/models/source"
import { SourcePreferences } from "../../source-preferences"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import {
    deleteOffline,
    openOffline,
    saveOffline,
} from "../../scripts/models/library"
import { SafeFavicon } from "../menu/MenuTreeItem"
import { AIArticleButtons, useAIArticleController } from "../personal/ai"

const useStyles = makeStyles({
    toolbar: {
        height: "38px",
        flexShrink: 0,
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--white)",
    },
    closeGroup: { width: "44px", flexShrink: 0 },
    actions: {
        minWidth: 0,
        color: "var(--black)",
        paddingLeft: "14px",
        paddingRight: "8px",
    },
    sideActions: {
        paddingLeft: "14px",
        paddingRight: "8px",
    },
    source: {
        minWidth: "88px",
        flexBasis: 0,
        display: "flex",
        alignItems: "center",
    },
    sourceName: {
        lineHeight: "38px",
        userSelect: "none",
        maxWidth: "340px",
        width: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "inline-block",
        fontSize: "13px",
    },
    sourceIcon: {
        "width": "16px",
        "height": "16px",
        "verticalAlign": "middle",
        "margin": "0 8px 2px 0",
        "borderRadius": "3px",
        "&.fui-Spinner": { display: "inline-flex" },
    },
    creator: {
        "color": "var(--neutralSecondaryAlt)",
        "userSelect": "text",
        "::before": {
            display: "inline-block",
            content: '"/"',
            margin: "0 6px",
        },
    },
    unreadIcon: { fontSize: "14px", textAlign: "center" },
    menuIcon: { display: "none" },
})

export const ArticleToolbar: React.FC<{
    item: RSSItem
    source: RSSSource
    side: boolean
    loaded: boolean
    preferences: SourcePreferences
    canFetchFull: boolean
    loadFull: boolean
    loadWebpage: boolean
    notesOpen: boolean
    hasNote: boolean
    folderCount: number
    aiController: ReturnType<typeof useAIArticleController>
    moreMenuProps: IContextualMenuProps
    onToggleNotes: () => void
    onToggleFull: () => void
    onToggleWebpage: () => void
    onDismiss: () => void
}> = ({
    item,
    source,
    side,
    loaded,
    preferences,
    canFetchFull,
    loadFull,
    loadWebpage,
    notesOpen,
    hasNote,
    folderCount,
    aiController,
    moreMenuProps,
    onToggleNotes,
    onToggleFull,
    onToggleWebpage,
    onDismiss,
}) => {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const savedOffline = useAppSelector(state =>
        state.library.saved.includes(item._id)
    )
    const offlineTask = useAppSelector(
        state => state.library.offlineTasks?.[item._id]
    )
    const offlineBusy =
        offlineTask?.state === "waiting" || offlineTask?.state === "running"
    const offlineFailed = offlineTask?.state === "failed"

    const notesLabel =
        "备注与归类" +
        (hasNote ? " · 有备注" : "") +
        (folderCount ? ` · ${folderCount} 个文件夹` : "") +
        (notesOpen ? "（点击收起）" : "")

    const offlineTitle = offlineBusy
        ? "正在保存离线网页…"
        : offlineFailed
        ? `离线保存失败（点击重试）：${offlineTask?.error || ""}`
        : savedOffline
        ? intl.get("personal.savedOffline")
        : intl.get("personal.offlineSave")

    return (
        <Stack horizontal className={classes.toolbar}>
            <Stack
                className={mergeClasses(
                    "actions",
                    classes.actions,
                    side && classes.sideActions
                )}
                grow
                horizontal
                tokens={{ childrenGap: 4 }}>
                <Stack.Item grow className={classes.source}>
                    <span className={classes.sourceName} title={source.name}>
                        {loaded ? (
                            <SafeFavicon
                                className={mergeClasses(
                                    "favicon",
                                    classes.sourceIcon
                                )}
                                src={source.iconurl}
                            />
                        ) : (
                            <Spinner
                                size="extra-tiny"
                                className={classes.sourceIcon}
                            />
                        )}
                        {source.name}
                        {item.creator && (
                            <span className={classes.creator}>
                                {item.creator}
                            </span>
                        )}
                    </span>
                </Stack.Item>
                <CommandBarButton
                    title={
                        item.hasRead
                            ? intl.get("article.markUnread")
                            : intl.get("article.markRead")
                    }
                    iconProps={
                        item.hasRead
                            ? { iconName: "StatusCircleRing" }
                            : {
                                  iconName: "RadioBtnOn",
                                  className: classes.unreadIcon,
                              }
                    }
                    onClick={() =>
                        dispatch(
                            item.hasRead ? markUnread(item) : markRead(item)
                        )
                    }
                />
                <CommandBarButton
                    title={
                        item.starred
                            ? intl.get("article.unstar")
                            : intl.get("article.star")
                    }
                    className={item.starred ? "active" : ""}
                    iconProps={{
                        iconName: item.starred
                            ? "FavoriteStarFill"
                            : "FavoriteStar",
                    }}
                    onClick={() => dispatch(toggleStarred(item))}
                />
                <CommandBarButton
                    title={intl.get(
                        item.readLater
                            ? "personal.removeLater"
                            : "personal.laterAction"
                    )}
                    className={item.readLater ? "active" : ""}
                    iconProps={{ iconName: "Clock" }}
                    onClick={() =>
                        void dispatch(
                            updateItemMeta(item, {
                                readLater: !item.readLater,
                            })
                        ).catch(error =>
                            window.utils.showErrorBox(
                                intl.get("personal.failed"),
                                String(error)
                            )
                        )
                    }
                />
                <CommandBarButton
                    title={notesLabel}
                    ariaLabel={notesLabel}
                    className={
                        notesOpen || hasNote || folderCount > 0 ? "active" : ""
                    }
                    iconProps={{ iconName: "EditNote" }}
                    onClick={onToggleNotes}
                />
                {preferences.aiEnabled && (
                    <AIArticleButtons controller={aiController} />
                )}
                {preferences.offlineEnabled &&
                    (savedOffline && !offlineBusy && !offlineFailed ? (
                        <CommandBarButton
                            title={offlineTitle}
                            className="active"
                            iconProps={{ iconName: "OfflineStorage" }}
                            menuIconProps={{ className: classes.menuIcon }}
                            menuProps={{
                                items: [
                                    {
                                        key: "open",
                                        text: intl.get("personal.openOffline"),
                                        iconProps: {
                                            iconName: "OfflineStorage",
                                        },
                                        onClick: () => openOffline(item._id),
                                    },
                                    {
                                        key: "reveal",
                                        text: intl.get("personal.showFile"),
                                        iconProps: { iconName: "FolderOpen" },
                                        onClick: () =>
                                            openOffline(item._id, true),
                                    },
                                    {
                                        key: "resave",
                                        text: "重新保存离线网页",
                                        iconProps: { iconName: "Save" },
                                        onClick: () =>
                                            void dispatch(
                                                saveOffline(item._id)
                                            ),
                                    },
                                    {
                                        key: "delete",
                                        text: "删除离线网页",
                                        iconProps: { iconName: "Delete" },
                                        onClick: () =>
                                            void dispatch(
                                                deleteOffline(item._id)
                                            ),
                                    },
                                ],
                            }}
                        />
                    ) : (
                        <CommandBarButton
                            title={offlineTitle}
                            disabled={offlineBusy}
                            iconProps={{
                                iconName: offlineBusy
                                    ? "Sync"
                                    : offlineFailed
                                    ? "Warning"
                                    : "Save",
                            }}
                            onClick={() => void dispatch(saveOffline(item._id))}
                        />
                    ))}
                {canFetchFull && (
                    <CommandBarButton
                        title={intl.get("article.loadFull")}
                        className={loadFull ? "active" : ""}
                        iconProps={{ iconName: "RawSource" }}
                        onClick={onToggleFull}
                    />
                )}
                <CommandBarButton
                    title={intl.get("article.loadWebpage")}
                    className={loadWebpage ? "active" : ""}
                    iconProps={{ iconName: "Globe" }}
                    onClick={onToggleWebpage}
                />
                <CommandBarButton
                    title={intl.get("more")}
                    iconProps={{ iconName: "More" }}
                    menuIconProps={{ className: classes.menuIcon }}
                    menuProps={moreMenuProps}
                />
            </Stack>
            {!side && (
                <Stack
                    horizontal
                    horizontalAlign="end"
                    className={classes.closeGroup}>
                    <CommandBarButton
                        title={intl.get("close")}
                        iconProps={{ iconName: "BackToWindow" }}
                        onClick={onDismiss}
                    />
                </Stack>
            )}
        </Stack>
    )
}
