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
    requestedTarget = openTarget
) {
    return {
        itemId,
        openTarget: requestedTarget,
        mode:
            openTarget === SourceOpenTarget.External
                ? SourceOpenTarget.Local
                : openTarget,
        fullContent: "",
        loaded: false,
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
    const [view, setView] = useState(() => initialView(itemId, openTarget))
    const articleRef = useRef<HTMLElement>(null)
    const webview = useRef<Electron.WebviewTag>(null)
    const refocusItemId = useRef(itemId)

    // Reset before committing a new article so it never mounts the previous mode
    // or displays full content fetched for the previous article.
    if (view.itemId !== itemId || view.openTarget !== openTarget)
        setView(initialView(itemId, openTarget))

    const loadWebpage = view.mode === SourceOpenTarget.Webpage
    const loadFull = view.mode === SourceOpenTarget.FullContent
    const showWebview = !loadFull || !!view.fullContent

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

        const onLoaded = () => setView(view => ({ ...view, loaded: true }))
        node.addEventListener("did-stop-loading", onLoaded)
        setView(view => ({ ...view, loaded: false, error: "" }))
        // Focus only a newly mounted guest. Read/star and toolbar updates must
        // leave the user's current focus and scroll position alone.
        node.focus()
        const card = articleCard(itemId)
        // Chromium supports this without scrolling an already visible card.
        // @ts-ignore
        card?.scrollIntoViewIfNeeded()

        return () => {
            node.removeEventListener("did-stop-loading", onLoaded)
        }
    }, [itemId, view.mode, showWebview])

    useEffect(() => {
        return window.utils.addWebviewErrorListener(reason => {
            setView(view => ({ ...view, error: reason }))
        })
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
                    setView(view => ({ ...view, fullContent: html }))
            } catch (error) {
                if (!controller.signal.aborted)
                    setView(view => ({
                        ...view,
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
            setView(view => {
                if (view.mode === mode)
                    return initialView(
                        itemId,
                        SourceOpenTarget.Local,
                        openTarget
                    )
                if (
                    item.link.startsWith("https://") ||
                    item.link.startsWith("http://")
                )
                    return initialView(itemId, mode, openTarget)
                return view
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
    const reload = () => {
        if (loadFull) {
            setView(view => ({
                ...view,
                fullContent: "",
                loaded: false,
                error: "",
                reloadCount: view.reloadCount + 1,
            }))
        } else if (webview.current) {
            setView(view => ({ ...view, loaded: false, error: "" }))
            webview.current.reload()
        }
    }

    return {
        articleRef,
        webview,
        webviewKey: `${itemId}_${view.mode}`,
        showWebview,
        loadWebpage,
        loadFull,
        fullContent: view.fullContent,
        loaded: view.loaded,
        error: view.error,
        toggleWebpage,
        toggleFull,
        reload,
    }
}
