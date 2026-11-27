import * as React from "react"
import { useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import {
    Dialog,
    DialogType,
    DefaultButton,
    SearchBox,
    MessageBar,
    MessageBarType,
    ProgressIndicator,
} from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import type { IndexProgress, SearchHit } from "../../personal-types"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { database, itemsTable } from "../../scripts/db"
import { eq } from "drizzle-orm"
import { RSSItem, markRead } from "../../scripts/models/item"
import { initFeedSuccess, RSSFeed } from "../../scripts/models/feed"
import { showItem } from "../../scripts/models/page"
import { exitSettings } from "../../scripts/models/app"

const useStyles = makeStyles({
    results: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxHeight: "56vh",
        overflowY: "auto",
        marginTop: "14px",
        paddingRight: "4px",
    },
    hit: {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        borderLeft: "3px solid transparent",
        borderRadius: "4px",
        padding: "6px 8px 10px",
    },
    hitActive: {
        borderLeft: "3px solid var(--themePrimary)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    title: {
        textAlign: "left",
        justifyContent: "flex-start",
        height: "auto",
        padding: "4px 6px",
        whiteSpace: "normal",
        fontWeight: 600,
    },
    sourceMeta: {
        color: "var(--neutralSecondary)",
        paddingLeft: "6px",
    },
    excerpt: {
        margin: 0,
        paddingLeft: "6px",
        lineHeight: "1.65",
        userSelect: "text",
        color: "var(--neutralPrimaryAlt)",
    },
    mark: {
        backgroundColor: "rgba(252, 225, 0, 0.35)",
        color: "inherit",
        borderRadius: "2px",
        padding: "0 2px",
    },
})

function formatHitDate(ts?: number): string {
    if (!ts || !Number.isFinite(ts)) return ""
    return new Date(ts).toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

function Highlight({
    text,
    query,
    markClass,
}: {
    text: string
    query: string
    markClass: string
}) {
    const words = query
        .trim()
        .split(/\s+/u)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
    if (!words.length) return <>{text}</>
    const regex = new RegExp(
        "(" +
            words
                .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join("|") +
            ")",
        "gi"
    )
    return (
        <>
            {text.split(regex).map((part, index) =>
                index % 2 ? (
                    <mark key={index} className={markClass}>
                        {part}
                    </mark>
                ) : (
                    part
                )
            )}
        </>
    )
}

export default function FullSearch() {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const settingsOpen = useAppSelector(s => s.app.settings.display)

    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [hits, setHits] = useState<SearchHit[]>([])
    const [activeIndex, setActiveIndex] = useState(-1)
    const [error, setError] = useState("")
    const [index, setIndex] = useState<IndexProgress>()
    const [busy, setBusy] = useState(false)
    const [more, setMore] = useState(false)
    const generation = useRef(0)
    const hitRefs = useRef<(HTMLDivElement | null)[]>([])

    useEffect(() => {
        const show = () => setOpen(true)
        const key = (event: KeyboardEvent) => {
            if (
                (event.ctrlKey || event.metaKey) &&
                event.shiftKey &&
                event.key.toLowerCase() === "f"
            ) {
                const otherModalOpen = Array.from(
                    document.querySelectorAll<HTMLElement>(
                        ".ms-Dialog-main, .ms-Modal-scrollableContent, .fui-DialogSurface"
                    )
                ).some(
                    el =>
                        el.getClientRects().length > 0 &&
                        getComputedStyle(el).visibility !== "hidden"
                )
                if (otherModalOpen) return
                event.preventDefault()
                show()
                return
            }
            if (
                (event.ctrlKey || event.metaKey) &&
                event.shiftKey &&
                event.key.toLowerCase() === "f"
            ) {
                event.preventDefault()
                show()
            }
        }
        window.addEventListener("personal-search", show)
        window.addEventListener("keydown", key)
        return () => {
            window.removeEventListener("personal-search", show)
            window.removeEventListener("keydown", key)
        }
    }, [])

    useEffect(() => {
        if (!open) return
        const update = () =>
            window.personal
                .status()
                .then(status => setIndex(status.index))
                .catch(err => setError(String(err)))
        void update()
        const timer = setInterval(update, 1200)
        return () => clearInterval(timer)
    }, [open])

    useEffect(() => {
        const current = ++generation.current
        if (!open) return
        if (!query.trim()) {
            setHits([])
            setActiveIndex(-1)
            setMore(false)
            setBusy(false)
            setError("")
            return
        }
        setBusy(true)
        const timer = setTimeout(() => {
            window.personal
                .search(query)
                .then(result => {
                    if (current !== generation.current) return
                    setHits(result)
                    setActiveIndex(result.length > 0 ? 0 : -1)
                    setMore(result.length === 50)
                    setError("")
                })
                .catch(err => {
                    if (current === generation.current) setError(String(err))
                })
                .finally(() => {
                    if (current === generation.current) setBusy(false)
                })
        }, 160)
        return () => clearTimeout(timer)
    }, [query, open])

    async function loadMore() {
        const current = generation.current
        setBusy(true)
        try {
            const result = await window.personal.search(query, hits.length)
            if (current === generation.current) {
                setHits([...hits, ...result])
                setMore(result.length === 50)
            }
        } catch (err) {
            setError(String(err))
        } finally {
            setBusy(false)
        }
    }

    async function openArticle(id: number) {
        try {
            const [row] = await database
                .select()
                .from(itemsTable)
                .where(eq(itemsTable._id, id))
            if (!row) throw new Error(intl.get("personal.missingArticle"))
            const item = row as unknown as RSSItem
            if (settingsOpen) {
                await dispatch(exitSettings())
            }
            dispatch(
                initFeedSuccess(new RSSFeed("PERSONAL_SEARCH", [item.source]), [
                    item,
                ])
            )
            await dispatch(markRead(item))
            dispatch(showItem("PERSONAL_SEARCH", { ...item, hasRead: true }))
            setOpen(false)
        } catch (err) {
            setError(String(err))
        }
    }

    function handleKeyDown(event: React.KeyboardEvent) {
        if (event.nativeEvent.isComposing) return
        if (!hits.length) return

        if (event.key === "ArrowDown") {
            event.preventDefault()
            const next =
                activeIndex < 0 ? 0 : Math.min(hits.length - 1, activeIndex + 1)
            setActiveIndex(next)
            hitRefs.current[next]?.scrollIntoView({ block: "nearest" })
        } else if (event.key === "ArrowUp") {
            event.preventDefault()
            const next = activeIndex <= 0 ? 0 : activeIndex - 1
            setActiveIndex(next)
            hitRefs.current[next]?.scrollIntoView({ block: "nearest" })
        } else if (event.key === "Enter") {
            const targetEl = event.target as HTMLElement | null
            if (targetEl?.tagName === "BUTTON") {
                return
            }
            if (activeIndex >= 0 && activeIndex < hits.length) {
                event.preventDefault()
                void openArticle(hits[activeIndex].id)
            }
        }
    }

    return (
        <Dialog
            hidden={!open}
            onDismiss={() => setOpen(false)}
            minWidth={680}
            maxWidth={800}
            dialogContentProps={{
                type: DialogType.close,
                title: intl.get("personal.search"),
                closeButtonAriaLabel: intl.get("close"),
            }}
            modalProps={{
                isBlocking: false,
                styles: {
                    main: {
                        minWidth: "min(680px, calc(100vw - 24px))",
                        maxWidth: "min(800px, calc(100vw - 24px))",
                    },
                },
            }}>
            <div onKeyDown={handleKeyDown}>
                <SearchBox
                    autoFocus
                    spellCheck={false}
                    autoCorrect="off"
                    ariaLabel={intl.get("personal.search")}
                    placeholder={intl.get("personal.searchHint")}
                    value={query}
                    onChange={(_, value) => setQuery(value || "")}
                />
                {(busy || index?.running) && (
                    <ProgressIndicator
                        label={
                            index?.running
                                ? intl.get("personal.indexProgress", {
                                      done: index.indexed,
                                      total: index.total,
                                  })
                                : intl.get("personal.searching")
                        }
                        percentComplete={
                            index?.running && index.total
                                ? index.indexed / index.total
                                : undefined
                        }
                    />
                )}
                {(error || index?.error) && (
                    <MessageBar messageBarType={MessageBarType.error}>
                        {intl.get("personal.failed")} {error || index?.error}
                    </MessageBar>
                )}
                <div className={classes.results}>
                    {!busy && query.trim() && !hits.length && (
                        <p style={{ color: "var(--neutralSecondary)" }}>
                            {intl.get("personal.noResults")}
                        </p>
                    )}
                    {hits.map((hit, idx) => {
                        const dateStr = formatHitDate(hit.date)
                        const isActive = idx === activeIndex
                        return (
                            <div
                                ref={el => {
                                    hitRefs.current[idx] = el
                                }}
                                className={mergeClasses(
                                    classes.hit,
                                    isActive && classes.hitActive
                                )}
                                key={hit.id}
                                onMouseEnter={() => setActiveIndex(idx)}>
                                <DefaultButton
                                    className={classes.title}
                                    onClick={() => void openArticle(hit.id)}>
                                    <Highlight
                                        text={hit.title}
                                        query={query}
                                        markClass={classes.mark}
                                    />
                                </DefaultButton>
                                <small className={classes.sourceMeta}>
                                    {hit.source}
                                    {dateStr ? ` · ${dateStr}` : ""}
                                </small>
                                <p className={classes.excerpt}>
                                    <Highlight
                                        text={hit.excerpt}
                                        query={query}
                                        markClass={classes.mark}
                                    />
                                </p>
                            </div>
                        )
                    })}
                    {more && (
                        <DefaultButton
                            disabled={busy}
                            onClick={() => void loadMore()}>
                            {intl.get("loadMore")}
                        </DefaultButton>
                    )}
                </div>
            </div>
        </Dialog>
    )
}
