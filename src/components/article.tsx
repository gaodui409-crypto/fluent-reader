import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import intl from "react-intl-universal"
import {
    Callout,
    DefaultButton,
    DirectionalHint,
    FocusZone,
    MessageBar,
    MessageBarType,
    Spinner,
    SpinnerSize,
} from "@fluentui/react"
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
import { toggleSettings } from "../scripts/models/app"
import { saveReadingPreferences } from "../scripts/models/reading"
import { ReaderWidthMode } from "../reading-preferences"
import { useArticleView } from "./utils/hooks/useArticleView"
import { useSourcePreferences } from "../scripts/models/preferences"
import { deleteOffline } from "../scripts/models/library"
import { AIArticlePanel, useAIArticleController } from "./personal/ai"
import { AIMarkdown } from "./personal/ai-markdown"
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
    selectionCallout: {
        padding: "14px 16px",
        width: "min(460px, 86vw)",
        maxHeight: "55vh",
        overflowY: "auto",
        display: "grid",
        gap: "10px",
        backgroundColor: "var(--white)",
        color: "var(--black)",
        boxSizing: "border-box",
    },
    selectionHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
    },
    selectionActions: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
    },
    selectionSource: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
        borderLeft: "2px solid var(--neutralQuaternary)",
        paddingInlineStart: "8px",
        maxHeight: "72px",
        overflowY: "auto",
        userSelect: "text",
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
    const readerWidth = useAppSelector(s => s.reading.readerWidth || "standard")
    const lineHeight = useAppSelector(s => s.reading.lineHeight || 1.82)
    const settingsDisplayed = useAppSelector(s => s.app.settings.display)

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
    const [findOpen, setFindOpen] = useState(false)
    const [findFocusTick, setFindFocusTick] = useState(0)
    const webviewModalOpenRef = useRef(false)

    // Floating Selection AI Translation state
    const [selectionTrans, setSelectionTrans] = useState<{
        sourceText: string
        translated: string
        busy: boolean
        error: string
        copied: boolean
        targetPoint: { left: number; top: number }
    } | null>(null)

    useEffect(() => {
        return window.settings.addThemeUpdateListener(dark =>
            setIsDarkMode(dark)
        )
    }, [])

    useEffect(() => {
        setNotesOpen(false)
        setSelectionTrans(null)
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
        forceFullText,
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

    // Handle right-click "摘录到文章备注" & "AI 翻译选中段落"
    useEffect(() => {
        const onQuoteToNote = (e: Event) => {
            const custom = e as CustomEvent<{ text?: string }>
            const text = custom.detail?.text?.trim()
            if (!text) return
            setNotesOpen(true)
            void notesState.appendQuote(text)
        }
        const onTranslateSelection = (e: Event) => {
            const custom = e as CustomEvent<{
                text?: string
                position?: [number, number]
            }>
            const text = custom.detail?.text?.trim()
            if (!text) return
            const pos = custom.detail?.position
            const targetPoint = pos
                ? { left: pos[0], top: pos[1] }
                : {
                      left: Math.round(window.innerWidth / 2),
                      top: Math.round(window.innerHeight / 3),
                  }
            setSelectionTrans({
                sourceText: text,
                translated: "",
                busy: true,
                error: "",
                copied: false,
                targetPoint,
            })
            void window.personal
                .aiTranslateSelection(text)
                .then(res => {
                    setSelectionTrans(prev =>
                        prev && prev.sourceText === text
                            ? { ...prev, translated: res, busy: false }
                            : prev
                    )
                })
                .catch(err => {
                    setSelectionTrans(prev =>
                        prev && prev.sourceText === text
                            ? { ...prev, error: String(err), busy: false }
                            : prev
                    )
                })
        }
        const onOpenNotes = (e: Event) => {
            const custom = e as CustomEvent<{ id?: number }>
            if (!custom.detail?.id || custom.detail.id === itemId) {
                setNotesOpen(true)
            }
        }
        window.addEventListener("quote-to-article-note", onQuoteToNote)
        window.addEventListener("ai-translate-selection", onTranslateSelection)
        window.addEventListener("open-article-notes", onOpenNotes)
        return () => {
            window.removeEventListener("quote-to-article-note", onQuoteToNote)
            window.removeEventListener(
                "ai-translate-selection",
                onTranslateSelection
            )
            window.removeEventListener("open-article-notes", onOpenNotes)
        }
    }, [notesState, itemId])

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

    const openFind = useCallback(() => {
        setFindOpen(true)
        setFindFocusTick(n => n + 1)
    }, [])

    const closeFind = useCallback(() => {
        setFindOpen(false)
        requestAnimationFrame(() =>
            articleRef.current?.focus({
                preventScroll: true,
            })
        )
    }, [articleRef])

    const toggleFind = useCallback(() => {
        setFindOpen(prev => {
            const next = !prev
            if (next) setFindFocusTick(n => n + 1)
            else {
                requestAnimationFrame(() =>
                    articleRef.current?.focus({
                        preventScroll: true,
                    })
                )
            }
            return next
        })
    }, [articleRef])

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

    const updateFontSize = useCallback((size: number) => {
        const clamped = Math.max(12, Math.min(28, Math.round(size)))
        window.settings.setFontSize(clamped)
        setFontSize(clamped)
    }, [])

    const adjustFontSize = useCallback((deltaOrReset: -1 | 0 | 1) => {
        setFontSize(prev => {
            const next =
                deltaOrReset === 0
                    ? 16
                    : Math.max(12, Math.min(28, prev + deltaOrReset))
            window.settings.setFontSize(next)
            return next
        })
    }, [])

    const updateFont = useCallback((font: string) => {
        window.settings.setFont(font)
        setFontFamily(font)
    }, [])

    const updateReaderWidth = useCallback(
        (mode: ReaderWidthMode) => {
            void dispatch(saveReadingPreferences({ readerWidth: mode }))
        },
        [dispatch]
    )

    const updateLineHeight = useCallback(
        (lh: number) => {
            void dispatch(saveReadingPreferences({ lineHeight: lh }))
        },
        [dispatch]
    )

    const openSiteRules = useCallback(() => {
        if (!item?.link) return
        if (!settingsDisplayed) {
            dispatch(toggleSettings())
        }
        setTimeout(() => {
            window.dispatchEvent(
                new CustomEvent("open-personal-section", {
                    detail: { section: "siteRules", url: item.link },
                })
            )
        }, 80)
    }, [dispatch, item?.link, settingsDisplayed])

    const { handleNavigationKey, scrollReaderByPage } = useArticleShortcuts({
        item,
        articleRef,
        webview,
        webviewModalOpenRef,
        loadWebpage,
        canFetchFull,
        findOpen,
        notesOpen,
        aiOpen: Boolean(aiController.kind),
        onOpenFind: openFind,
        onCloseFind: closeFind,
        closeNotes,
        closeAI,
        toggleWebpage,
        toggleFull,
        onToggleHidden: handleToggleHidden,
        onToggleNotes: toggleNotes,
        onAdjustFontSize: adjustFontSize,
    })

    if (!item) return null

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
        canFetchFull,
        loadFull,
        loadWebpage,
        fontFamily,
        fontSize,
        onRefetchFull: forceFullText,
        onToggleHidden: handleToggleHidden,
        onUpdateFont: updateFont,
        onUpdateFontSize: updateFontSize,
        onUpdateDirection: updateTextDirection,
        onDeleteOffline: () => {
            void dispatch(deleteOffline(item._id))
        },
        onOpenSiteRules: openSiteRules,
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
                findOpen={findOpen}
                fontSize={fontSize}
                fontFamily={fontFamily}
                readerWidth={readerWidth}
                lineHeight={lineHeight}
                aiController={aiController}
                moreMenuProps={moreMenuProps}
                onToggleNotes={toggleNotes}
                onToggleFull={toggleFull}
                onToggleWebpage={toggleWebpage}
                onToggleFind={toggleFind}
                onUpdateFontSize={updateFontSize}
                onUpdateFont={updateFont}
                onUpdateReaderWidth={updateReaderWidth}
                onUpdateLineHeight={updateLineHeight}
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
                savedOffline={savedOffline}
                loaded={loaded}
                webview={webview}
                webviewModalOpenRef={webviewModalOpenRef}
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
                readerWidth={readerWidth}
                lineHeight={lineHeight}
                findOpen={findOpen}
                findFocusTick={findFocusTick}
                onCloseFind={closeFind}
                error={error}
                onLocalReady={markLocalReady}
                onReload={reload}
                onSwitchWebpage={toggleWebpage}
            />

            {selectionTrans && (
                <Callout
                    target={selectionTrans.targetPoint}
                    isBeakVisible={false}
                    gapSpace={8}
                    directionalHint={DirectionalHint.bottomLeftEdge}
                    setInitialFocus
                    onDismiss={() => setSelectionTrans(null)}>
                    <div
                        className={classes.selectionCallout}
                        role="dialog"
                        aria-label="选中段落翻译">
                        <div className={classes.selectionHeader}>
                            <strong>AI 翻译选中段落</strong>
                            <span className={classes.selectionActions}>
                                {selectionTrans.translated && (
                                    <DefaultButton
                                        onClick={() => {
                                            window.utils.writeClipboard(
                                                selectionTrans.translated
                                            )
                                            setSelectionTrans(prev =>
                                                prev
                                                    ? { ...prev, copied: true }
                                                    : prev
                                            )
                                            setTimeout(() => {
                                                setSelectionTrans(prev =>
                                                    prev
                                                        ? {
                                                              ...prev,
                                                              copied: false,
                                                          }
                                                        : prev
                                                )
                                            }, 1800)
                                        }}>
                                        {selectionTrans.copied
                                            ? "已复制"
                                            : "复制"}
                                    </DefaultButton>
                                )}
                                <DefaultButton
                                    onClick={() => setSelectionTrans(null)}>
                                    {intl.get("close")}
                                </DefaultButton>
                            </span>
                        </div>
                        <div className={classes.selectionSource}>
                            {selectionTrans.sourceText}
                        </div>
                        {selectionTrans.busy && (
                            <Spinner
                                size={SpinnerSize.small}
                                label="正在翻译选中内容…"
                                labelPosition="right"
                            />
                        )}
                        {selectionTrans.error && (
                            <MessageBar messageBarType={MessageBarType.error}>
                                {selectionTrans.error}
                            </MessageBar>
                        )}
                        {selectionTrans.translated && (
                            <AIMarkdown text={selectionTrans.translated} />
                        )}
                    </div>
                </Callout>
            )}
        </FocusZone>
    )
}

export default Article
