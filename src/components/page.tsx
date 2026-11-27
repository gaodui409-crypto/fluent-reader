import * as React from "react"
import { useCallback } from "react"
import { Feed } from "./feeds/feed"
import { Icon, FocusTrapZone } from "@fluentui/react"
import Article from "./article"
import { ViewType } from "../schema-types"
import ArticleSearch from "./utils/article-search"
import { useAppSelector, useAppDispatch } from "../scripts/reducer"
import {
    canShowOffsetItem,
    dismissItem,
    showOffsetItem,
} from "../scripts/models/page"
import { ContextMenuType } from "../scripts/models/app"
import { makeStyles, mergeClasses } from "@griffel/react"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"
import { useArticleOverlayOpen } from "./utils/hooks/useArticleOverlayOpen"
import { useArticleOverlayWidth } from "./utils/hooks/useArticleOverlayWidth"
import { ResizeHandle } from "./utils/ResizeHandle"
import { ListView } from "./list-view"

const usePageClasses = makeStyles({
    feedMain: {
        "marginTop": "calc(-1 * var(--navHeight))",
        "marginLeft": 0,
        "transition": "margin-left var(--transition-timing) 0.32s",
        "height": "calc(100% - var(--selectionHeight, 0px))",
        "overflow": "hidden",
        "backgroundColor": "var(--neutralLighterAlt)",
        "::before": {
            content: '""',
            display: "block",
            position: "relative",
            top: "var(--navHeight)",
            left: 0,
            width: "calc(100% - 16px)",
            height: "var(--navHeight)",
            marginBottom: "calc(-1 * var(--navHeight))",
            background:
                "linear-gradient(var(--neutralLighterAlt), transparent)",
            pointerEvents: "none",
            zIndex: 1,
        },
    },
    feedMenuOpen: {
        "@media (min-width: 1280px)": {
            marginLeft: "var(--sidebarWidth, 276px)",
        },
    },
    articleContainer: {
        position: "fixed",
        zIndex: 6,
        inset: 0,
        WebkitAppRegion: "no-drag",
    },
    articleScrim: {
        position: "absolute",
        inset: 0,
        WebkitAppRegion: "no-drag",
        zIndex: -1,
        pointerEvents: "none",
        backgroundColor: "#0008",
        animationName: "fade",
        animationDuration: "0.35s",
        animationTimingFunction: "var(--transition-timing)",
        animationFillMode: "backwards",
    },
    feedBlurred: {
        filter: "var(--blur)",
    },
    articleWrapper: {
        position: "relative",
        margin: "var(--navHeight) auto 0",
        width: "var(--article-overlay-width)",
        height: "calc(100% - var(--navHeight) - 18px)",
        WebkitAppRegion: "no-drag",
        backgroundColor: "var(--white)",
        boxShadow:
            "0 8px 24px 0 rgba(0, 0, 0, 0.16), 0 1.2px 3.6px 0 rgba(0, 0, 0, 0.11)",
        borderRadius: "8px",
        overflow: "hidden",
        animationName: {
            from: { opacity: 0, transform: "translateY(16px)" },
            to: { opacity: 1, transform: "translateY(0)" },
        },
        animationDuration: "0.35s",
        animationTimingFunction: "var(--transition-timing)",
        animationFillMode: "backwards",
    },
    resizeHandle: {
        top: "var(--navHeight)",
        bottom: "18px",
    },
    resizeHandleLeft: {
        left: "calc(50% - var(--article-overlay-width) / 2 - 4px)",
    },
    resizeHandleRight: {
        right: "calc(50% - var(--article-overlay-width) / 2 - 4px)",
    },
    articleBtn: {
        ":enabled": {
            color: "#fff",
        },
    },
    articleGroup: {
        position: "absolute",
        top: "calc(50% - 32px)",
        animationName: "fade",
        animationDuration: "0.35s",
        animationTimingFunction: "var(--transition-timing)",
        animationFillMode: "backwards",
    },
    articleGroupPrev: {
        left: "calc(50% - var(--article-overlay-width) / 2 - 56px)",
    },
    articleGroupNext: {
        right: "calc(50% - var(--article-overlay-width) / 2 - 56px)",
    },
})

const Page: React.FC = () => {
    const dispatch = useAppDispatch()
    const pageClasses = usePageClasses()

    const feedId = useAppSelector(s => s.page.feedId)
    const settingsOn = useAppSelector(s => s.app.settings.display)
    const menuOn = useAppSelector(s => s.app.menu)
    const contextOn = useAppSelector(
        s => s.app.contextMenu.type !== ContextMenuType.Hidden
    )
    const itemId = useAppSelector(s => s.page.itemId)
    const itemFromFeed = useAppSelector(s => s.page.itemFromFeed)
    const hasPrevious = useAppSelector(s => canShowOffsetItem(s, -1))
    const hasNext = useAppSelector(s => canShowOffsetItem(s, 1))
    const viewType = useAppSelector(s => s.page.viewType)
    const articleOverlayOpen = useArticleOverlayOpen()
    const articleWidth = useArticleOverlayWidth()

    const handleDismissItem = useCallback(
        () => dispatch(dismissItem()),
        [dispatch]
    )
    const handleOffsetItem = useCallback(
        (event: React.MouseEvent, offset: number) => {
            event.stopPropagation()
            void dispatch(showOffsetItem(offset))
        },
        [dispatch]
    )
    const prevItem = useCallback(
        (event: React.MouseEvent) => handleOffsetItem(event, -1),
        [handleOffsetItem]
    )
    const nextItem = useCallback(
        (event: React.MouseEvent) => handleOffsetItem(event, 1),
        [handleOffsetItem]
    )

    return viewType === ViewType.List ? (
        <>
            {settingsOn ? null : (
                <ListView feedId={feedId} itemId={itemId} menuOn={menuOn} />
            )}
        </>
    ) : (
        <>
            {settingsOn ? null : (
                <div
                    key="card"
                    className={mergeClasses(
                        "main",
                        pageClasses.feedMain,
                        menuOn && "menu-on",
                        menuOn && pageClasses.feedMenuOpen,
                        articleOverlayOpen && pageClasses.feedBlurred
                    )}>
                    <ArticleSearch />
                    <Feed
                        viewType={viewType}
                        feedId={feedId}
                        key={feedId + viewType}
                    />
                </div>
            )}
            {articleOverlayOpen && (
                <FocusTrapZone
                    disabled={contextOn}
                    firstFocusableTarget={root =>
                        root.querySelector<HTMLElement>(".article")
                    }
                    ignoreExternalFocusing={true}
                    isClickableOutsideFocusTrap={true}
                    className={mergeClasses(
                        "article-container",
                        pageClasses.articleContainer
                    )}
                    style={articleWidth.style}
                    onClick={handleDismissItem}>
                    <div
                        aria-hidden="true"
                        className={pageClasses.articleScrim}
                    />
                    <div
                        className={mergeClasses(
                            "article-wrapper",
                            pageClasses.articleWrapper
                        )}
                        onClick={e => e.stopPropagation()}>
                        <Article itemId={itemId} />
                    </div>
                    {([-1, 1] as const).map(side => (
                        <ResizeHandle
                            key={side}
                            label={
                                side === -1
                                    ? "调整阅读窗左侧宽度"
                                    : "调整阅读窗右侧宽度"
                            }
                            multiplier={2 * side}
                            styleClass={mergeClasses(
                                pageClasses.resizeHandle,
                                side === -1
                                    ? pageClasses.resizeHandleLeft
                                    : pageClasses.resizeHandleRight
                            )}
                            {...articleWidth.handleProps}
                        />
                    ))}
                    {itemFromFeed && (
                        <>
                            <FlatButtonGroup
                                styleClass={mergeClasses(
                                    pageClasses.articleGroup,
                                    pageClasses.articleGroupPrev
                                )}>
                                <FlatButton
                                    styleClass={pageClasses.articleBtn}
                                    title="上一篇（← / K）"
                                    ariaLabel="上一篇文章"
                                    disabled={!hasPrevious}
                                    onClick={prevItem}>
                                    <Icon iconName="Back" />
                                </FlatButton>
                            </FlatButtonGroup>
                            <FlatButtonGroup
                                styleClass={mergeClasses(
                                    pageClasses.articleGroup,
                                    pageClasses.articleGroupNext
                                )}>
                                <FlatButton
                                    styleClass={pageClasses.articleBtn}
                                    title="下一篇（→ / J）"
                                    ariaLabel="下一篇文章"
                                    disabled={!hasNext}
                                    onClick={nextItem}>
                                    <Icon iconName="Forward" />
                                </FlatButton>
                            </FlatButtonGroup>
                        </>
                    )}
                </FocusTrapZone>
            )}
        </>
    )
}

export default Page
