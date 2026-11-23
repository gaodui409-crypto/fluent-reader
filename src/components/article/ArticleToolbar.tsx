import * as React from "react"
import { useRef, useState } from "react"
import intl from "react-intl-universal"
import {
    Callout,
    CommandBarButton,
    DefaultButton,
    DirectionalHint,
    Dropdown,
    Icon,
    IContextualMenuProps,
    Spinner as FluentV8Spinner,
    SpinnerSize,
    Stack,
} from "@fluentui/react"
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
import { ReaderWidthMode } from "../../reading-preferences"
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
        alignItems: "center",
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
    separator: {
        display: "inline-block",
        alignSelf: "center",
        height: "16px",
        margin: "0 2px",
        borderLeft: "1px solid var(--neutralQuaternaryAlt)",
        flexShrink: 0,
    },
    iconWrap: {
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
    },
    accentDot: {
        position: "absolute",
        top: "-2px",
        right: "-3px",
        width: "6px",
        height: "6px",
        borderRadius: "999px",
        backgroundColor: "var(--themePrimary)",
    },
    countBadge: {
        fontSize: "10.5px",
        lineHeight: 1.2,
        padding: "0 4px",
        borderRadius: "999px",
        backgroundColor: "var(--neutralLight)",
        color: "var(--themePrimary)",
        fontWeight: 600,
    },
    aaTextIcon: {
        fontWeight: 650,
        fontSize: "13px",
        letterSpacing: "-0.02em",
        lineHeight: 1,
    },
    calloutBody: {
        padding: "14px 16px",
        width: "268px",
        display: "grid",
        gap: "12px",
        backgroundColor: "var(--white)",
        color: "var(--black)",
        boxSizing: "border-box",
    },
    calloutSection: {
        display: "grid",
        gap: "6px",
    },
    calloutLabel: {
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--neutralSecondary)",
    },
    segmentedRow: {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "6px",
    },
    fontSizeRow: {
        display: "grid",
        gridTemplateColumns: "40px minmax(0, 1fr) 40px",
        gap: "6px",
        alignItems: "center",
    },
    segBtn: {
        minWidth: 0,
        padding: "0 6px",
        fontSize: "12px",
    },
})

const LINE_HEIGHT_PRESETS: Array<{ label: string; value: number }> = [
    { label: "紧凑 1.6", value: 1.6 },
    { label: "标准 1.82", value: 1.82 },
    { label: "宽松 2.05", value: 2.05 },
]

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
    findOpen: boolean
    fontSize: number
    fontFamily: string
    readerWidth: ReaderWidthMode
    lineHeight: number
    aiController: ReturnType<typeof useAIArticleController>
    moreMenuProps: IContextualMenuProps
    onToggleNotes: () => void
    onToggleFull: () => void
    onToggleWebpage: () => void
    onToggleFind: () => void
    onUpdateFontSize: (size: number) => void
    onUpdateFont: (font: string) => void
    onUpdateReaderWidth: (mode: ReaderWidthMode) => void
    onUpdateLineHeight: (lh: number) => void
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
    findOpen,
    fontSize,
    fontFamily,
    readerWidth,
    lineHeight,
    aiController,
    moreMenuProps,
    onToggleNotes,
    onToggleFull,
    onToggleWebpage,
    onToggleFind,
    onUpdateFontSize,
    onUpdateFont,
    onUpdateReaderWidth,
    onUpdateLineHeight,
    onDismiss,
}) => {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const [aaOpen, setAaOpen] = useState(false)
    const aaButtonRef = useRef<HTMLDivElement>(null)

    const savedOffline = useAppSelector(state =>
        state.library.saved.includes(item._id)
    )
    const offlineTask = useAppSelector(
        state => state.library.offlineTasks?.[item._id]
    )
    const offlineBusy =
        offlineTask?.state === "waiting" || offlineTask?.state === "running"
    const offlineFailed = offlineTask?.state === "failed"

    const noteBadgeCount = (hasNote ? 1 : 0) + folderCount
    const notesLabel =
        "备注与归类 (N)" +
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

    const readTitle = `${
        item.hasRead
            ? intl.get("article.markUnread") || "标为未读"
            : intl.get("article.markRead") || "标为已读"
    } (M)`
    const starTitle = `${
        item.starred
            ? intl.get("article.unstar") || "取消收藏"
            : intl.get("article.star") || "收藏"
    } (S)`
    const laterTitle = `${
        intl.get(
            item.readLater ? "personal.removeLater" : "personal.laterAction"
        ) || "稍后读"
    } (R)`
    const fullTitle = `${intl.get("article.loadFull") || "抓取全文"} (W)`
    const webpageTitle = `${intl.get("article.loadWebpage") || "内置网页"} (L)`
    const closeTitle = `${intl.get("close") || "关闭"} (Esc)`

    return (
        <Stack
            horizontal
            role="toolbar"
            aria-label="文章操作栏"
            className={classes.toolbar}>
            <Stack
                className={mergeClasses(
                    "actions",
                    classes.actions,
                    side && classes.sideActions
                )}
                grow
                horizontal
                tokens={{ childrenGap: 2 }}>
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
                    title={readTitle}
                    ariaLabel={readTitle}
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
                    title={starTitle}
                    ariaLabel={starTitle}
                    aria-pressed={Boolean(item.starred)}
                    className={item.starred ? "active" : ""}
                    iconProps={{
                        iconName: item.starred
                            ? "FavoriteStarFill"
                            : "FavoriteStar",
                    }}
                    onClick={() => dispatch(toggleStarred(item))}
                />
                <CommandBarButton
                    title={laterTitle}
                    ariaLabel={laterTitle}
                    aria-pressed={Boolean(item.readLater)}
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

                <span
                    role="separator"
                    aria-orientation="vertical"
                    className={classes.separator}
                />

                <CommandBarButton
                    title={notesLabel}
                    ariaLabel={notesLabel}
                    aria-pressed={notesOpen}
                    className={notesOpen ? "active" : ""}
                    iconProps={{ iconName: "EditNote" }}
                    onRenderIcon={() => (
                        <span className={classes.iconWrap}>
                            <Icon iconName="EditNote" />
                            {!notesOpen &&
                                noteBadgeCount > 0 &&
                                (folderCount > 0 ? (
                                    <span
                                        className={classes.countBadge}
                                        aria-hidden="true">
                                        {noteBadgeCount}
                                    </span>
                                ) : (
                                    <span
                                        className={classes.accentDot}
                                        aria-hidden="true"
                                    />
                                ))}
                        </span>
                    )}
                    onClick={onToggleNotes}
                />
                {preferences.aiEnabled && (
                    <AIArticleButtons controller={aiController} />
                )}
                {preferences.offlineEnabled &&
                    (savedOffline && !offlineBusy && !offlineFailed ? (
                        <CommandBarButton
                            title={offlineTitle}
                            ariaLabel={offlineTitle}
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
                                        text: "删除本地副本",
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
                            ariaLabel={offlineTitle}
                            aria-disabled={offlineBusy || undefined}
                            iconProps={{
                                iconName: offlineFailed ? "Warning" : "Save",
                            }}
                            onRenderIcon={
                                offlineBusy
                                    ? () => (
                                          <FluentV8Spinner
                                              size={SpinnerSize.xSmall}
                                          />
                                      )
                                    : undefined
                            }
                            onClick={() => {
                                if (offlineBusy) return
                                void dispatch(saveOffline(item._id))
                            }}
                        />
                    ))}

                <span
                    role="separator"
                    aria-orientation="vertical"
                    className={classes.separator}
                />

                {canFetchFull && (
                    <CommandBarButton
                        title={fullTitle}
                        ariaLabel={fullTitle}
                        aria-pressed={loadFull}
                        className={loadFull ? "active" : ""}
                        iconProps={{ iconName: "RawSource" }}
                        onClick={onToggleFull}
                    />
                )}
                <CommandBarButton
                    title={webpageTitle}
                    ariaLabel={webpageTitle}
                    aria-pressed={loadWebpage}
                    className={loadWebpage ? "active" : ""}
                    iconProps={{ iconName: "Globe" }}
                    onClick={onToggleWebpage}
                />
                <CommandBarButton
                    title="页内查找 (Ctrl+F)"
                    ariaLabel="页内查找 (Ctrl+F)"
                    aria-pressed={findOpen}
                    className={findOpen ? "active" : ""}
                    iconProps={{ iconName: "Search" }}
                    onClick={onToggleFind}
                />
                {!loadWebpage && (
                    <div ref={aaButtonRef} style={{ display: "inline-flex" }}>
                        <CommandBarButton
                            title="阅读排版"
                            ariaLabel="阅读排版"
                            aria-expanded={aaOpen}
                            className={aaOpen ? "active" : ""}
                            onRenderIcon={() => (
                                <span className={classes.aaTextIcon}>Aa</span>
                            )}
                            onClick={() => setAaOpen(prev => !prev)}
                        />
                    </div>
                )}
                <CommandBarButton
                    title={intl.get("more")}
                    ariaLabel={intl.get("more")}
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
                        title={closeTitle}
                        ariaLabel={closeTitle}
                        iconProps={{ iconName: "BackToWindow" }}
                        onClick={onDismiss}
                    />
                </Stack>
            )}

            {aaOpen && aaButtonRef.current && !loadWebpage && (
                <Callout
                    target={aaButtonRef.current}
                    isBeakVisible={false}
                    gapSpace={6}
                    directionalHint={DirectionalHint.bottomRightEdge}
                    setInitialFocus
                    onDismiss={ev => {
                        if (
                            ev &&
                            "target" in ev &&
                            (ev.target as HTMLElement | null)?.closest?.(
                                ".ms-Dropdown-callout"
                            )
                        ) {
                            return
                        }
                        setAaOpen(false)
                    }}>
                    <div
                        className={classes.calloutBody}
                        role="dialog"
                        aria-label="阅读排版设置">
                        <div className={classes.calloutSection}>
                            <span className={classes.calloutLabel}>
                                字号大小 (Ctrl+- / Ctrl+=)
                            </span>
                            <div className={classes.fontSizeRow}>
                                <DefaultButton
                                    className={classes.segBtn}
                                    ariaLabel="减小字号"
                                    disabled={fontSize <= 12}
                                    onClick={() =>
                                        onUpdateFontSize(
                                            Math.max(12, fontSize - 1)
                                        )
                                    }>
                                    −
                                </DefaultButton>
                                <DefaultButton
                                    className={classes.segBtn}
                                    title="点击恢复默认 16 px"
                                    onClick={() => onUpdateFontSize(16)}>
                                    {fontSize} px
                                </DefaultButton>
                                <DefaultButton
                                    className={classes.segBtn}
                                    ariaLabel="增大字号"
                                    disabled={fontSize >= 28}
                                    onClick={() =>
                                        onUpdateFontSize(
                                            Math.min(28, fontSize + 1)
                                        )
                                    }>
                                    +
                                </DefaultButton>
                            </div>
                        </div>

                        <div className={classes.calloutSection}>
                            <span className={classes.calloutLabel}>
                                版心宽度
                            </span>
                            <div
                                className={classes.segmentedRow}
                                role="group"
                                aria-label="版心宽度">
                                {(
                                    [
                                        ["narrow", "窄栏"],
                                        ["standard", "标准"],
                                        ["wide", "宽屏"],
                                    ] as const
                                ).map(([mode, label]) => (
                                    <DefaultButton
                                        key={mode}
                                        className={classes.segBtn}
                                        checked={readerWidth === mode}
                                        aria-pressed={readerWidth === mode}
                                        onClick={() =>
                                            onUpdateReaderWidth(mode)
                                        }>
                                        {label}
                                    </DefaultButton>
                                ))}
                            </div>
                        </div>

                        <div className={classes.calloutSection}>
                            <span className={classes.calloutLabel}>行距</span>
                            <div
                                className={classes.segmentedRow}
                                role="group"
                                aria-label="行距">
                                {LINE_HEIGHT_PRESETS.map(preset => {
                                    const active =
                                        Math.abs(lineHeight - preset.value) <
                                        0.04
                                    return (
                                        <DefaultButton
                                            key={preset.value}
                                            className={classes.segBtn}
                                            checked={active}
                                            aria-pressed={active}
                                            onClick={() =>
                                                onUpdateLineHeight(preset.value)
                                            }>
                                            {preset.label}
                                        </DefaultButton>
                                    )
                                })}
                            </div>
                        </div>

                        <div className={classes.calloutSection}>
                            <Dropdown
                                label={intl.get("article.font") || "正文字体"}
                                selectedKey={fontFamily}
                                options={(window.fontList || [""]).map(
                                    font => ({
                                        key: font,
                                        text:
                                            font === ""
                                                ? intl.get("default")
                                                : font,
                                    })
                                )}
                                onChange={(_, opt) =>
                                    opt && onUpdateFont(String(opt.key))
                                }
                            />
                        </div>
                    </div>
                </Callout>
            )}
        </Stack>
    )
}
