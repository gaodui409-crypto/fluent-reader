import * as React from "react"
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react"
import intl from "react-intl-universal"
import {
    DefaultButton,
    Icon,
    IconButton,
    PrimaryButton,
    Spinner,
    SpinnerSize,
    Stack,
} from "@fluentui/react"
import { makeStyles, mergeClasses, shorthands } from "@griffel/react"
import { RSSItem } from "../../scripts/models/item"
import { RSSSource } from "../../scripts/models/source"
import { ReaderWidthMode } from "../../reading-preferences"
import { ForumFloor } from "../../personal-types"

const useStyles = makeStyles({
    surfaceWrap: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        flexGrow: 1,
        minHeight: 0,
        overflow: "hidden",
    },
    surfaceWrapCollapsed: {
        flexGrow: 0,
        height: 0,
        minHeight: 0,
        overflow: "visible",
    },
    content: {
        display: "flex",
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        flexGrow: 1,
        minHeight: 0,
        ...shorthands.borderStyle("none"),
        color: "var(--black)",
    },
    hidden: { display: "none" },
    loadingBanner: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 14px",
        fontSize: "12px",
        color: "var(--neutralSecondary)",
        backgroundColor: "var(--neutralLighterAlt)",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        flexShrink: 0,
    },
    findBar: {
        position: "fixed",
        top: "84px",
        right: "20px",
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 8px",
        borderRadius: "8px",
        backgroundColor: "var(--white)",
        border: "1px solid var(--neutralQuaternary)",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.16)",
    },
    findInput: {
        width: "176px",
        border: "none",
        outline: "none",
        backgroundColor: "transparent",
        color: "var(--black)",
        fontSize: "13px",
        padding: "4px 4px",
    },
    findCount: {
        fontSize: "11.5px",
        color: "var(--neutralSecondary)",
        minWidth: "40px",
        textAlign: "right",
        paddingInlineEnd: "4px",
        fontVariantNumeric: "tabular-nums",
        userSelect: "none",
    },
    hoverUrlPill: {
        position: "absolute",
        left: "10px",
        bottom: "8px",
        zIndex: 12,
        maxWidth: "min(72%, 560px)",
        padding: "3px 8px",
        borderRadius: "4px",
        fontSize: "11.5px",
        lineHeight: 1.35,
        backgroundColor: "var(--neutralLighter)",
        color: "var(--neutralPrimary)",
        border: "1px solid var(--neutralQuaternaryAlt)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
    },
    repliesBar: {
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        padding: "6px 14px",
        borderTop: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
        fontSize: "12.5px",
    },
    repliesError: {
        color: "var(--colorPaletteRedForeground1, #d13438)",
        fontSize: "12px",
    },
    errorWrap: {
        padding: "24px",
        textAlign: "center",
    },
    errorIcon: {
        fontSize: "32px",
        color: "var(--neutralSecondary)",
    },
    errorCode: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
        maxWidth: "520px",
        lineHeight: "1.6",
        userSelect: "text",
    },
    errorActions: {
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        justifyContent: "center",
    },
})

function safeJsLiteral(value: unknown): string {
    return JSON.stringify(value)
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029")
}

function clearPanelHighlights() {
    const cssAny = CSS as unknown as {
        highlights?: Map<string, unknown>
    }
    cssAny.highlights?.delete("reader-find")
    cssAny.highlights?.delete("reader-find-active")
}

function findRangesInElement(root: HTMLElement, query: string): Range[] {
    const needle = query.toLocaleLowerCase()
    if (!needle) return []
    const ranges: Range[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
        const text = node.nodeValue || ""
        const lower = text.toLocaleLowerCase()
        let from = 0
        while (from <= lower.length - needle.length) {
            const idx = lower.indexOf(needle, from)
            if (idx < 0) break
            const r = document.createRange()
            r.setStart(node, idx)
            r.setEnd(node, idx + needle.length)
            ranges.push(r)
            from = idx + Math.max(1, needle.length)
        }
    }
    return ranges
}

function applyPanelHighlights(ranges: Range[], activeIndex: number) {
    const winAny = window as unknown as {
        Highlight?: new (...r: Range[]) => unknown
    }
    const cssAny = CSS as unknown as {
        highlights?: Map<string, unknown>
    }
    if (!cssAny.highlights || !winAny.Highlight) return
    if (ranges.length === 0) {
        clearPanelHighlights()
        return
    }
    cssAny.highlights.set("reader-find", new winAny.Highlight(...ranges))
    const active = ranges[activeIndex]
    if (active) {
        cssAny.highlights.set(
            "reader-find-active",
            new winAny.Highlight(active)
        )
        const el = active.startContainer.parentElement
        el?.scrollIntoView({ block: "center", behavior: "smooth" })
    }
}

export const ArticleReaderSurface: React.FC<{
    item: RSSItem
    source: RSSSource
    locale: string
    dark: boolean
    savedOffline: boolean
    loaded: boolean
    webview: React.RefObject<Electron.WebviewTag>
    webviewModalOpenRef: React.MutableRefObject<boolean>
    webviewKey: string
    showWebview: boolean
    hiddenByExpandedPanel?: boolean
    loadWebpage: boolean
    loadFull: boolean
    fullContent: string
    fontFamily: string
    fontSize: number
    readerWidth: ReaderWidthMode
    lineHeight: number
    findOpen: boolean
    findFocusTick: number
    onCloseFind: () => void
    error: string
    onLocalReady?: () => void
    onReload: () => void
    onSwitchWebpage: () => void
}> = ({
    item,
    source,
    locale,
    dark,
    savedOffline,
    loaded,
    webview,
    webviewModalOpenRef,
    webviewKey,
    showWebview,
    hiddenByExpandedPanel,
    loadWebpage,
    loadFull,
    fullContent,
    fontFamily,
    fontSize,
    readerWidth,
    lineHeight,
    findOpen,
    findFocusTick,
    onCloseFind,
    error,
    onLocalReady,
    onReload,
    onSwitchWebpage,
}) => {
    const classes = useStyles()
    const domReadyRef = useRef(false)
    const findInputRef = useRef<HTMLInputElement>(null)

    const [findQuery, setFindQuery] = useState("")
    const [matchInfo, setMatchInfo] = useState({ active: 0, total: 0 })
    const panelRangesRef = useRef<Range[]>([])
    const [hoverUrl, setHoverUrl] = useState("")

    const [repliesLoading, setRepliesLoading] = useState(false)
    const [repliesFloors, setRepliesFloors] = useState<ForumFloor[] | null>(
        null
    )
    const [repliesError, setRepliesError] = useState("")
    const repliesFloorsRef = useRef<ForumFloor[] | null>(null)
    repliesFloorsRef.current = repliesFloors

    const isLinuxDoTopic =
        /^https:\/\/linux\.do\/t\//i.test(item.link) && !loadWebpage

    const dateText = item.date.toLocaleString(locale, {
        hour12: !locale.startsWith("zh"),
    })
    const articleHtml = loadFull ? fullContent || item.content : item.content

    const renderEpochRef = useRef(0)
    const prevRenderKeyRef = useRef("")
    const renderKey = `${item._id}|${Number(loadWebpage)}|${Number(loadFull)}|${
        articleHtml?.length ?? 0
    }`
    if (prevRenderKeyRef.current !== renderKey) {
        prevRenderKeyRef.current = renderKey
        renderEpochRef.current += 1
    }

    const latestPayloadRef = useRef({
        title: item.title,
        dateText,
        html: articleHtml,
        url: item.link,
        fontSize,
        fontFamily,
        readerWidth,
        lineHeight,
        dir: source.textDir,
        locale,
        dark,
        epoch: renderEpochRef.current,
    })
    latestPayloadRef.current = {
        title: item.title,
        dateText,
        html: articleHtml,
        url: item.link,
        fontSize,
        fontFamily,
        readerWidth,
        lineHeight,
        dir: source.textDir,
        locale,
        dark,
        epoch: renderEpochRef.current,
    }

    const mountArticleInWebview = useCallback((node: Electron.WebviewTag) => {
        const payload = latestPayloadRef.current
        const floors = repliesFloorsRef.current
        const script = floors
            ? `window.__renderArticle && window.__renderArticle(${safeJsLiteral(
                  payload
              )}); window.__appendReplies && window.__appendReplies(${safeJsLiteral(
                  floors
              )}, ${payload.epoch})`
            : `window.__renderArticle && window.__renderArticle(${safeJsLiteral(
                  payload
              )})`
        void node.executeJavaScript(script).catch(console.error)
    }, [])

    // Ensure CSS ::highlight styles exist once in document for expanded AI panel search
    useEffect(() => {
        const id = "fr-reader-find-highlight-style"
        if (document.getElementById(id)) return
        const styleEl = document.createElement("style")
        styleEl.id = id
        styleEl.textContent =
            "::highlight(reader-find){background-color:rgba(255,213,0,0.38);color:inherit;}::highlight(reader-find-active){background-color:rgba(255,140,0,0.65);color:inherit;}"
        document.head.append(styleEl)
    }, [])

    // Reset transient reader state on article/mode change
    useEffect(() => {
        webviewModalOpenRef.current = false
        setHoverUrl("")
        try {
            webview.current?.stopFindInPage("clearSelection")
        } catch {}
        clearPanelHighlights()
        setMatchInfo({ active: 0, total: 0 })
    }, [item._id, loadWebpage, loadFull, webview, webviewModalOpenRef])

    // Only reset Linux.do replies when item or local/webpage mode changes (preserve across loadFull)
    useEffect(() => {
        setRepliesFloors(null)
        repliesFloorsRef.current = null
        setRepliesError("")
        setRepliesLoading(false)
    }, [item._id, loadWebpage])

    // Focus and select find input when opened or Ctrl+F pressed again
    useEffect(() => {
        if (!findOpen) {
            try {
                webview.current?.stopFindInPage("clearSelection")
            } catch {}
            clearPanelHighlights()
            setMatchInfo({ active: 0, total: 0 })
            return
        }
        requestAnimationFrame(() => {
            findInputRef.current?.focus()
            findInputRef.current?.select()
        })
    }, [findOpen, findFocusTick, webview])

    // Webview event listeners: dom-ready, update-target-url, found-in-page, page-title-updated
    useLayoutEffect(() => {
        domReadyRef.current = false
        const node = webview.current
        if (!node || !showWebview) return

        const onStartLoading = () => {
            domReadyRef.current = false
            webviewModalOpenRef.current = false
        }
        const onDomReady = () => {
            domReadyRef.current = true
            if (!loadWebpage) {
                onLocalReady?.()
                mountArticleInWebview(node)
            }
        }
        const onUpdateTargetUrl = (e: Event & { url?: string }) => {
            const raw = (e.url || "").trim()
            if (raw && !/^(?:file:|about:|javascript:)/i.test(raw)) {
                setHoverUrl(raw)
            } else {
                setHoverUrl("")
            }
        }
        const onFoundInPage = (
            e: Event & {
                result?: { activeMatchOrdinal: number; matches: number }
            }
        ) => {
            if (!e.result) return
            setMatchInfo({
                active: e.result.activeMatchOrdinal || 0,
                total: e.result.matches || 0,
            })
        }
        const onPageTitleUpdated = (e: Event & { title?: string }) => {
            webviewModalOpenRef.current = Boolean(
                e.title && e.title.includes("#lightbox")
            )
        }

        node.addEventListener("did-start-loading", onStartLoading)
        node.addEventListener("dom-ready", onDomReady)
        node.addEventListener(
            "update-target-url",
            onUpdateTargetUrl as EventListener
        )
        node.addEventListener("found-in-page", onFoundInPage as EventListener)
        node.addEventListener(
            "page-title-updated",
            onPageTitleUpdated as EventListener
        )
        return () => {
            node.removeEventListener("did-start-loading", onStartLoading)
            node.removeEventListener("dom-ready", onDomReady)
            node.removeEventListener(
                "update-target-url",
                onUpdateTargetUrl as EventListener
            )
            node.removeEventListener(
                "found-in-page",
                onFoundInPage as EventListener
            )
            node.removeEventListener(
                "page-title-updated",
                onPageTitleUpdated as EventListener
            )
        }
    }, [
        webview,
        webviewKey,
        loadWebpage,
        showWebview,
        onLocalReady,
        webviewModalOpenRef,
        mountArticleInWebview,
    ])

    useEffect(() => {
        const node = webview.current
        if (!node || loadWebpage || !showWebview || !domReadyRef.current) return
        mountArticleInWebview(node)
    }, [
        webview,
        loadWebpage,
        showWebview,
        item._id,
        item.title,
        item.link,
        dateText,
        articleHtml,
        locale,
        mountArticleInWebview,
    ])

    useEffect(() => {
        const node = webview.current
        if (!node || loadWebpage || !showWebview || !domReadyRef.current) return
        void node
            .executeJavaScript(
                `window.__updateArticleStyle && window.__updateArticleStyle(${safeJsLiteral(
                    {
                        fontSize,
                        fontFamily,
                        readerWidth,
                        lineHeight,
                        dir: source.textDir,
                        locale,
                        dark,
                    }
                )})`
            )
            .catch(console.error)
    }, [
        webview,
        loadWebpage,
        showWebview,
        fontSize,
        fontFamily,
        readerWidth,
        lineHeight,
        source.textDir,
        locale,
        dark,
    ])

    // Execute search whenever findQuery or target surface changes while findOpen
    useEffect(() => {
        if (!findOpen) return
        const q = findQuery.trim()
        if (!q) {
            try {
                webview.current?.stopFindInPage("clearSelection")
            } catch {}
            clearPanelHighlights()
            panelRangesRef.current = []
            setMatchInfo({ active: 0, total: 0 })
            return
        }

        if (hiddenByExpandedPanel) {
            try {
                webview.current?.stopFindInPage("clearSelection")
            } catch {}
            const panel = document.querySelector<HTMLElement>(
                "[data-ai-expanded='true']"
            )
            if (!panel) {
                panelRangesRef.current = []
                setMatchInfo({ active: 0, total: 0 })
                return
            }
            const ranges = findRangesInElement(panel, q)
            panelRangesRef.current = ranges
            const activeIdx = 0
            applyPanelHighlights(ranges, activeIdx)
            setMatchInfo({
                active: ranges.length > 0 ? 1 : 0,
                total: ranges.length,
            })
        } else {
            clearPanelHighlights()
            panelRangesRef.current = []
            const timer = setTimeout(() => {
                try {
                    webview.current?.findInPage(q, {
                        forward: true,
                        findNext: false,
                    })
                } catch {}
            }, 60)
            return () => clearTimeout(timer)
        }
    }, [
        findOpen,
        findQuery,
        hiddenByExpandedPanel,
        webview,
        item._id,
        loaded,
        loadFull,
        loadWebpage,
    ])

    const stepFind = useCallback(
        (forward: boolean) => {
            const q = findQuery.trim()
            if (!q) return
            if (hiddenByExpandedPanel) {
                const ranges = panelRangesRef.current
                if (!ranges.length) return
                setMatchInfo(prev => {
                    const curZero = Math.max(0, (prev.active || 1) - 1)
                    const nextZero =
                        (curZero + (forward ? 1 : -1) + ranges.length) %
                        ranges.length
                    applyPanelHighlights(ranges, nextZero)
                    return { active: nextZero + 1, total: ranges.length }
                })
            } else {
                try {
                    webview.current?.findInPage(q, {
                        forward,
                        findNext: true,
                    })
                } catch {}
            }
        },
        [findQuery, hiddenByExpandedPanel, webview]
    )

    const handleCloseFind = useCallback(() => {
        try {
            webview.current?.stopFindInPage("clearSelection")
        } catch {}
        clearPanelHighlights()
        onCloseFind()
    }, [onCloseFind, webview])

    const currentItemIdRef = useRef(item._id)
    currentItemIdRef.current = item._id
    const loadWebpageRef = useRef(loadWebpage)
    loadWebpageRef.current = loadWebpage

    const handleLoadReplies = async () => {
        const targetId = item._id
        setRepliesLoading(true)
        setRepliesError("")
        try {
            const floors = await window.personal.linuxDoReplies(item.link)
            if (currentItemIdRef.current !== targetId || loadWebpageRef.current)
                return
            setRepliesFloors(floors)
            repliesFloorsRef.current = floors
            if (webview.current && domReadyRef.current) {
                await webview.current.executeJavaScript(
                    `window.__appendReplies && window.__appendReplies(${safeJsLiteral(
                        floors
                    )}, ${renderEpochRef.current})`
                )
            }
        } catch (err) {
            if (currentItemIdRef.current === targetId) {
                setRepliesError(String(err))
            }
        } finally {
            if (currentItemIdRef.current === targetId) {
                setRepliesLoading(false)
            }
        }
    }

    return (
        <div
            className={mergeClasses(
                classes.surfaceWrap,
                hiddenByExpandedPanel && classes.surfaceWrapCollapsed
            )}>
            {findOpen && (
                <search
                    data-reader-find="true"
                    className={classes.findBar}
                    aria-label="页内查找">
                    <input
                        ref={findInputRef}
                        type="search"
                        className={classes.findInput}
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="none"
                        placeholder="页内查找…"
                        aria-label="在文章正文中查找"
                        value={findQuery}
                        onChange={e => setFindQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.nativeEvent.isComposing) return
                            if (e.key === "Enter") {
                                e.preventDefault()
                                stepFind(!e.shiftKey)
                            } else if (e.key === "Escape") {
                                e.preventDefault()
                                e.stopPropagation()
                                handleCloseFind()
                            }
                        }}
                    />
                    <span className={classes.findCount} aria-live="polite">
                        {findQuery.trim()
                            ? `${matchInfo.active} / ${matchInfo.total}`
                            : ""}
                    </span>
                    <IconButton
                        title="上一个匹配 (Shift+Enter)"
                        ariaLabel="上一个匹配"
                        disabled={!findQuery.trim() || matchInfo.total === 0}
                        iconProps={{ iconName: "ChevronUp" }}
                        onClick={() => stepFind(false)}
                    />
                    <IconButton
                        title="下一个匹配 (Enter)"
                        ariaLabel="下一个匹配"
                        disabled={!findQuery.trim() || matchInfo.total === 0}
                        iconProps={{ iconName: "ChevronDown" }}
                        onClick={() => stepFind(true)}
                    />
                    <IconButton
                        title="关闭查找 (Esc)"
                        ariaLabel="关闭查找"
                        iconProps={{ iconName: "Cancel" }}
                        onClick={handleCloseFind}
                    />
                </search>
            )}

            {loadFull && !loaded && !error && !hiddenByExpandedPanel && (
                <div className={classes.loadingBanner} role="status">
                    <Spinner size={SpinnerSize.xSmall} />
                    <span>正在提取全文…</span>
                </div>
            )}

            {showWebview && (
                <webview
                    id="article"
                    className={mergeClasses(
                        classes.content,
                        (error || hiddenByExpandedPanel) && classes.hidden
                    )}
                    ref={webview}
                    key={webviewKey}
                    src={loadWebpage ? item.link : "article/article.html"}
                    allowpopups={"true" as unknown as boolean}
                    webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes,disableDialogs,autoplayPolicy=document-user-activation-required"
                    partition={loadWebpage ? "persist:sandbox" : undefined}
                />
            )}

            {hoverUrl && !error && !hiddenByExpandedPanel && (
                <div className={classes.hoverUrlPill} aria-hidden="true">
                    {hoverUrl}
                </div>
            )}

            {isLinuxDoTopic && !error && !hiddenByExpandedPanel && (
                <div className={classes.repliesBar}>
                    <DefaultButton
                        disabled={repliesLoading}
                        iconProps={{
                            iconName: repliesLoading ? "Sync" : "CommentSolid",
                        }}
                        onClick={() => void handleLoadReplies()}>
                        {repliesLoading
                            ? "正在展开后续回复楼层…"
                            : repliesFloors !== null
                            ? `已展开 ${repliesFloors.length} 层后续回复（点击刷新）`
                            : "展开后续回复楼层"}
                    </DefaultButton>
                    {repliesError && (
                        <span className={classes.repliesError}>
                            {repliesError}
                        </span>
                    )}
                </div>
            )}

            {error && !hiddenByExpandedPanel && (
                <Stack
                    className={mergeClasses(
                        "error-prompt",
                        classes.content,
                        classes.errorWrap
                    )}
                    verticalAlign="center"
                    horizontalAlign="center"
                    tokens={{ childrenGap: 14 }}>
                    <Icon
                        iconName="DocumentError"
                        className={classes.errorIcon}
                    />
                    <strong>{intl.get("article.error")}</strong>
                    <span className={classes.errorCode}>{error}</span>
                    <div className={classes.errorActions}>
                        {savedOffline && (
                            <PrimaryButton
                                onClick={() =>
                                    void window.personal
                                        .openOffline(item._id)
                                        .catch(err =>
                                            window.utils.showErrorBox(
                                                intl.get("personal.failed"),
                                                String(err)
                                            )
                                        )
                                }>
                                打开本地离线网页
                            </PrimaryButton>
                        )}
                        <DefaultButton onClick={onReload}>
                            {intl.get("article.reload")}
                        </DefaultButton>
                        {!loadWebpage && (
                            <DefaultButton onClick={onSwitchWebpage}>
                                切换「加载网页」查看
                            </DefaultButton>
                        )}
                        <DefaultButton
                            onClick={() =>
                                window.utils.openExternal(item.link, false)
                            }>
                            {intl.get("openExternal")}
                        </DefaultButton>
                    </div>
                </Stack>
            )}
        </div>
    )
}
