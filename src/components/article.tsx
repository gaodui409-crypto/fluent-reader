import * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FocusZone } from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { markRead, toggleHidden } from "../scripts/models/item"
import {
    RSSSource,
    SourceOpenTarget,
    SourceTextDirection,
    updateSource,
} from "../scripts/models/source"
import { useAppDispatch, useAppSelector } from "../scripts/reducer"
import {
    canShowOffsetItem,
    dismissItem,
    showOffsetItem,
} from "../scripts/models/page"
import { useArticleView } from "./utils/hooks/useArticleView"
import { useSourcePreferences } from "../scripts/models/preferences"
import { deleteOffline } from "../scripts/models/library"
import { AIArticlePanel, useAIArticleController } from "./personal/ai"
import {
    ArticleNotesDrawer,
    useArticleNotesState,
} from "./personal/article-notes"
import { buildMoreMenuProps } from "./article/articleMenus"
import { useArticleShortcuts } from "./article/useArticleShortcuts"
import { ArticleToolbar } from "./article/ArticleToolbar"
import { ArticleReaderSurface } from "./article/ArticleReaderSurface"

const useStyles = makeStyles({
    root: {
        "height": "100%",
        "minWidth": 0,
        "display": "flex",
        "flexDirection": "column",
        "userSelect": "none",
        "& i.ms-Icon": { color: "var(--neutralDarker)" },
    },
})

const FALLBACK_SOURCE = {
    sid: -1,
    url: "",
    iconurl: "",
    name: "已退订来源",
    openTarget: SourceOpenTarget.Local,
    defaultHidden: false,
    lastFetched: new Date(0),
    serviceRef: null,
    fetchFrequency: 0,
    rules: [],
    textDir: SourceTextDirection.LTR,
    hidden: false,
    unreadCount: 0,
} as RSSSource

type ArticleProps = Readonly<{
    itemId: number
    side?: boolean
}>

function Article({ itemId, side = false }: ArticleProps) {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const item = useAppSelector(state => state.items[itemId])
    const rawSource = useAppSelector(state =>
        item ? state.sources[item.source] : undefined
    )
    const source = rawSource || FALLBACK_SOURCE
    const preferences = useSourcePreferences(rawSource)
    const collectionTarget = useAppSelector(
        s => s.reading.collections[s.app.menuKey]?.openTarget
    )
    const collection = useAppSelector(s => s.app.menuKey)
    const canFetchFull =
        preferences.fetchMode !== "off" || collectionTarget === 3
    const openTarget = collectionTarget ?? preferences.openTarget
    const savedOffline = useAppSelector(state =>
        item ? state.library.saved.includes(item._id) : false
    )
    const locale = useAppSelector(state => state.app.locale)

    const [fontFamily, setFontFamily] = useState(() =>
        window.settings.getFont()
    )
    const [fontSize, setFontSize] = useState(() =>
        window.settings.getFontSize()
    )
    const [isDarkMode, setIsDarkMode] = useState(() =>
        window.settings.shouldUseDarkColors()
    )
    const [notesOpen, setNotesOpen] = useState(false)

    useEffect(() => {
        return window.settings.addThemeUpdateListener(dark =>
            setIsDarkMode(dark)
        )
    }, [])

    useEffect(() => {
        setNotesOpen(false)
    }, [itemId])

    // Fallback safe item object so hooks always run unconditionally
    const safeItem = useMemo(
        () =>
            item || {
                _id: itemId,
                source: -1,
                title: "",
                link: "",
                date: new Date(0),
                fetchedDate: new Date(0),
                content: "",
                snippet: "",
                hasRead: true,
                starred: false,
                hidden: false,
                notify: false,
            },
        [item, itemId]
    )

    const {
        articleRef,
        webview,
        webviewKey,
        showWebview,
        loadWebpage,
        loadFull,
        fullContent,
        loaded,
        error,
        markLocalReady,
        toggleWebpage,
        toggleFull,
        reload,
    } = useArticleView(
        safeItem,
        collectionTarget === undefined &&
            preferences.fetchMode === "off" &&
            openTarget === 3
            ? 0
            : openTarget,
        collectionTarget === 3 ? collection : undefined
    )

    const notesState = useArticleNotesState(itemId)
    const aiController = useAIArticleController(itemId)

    const dismiss = useCallback(() => dispatch(dismissItem()), [dispatch])

    const handleToggleHidden = useCallback(() => {
        if (!item) return
        if (!item.hidden) {
            dispatch((_, getState) => {
                if (canShowOffsetItem(getState(), 1)) {
                    void dispatch(showOffsetItem(1))
                } else {
                    dispatch(dismissItem())
                }
            })
        }
        if (!item.hasRead && !item.hidden) dispatch(markRead(item))
        dispatch(toggleHidden(item))
    }, [dispatch, item])

    const closeNotes = useCallback(() => {
        setNotesOpen(false)
        requestAnimationFrame(() =>
            articleRef.current?.focus({
                preventScroll: true,
            })
        )
    }, [articleRef])

    const closeAI = useCallback(() => {
        aiController.close()
        requestAnimationFrame(() =>
            articleRef.current?.focus({
                preventScroll: true,
            })
        )
    }, [aiController, articleRef])

    const toggleNotes = useCallback(() => {
        setNotesOpen(prev => {
            const next = !prev
            if (!next) {
                requestAnimationFrame(() =>
                    articleRef.current?.focus({
                        preventScroll: true,
                    })
                )
            }
            return next
        })
    }, [articleRef])

    const { handleNavigationKey, scrollReaderByPage } = useArticleShortcuts({
        item,
        articleRef,
        webview,
        loadWebpage,
        canFetchFull,
        notesOpen,
        aiOpen: Boolean(aiController.kind),
        closeNotes,
        closeAI,
        toggleWebpage,
        toggleFull,
        onToggleHidden: handleToggleHidden,
        onToggleNotes: toggleNotes,
    })

    if (!item) return null

    const updateFontSize = (size: number) => {
        window.settings.setFontSize(size)
        setFontSize(size)
    }
    const updateFont = (font: string) => {
        window.settings.setFont(font)
        setFontFamily(font)
    }
    const updateTextDirection = (direction: SourceTextDirection) => {
        if (!rawSource) return
        dispatch(
            updateSource({ ...rawSource, textDir: direction } as RSSSource)
        )
    }

    const moreMenuProps = buildMoreMenuProps({
        item,
        source,
        savedOffline,
        loadFull,
        loadWebpage,
        fontFamily,
        fontSize,
        onReload: reload,
        onToggleHidden: handleToggleHidden,
        onUpdateFont: updateFont,
        onUpdateFontSize: updateFontSize,
        onUpdateDirection: updateTextDirection,
        onDeleteOffline: () => {
            void dispatch(deleteOffline(item._id))
        },
    })

    return (
        <FocusZone
            elementRef={articleRef}
            tabIndex={-1}
            allowFocusRoot
            preventFocusRestoration
            onKeyDown={event => {
                if (event.target !== event.currentTarget) return
                if (
                    event.key === " " &&
                    !event.ctrlKey &&
                    !event.altKey &&
                    !event.metaKey
                ) {
                    event.preventDefault()
                    event.stopPropagation()
                    scrollReaderByPage(event.shiftKey)
                    return
                }
                if (
                    handleNavigationKey(event.key, {
                        ctrl: event.ctrlKey,
                        alt: event.altKey,
                        meta: event.metaKey,
                    }) ||
                    [
                        "ArrowUp",
                        "ArrowDown",
                        "PageUp",
                        "PageDown",
                        "Home",
                        "End",
                    ].includes(event.key)
                ) {
                    event.preventDefault()
                    event.stopPropagation()
                }
            }}
            className={mergeClasses("article", classes.root)}>
            <ArticleToolbar
                item={item}
                source={source}
                side={side}
                loaded={loaded}
                preferences={preferences}
                canFetchFull={canFetchFull}
                loadFull={loadFull}
                loadWebpage={loadWebpage}
                notesOpen={notesOpen}
                hasNote={Boolean(notesState.draft?.text)}
                folderCount={notesState.members.length}
                aiController={aiController}
                moreMenuProps={moreMenuProps}
                onToggleNotes={toggleNotes}
                onToggleFull={toggleFull}
                onToggleWebpage={toggleWebpage}
                onDismiss={dismiss}
            />
            <ArticleNotesDrawer
                open={notesOpen}
                onClose={closeNotes}
                state={notesState}
            />
            <AIArticlePanel
                controller={aiController}
                onCloseRestoreFocus={closeAI}
                fontFamily={fontFamily}
                fontSize={fontSize}
            />
            <ArticleReaderSurface
                item={item}
                source={source}
                locale={locale}
                dark={isDarkMode}
                webview={webview}
                webviewKey={webviewKey}
                showWebview={showWebview}
                hiddenByExpandedPanel={Boolean(
                    aiController.kind && aiController.expanded
                )}
                loadWebpage={loadWebpage}
                loadFull={loadFull}
                fullContent={fullContent}
                fontFamily={fontFamily}
                fontSize={fontSize}
                error={error}
                onLocalReady={markLocalReady}
                onReload={reload}
                onSwitchWebpage={toggleWebpage}
            />
        </FocusZone>
    )
}

export default Article
