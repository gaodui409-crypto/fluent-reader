import { useCallback, useEffect, useLayoutEffect } from "react"
import * as React from "react"
import { RSSItem, itemShortcuts, markRead } from "../../scripts/models/item"
import { useAppDispatch } from "../../scripts/reducer"
import { dismissItem, showOffsetItem } from "../../scripts/models/page"
import {
    closeContextMenu,
    openImageMenu,
    openTextMenu,
} from "../../scripts/models/app"

export function hasOpenOverlayModal(): boolean {
    return Array.from(
        document.querySelectorAll<HTMLElement>(
            ".ms-Dialog-main, .ms-Modal-scrollableContent, .fui-DialogSurface, .ms-ContextualMenu, .ms-Dropdown-callout, .ms-ComboBox-callout, .ms-DatePicker-callout, [role='log-menu'], .fui-MenuPopover, .fui-Listbox"
        )
    ).some(
        el =>
            el.getClientRects().length > 0 &&
            getComputedStyle(el).visibility !== "hidden"
    )
}

function isEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
    )
}

const syntheticWebviewEvents = new WeakSet<KeyboardEvent>()

export function useArticleShortcuts(opts: {
    item: RSSItem | undefined
    articleRef: React.RefObject<HTMLElement>
    webview: React.RefObject<Electron.WebviewTag>
    loadWebpage: boolean
    canFetchFull: boolean
    notesOpen: boolean
    aiOpen: boolean
    closeNotes: () => void
    closeAI: () => void
    toggleWebpage: () => void
    toggleFull: () => void
    onToggleHidden: () => void
    onToggleNotes: () => void
}) {
    const {
        item,
        articleRef,
        webview,
        loadWebpage,
        canFetchFull,
        notesOpen,
        aiOpen,
        closeNotes,
        closeAI,
        toggleWebpage,
        toggleFull,
        onToggleHidden,
        onToggleNotes,
    } = opts
    const dispatch = useAppDispatch()

    const focusReader = useCallback(() => {
        requestAnimationFrame(() => {
            articleRef.current?.focus({ preventScroll: true })
        })
    }, [articleRef])

    const scrollReaderByPage = useCallback(
        (reverse: boolean) => {
            const ratio = reverse ? -0.82 : 0.82
            const expandedPanel = document.querySelector<HTMLElement>(
                "[data-ai-expanded='true']"
            )
            if (expandedPanel) {
                expandedPanel.scrollBy({
                    top: expandedPanel.clientHeight * ratio,
                    behavior: "smooth",
                })
                return
            }
            const node = webview.current
            if (!node) return
            if (loadWebpage) {
                void node
                    .executeJavaScript(
                        `window.scrollBy({ top: window.innerHeight * ${ratio}, behavior: "smooth" })`
                    )
                    .catch(() => {})
            } else {
                void node
                    .executeJavaScript(
                        `window.__scrollArticleBy && window.__scrollArticleBy(${ratio})`
                    )
                    .catch(() => {})
            }
        },
        [webview, loadWebpage]
    )

    const handleNavigationKey = useCallback(
        (
            key: string,
            modifiers?: { ctrl?: boolean; alt?: boolean; meta?: boolean }
        ) => {
            if (modifiers?.ctrl || modifiers?.alt || modifiers?.meta)
                return false
            if (hasOpenOverlayModal()) return false
            if (key === "Escape") {
                if (notesOpen) {
                    closeNotes()
                    focusReader()
                    return true
                }
                if (aiOpen) {
                    closeAI()
                    focusReader()
                    return true
                }
                dispatch(dismissItem())
                return true
            }
            if (key === "ArrowLeft" || key === "k" || key === "K") {
                void dispatch(showOffsetItem(-1))
                return true
            }
            if (key === "ArrowRight" || key === "j" || key === "J") {
                void dispatch(showOffsetItem(1))
                return true
            }
            return false
        },
        [dispatch, notesOpen, aiOpen, closeNotes, closeAI, focusReader]
    )

    useEffect(() => {
        return window.utils.addWebviewContextListener((pos, text, url) => {
            if (!pos) dispatch(closeContextMenu())
            else if (text || url) dispatch(openTextMenu(pos, text, url))
            else dispatch(openImageMenu(pos))
        })
    }, [dispatch])

    useLayoutEffect(() => {
        if (!item) return
        return window.utils.addWebviewKeydownListener(input => {
            if (input.type !== "keyDown") return
            if (hasOpenOverlayModal()) return
            const hasMod = Boolean(input.control || input.alt || input.meta)
            if (!hasMod && input.key === " ") {
                scrollReaderByPage(Boolean(input.shift))
                return
            }
            if (
                handleNavigationKey(input.key, {
                    ctrl: input.control,
                    alt: input.alt,
                    meta: input.meta,
                })
            )
                return

            if (!hasMod) {
                switch (input.key) {
                    case "l":
                    case "L":
                        toggleWebpage()
                        return
                    case "w":
                    case "W":
                        if (canFetchFull) toggleFull()
                        return
                    case "h":
                    case "H":
                        onToggleHidden()
                        return
                    case "n":
                    case "N":
                        onToggleNotes()
                        return
                    case "o":
                    case "O":
                        if (!item.hasRead) dispatch(markRead(item))
                        void window.personal
                            .opened?.(item._id)
                            .catch(console.error)
                        window.utils.openExternal(item.link, false)
                        return
                }
            }

            const event = new KeyboardEvent("keydown", {
                code: input.code,
                key: input.key,
                shiftKey: input.shift,
                altKey: input.alt,
                ctrlKey: input.control,
                metaKey: input.meta,
                repeat: input.isAutoRepeat,
                bubbles: true,
            })
            syntheticWebviewEvents.add(event)
            dispatch(itemShortcuts(item, event))
            document.dispatchEvent(event)
        })
    }, [
        dispatch,
        item,
        toggleWebpage,
        toggleFull,
        canFetchFull,
        onToggleHidden,
        onToggleNotes,
        handleNavigationKey,
        scrollReaderByPage,
    ])

    // Document-level reader shortcuts so J/K, Space, N, W, L, M, S, R, O, B, Escape
    // keep working in 3-column ListView and when focus sits on toolbar/cards.
    useEffect(() => {
        if (!item) return
        const onDocKeyDown = (e: KeyboardEvent) => {
            if (syntheticWebviewEvents.has(e) || e.defaultPrevented) return
            if (hasOpenOverlayModal()) return
            if (document.querySelector(".settings-container")) return

            const target = e.target as HTMLElement | null
            if (isEditableElement(target)) {
                if (
                    e.key === "Escape" &&
                    !e.ctrlKey &&
                    !e.altKey &&
                    !e.metaKey &&
                    target?.closest("[data-reader-drawer]")
                ) {
                    if (handleNavigationKey("Escape")) {
                        e.preventDefault()
                        e.stopPropagation()
                    }
                }
                return
            }

            const hasMod = Boolean(e.ctrlKey || e.altKey || e.metaKey)
            const inCard = Boolean(target?.closest(".card"))
            const inTreeOrToolbar = Boolean(
                target?.closest("[role='tree'], .actions")
            )

            if (e.key === "Escape" && !hasMod) {
                if (handleNavigationKey("Escape")) {
                    e.preventDefault()
                    e.stopPropagation()
                }
                return
            }

            if (
                !hasMod &&
                (e.key === "j" ||
                    e.key === "J" ||
                    e.key === "k" ||
                    e.key === "K" ||
                    (!inTreeOrToolbar &&
                        (e.key === "ArrowLeft" || e.key === "ArrowRight")))
            ) {
                if (handleNavigationKey(e.key)) {
                    e.preventDefault()
                    e.stopPropagation()
                }
                return
            }

            if (!hasMod) {
                switch (e.key) {
                    case " ":
                        if (
                            !inCard &&
                            !target?.closest(
                                "button, [role='button'], [role='treeitem'], [role='combobox'], a"
                            )
                        ) {
                            e.preventDefault()
                            scrollReaderByPage(e.shiftKey)
                        }
                        return
                    case "l":
                    case "L":
                        e.preventDefault()
                        toggleWebpage()
                        return
                    case "w":
                    case "W":
                        if (canFetchFull) {
                            e.preventDefault()
                            toggleFull()
                        }
                        return
                    case "n":
                    case "N":
                        e.preventDefault()
                        onToggleNotes()
                        return
                }
            }

            // Cards already handle M/S/R/H/O/B for their own item when focused.
            if (inCard) return

            if (!hasMod && (e.key === "h" || e.key === "H")) {
                e.preventDefault()
                onToggleHidden()
                return
            }
            if (!hasMod && (e.key === "o" || e.key === "O")) {
                e.preventDefault()
                if (!item.hasRead) dispatch(markRead(item))
                void window.personal.opened?.(item._id).catch(console.error)
                window.utils.openExternal(item.link, false)
                return
            }
            dispatch(itemShortcuts(item, e))
        }
        document.addEventListener("keydown", onDocKeyDown)
        return () => document.removeEventListener("keydown", onDocKeyDown)
    }, [
        dispatch,
        item,
        canFetchFull,
        toggleWebpage,
        toggleFull,
        onToggleHidden,
        onToggleNotes,
        handleNavigationKey,
        scrollReaderByPage,
    ])

    return { handleNavigationKey, scrollReaderByPage, focusReader }
}
