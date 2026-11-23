import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react"
import { RSSItem } from "../../../scripts/models/item"
import { SourceOpenTarget } from "../../../scripts/models/source"

function initialView(
    itemId: number,
    openTarget: SourceOpenTarget,
    requestedTarget = openTarget,
    localReady = false
) {
    const mode =
        openTarget === SourceOpenTarget.External
            ? SourceOpenTarget.Local
            : openTarget
    return {
        itemId,
        openTarget: requestedTarget,
        mode,
        fullContent: "",
        loaded: mode === SourceOpenTarget.Local && localReady,
        error: "",
        reloadCount: 0,
    }
}

function articleCard(itemId: number) {
    return document.querySelector<HTMLElement>(
        `#refocus div[data-iid="${itemId}"]`
    )
}

export function useArticleView(
    item: RSSItem,
    openTarget: SourceOpenTarget,
    collection?: string
) {
    const itemId = item._id
    const localReadyRef = useRef(false)
    const [view, setView] = useState(() => initialView(itemId, openTarget))
    const articleRef = useRef<HTMLElement>(null)
    const webview = useRef<Electron.WebviewTag>(null)
    const refocusItemId = useRef(itemId)

    // Reset before committing a new article so it never mounts the previous mode
    // or displays full content fetched for the previous article.
    if (view.itemId !== itemId || view.openTarget !== openTarget) {
        setView(
            initialView(itemId, openTarget, openTarget, localReadyRef.current)
        )
    }

    const loadWebpage = view.mode === SourceOpenTarget.Webpage
    const loadFull = view.mode === SourceOpenTarget.FullContent
    const showWebview = true
    const webviewKey = loadWebpage ? `web_${itemId}` : "local_reader"

    useLayoutEffect(() => {
        if (loadWebpage) localReadyRef.current = false
    }, [loadWebpage])

    useLayoutEffect(() => {
        // Keep the close handler's target current even during a synchronous unmount.
        refocusItemId.current = itemId
    }, [itemId])

    useEffect(() => {
        // React suppresses focus events during layout cleanup. Restore after the
        // commit so FocusZone also tracks the card for the next arrow key.
        return () => articleCard(refocusItemId.current)?.focus()
    }, [])

    useLayoutEffect(() => {
        const node = webview.current
        if (!node) {
            articleRef.current?.focus({ preventScroll: true })
            return
        }

        const onLoaded = () => {
            if (!loadFull) setView(v => ({ ...v, loaded: true }))
        }
        const onFailLoad = (event: Electron.DidFailLoadEvent) => {
            if (event.isMainFrame && event.errorCode !== -3) {
                setView(v => ({
                    ...v,
                    loaded: true,
                    error: event.errorDescription,
                }))
            }
        }
        node.addEventListener("did-stop-loading", onLoaded)
        node.addEventListener("did-fail-load", onFailLoad)
        setView(v => ({
            ...v,
            loaded:
                v.mode === SourceOpenTarget.Local && localReadyRef.current
                    ? true
                    : v.mode === SourceOpenTarget.FullContent
                    ? Boolean(v.fullContent)
                    : false,
            error: "",
        }))
        // Focus the reader container when opening an article/mode so keyboard
        // shortcuts (Space, J/K, Escape, N, W, L) work immediately.
        articleRef.current?.focus({ preventScroll: true })
        const card = articleCard(itemId)
        // Chromium supports this without scrolling an already visible card.
        // @ts-ignore
        card?.scrollIntoViewIfNeeded()

        return () => {
            node.removeEventListener("did-stop-loading", onLoaded)
            node.removeEventListener("did-fail-load", onFailLoad)
        }
    }, [itemId, view.mode, showWebview, loadFull])

    const markLocalReady = useCallback(() => {
        localReadyRef.current = true
        setView(v =>
            v.mode === SourceOpenTarget.Local && !v.loaded
                ? { ...v, loaded: true }
                : v
        )
    }, [])

    useEffect(() => {
        if (!loadFull) return
        const controller = new AbortController()

        const loadContent = async () => {
            try {
                const result = await window.personal.fullText(
                    itemId,
                    view.reloadCount > 0,
                    undefined,
                    collection
                )
                const html = result.html
                if (!controller.signal.aborted)
                    setView(v => ({ ...v, fullContent: html, loaded: true }))
            } catch (error) {
                if (!controller.signal.aborted)
                    setView(v => ({
                        ...v,
                        loaded: true,
                        error: String(error),
                    }))
            }
        }
        loadContent()

        // A mode switch, navigation, retry or close retires this request.
        return () => controller.abort()
    }, [itemId, item.link, loadFull, view.reloadCount, collection, openTarget])

    const toggleMode = useCallback(
        (mode: SourceOpenTarget) => {
            setView(v => {
                if (v.mode === mode)
                    return initialView(
                        itemId,
                        SourceOpenTarget.Local,
                        openTarget,
                        localReadyRef.current
                    )
                if (
                    item.link.startsWith("https://") ||
                    item.link.startsWith("http://")
                )
                    return initialView(
                        itemId,
                        mode,
                        openTarget,
                        localReadyRef.current
                    )
                return v
            })
        },
        [itemId, item.link, openTarget]
    )

    const toggleWebpage = useCallback(
        () => toggleMode(SourceOpenTarget.Webpage),
        [toggleMode]
    )
    const toggleFull = useCallback(
        () => toggleMode(SourceOpenTarget.FullContent),
        [toggleMode]
    )

    const forceFullText = useCallback(() => {
        if (
            !item.link.startsWith("https://") &&
            !item.link.startsWith("http://")
        )
            return
        setView(v => ({
            ...v,
            mode: SourceOpenTarget.FullContent,
            fullContent: "",
            loaded: false,
            error: "",
            reloadCount: v.reloadCount + 1,
        }))
    }, [item.link])

    const reload = () => {
        if (loadFull) {
            setView(v => ({
                ...v,
                fullContent: "",
                loaded: false,
                error: "",
                reloadCount: v.reloadCount + 1,
            }))
        } else if (webview.current) {
            if (!loadWebpage) localReadyRef.current = false
            setView(v => ({ ...v, loaded: false, error: "" }))
            webview.current.reload()
        }
    }

    return {
        articleRef,
        webview,
        webviewKey,
        showWebview,
        loadWebpage,
        loadFull,
        fullContent: view.fullContent,
        loaded: view.loaded,
        error: view.error,
        markLocalReady,
        toggleWebpage,
        toggleFull,
        forceFullText,
        reload,
    }
}
