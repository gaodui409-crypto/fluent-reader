import * as React from "react"
import { useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import {
    Dialog,
    DialogType,
    DefaultButton,
    SearchBox,
    MessageBar,
    ProgressIndicator,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import type { IndexProgress, SearchHit } from "../../personal-types"
import { useAppDispatch } from "../../scripts/reducer"
import { database, itemsTable } from "../../scripts/db"
import { eq } from "drizzle-orm"
import { RSSItem, markRead } from "../../scripts/models/item"
import { initFeedSuccess, RSSFeed } from "../../scripts/models/feed"
import { showItem } from "../../scripts/models/page"

const useStyles = makeStyles({
    results: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        maxHeight: "55vh",
        overflowY: "auto",
        marginTop: "16px",
    },
    hit: {
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        paddingBottom: "12px",
    },
    title: {
        textAlign: "left",
        justifyContent: "flex-start",
        height: "auto",
        padding: "4px 0",
        whiteSpace: "normal",
    },
    excerpt: { margin: 0, lineHeight: "1.6", userSelect: "text" },
})

function Highlight({ text, query }: { text: string; query: string }) {
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
            {text
                .split(regex)
                .map((part, index) =>
                    index % 2 ? <mark key={index}>{part}</mark> : part
                )}
        </>
    )
}

export default function FullSearch() {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [hits, setHits] = useState<SearchHit[]>([])
    const [error, setError] = useState("")
    const [index, setIndex] = useState<IndexProgress>()
    const [busy, setBusy] = useState(false)
    const [more, setMore] = useState(false)
    const generation = useRef(0)
    useEffect(() => {
        const show = () => setOpen(true)
        const key = (event: KeyboardEvent) => {
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
                .catch(error => setError(String(error)))
        void update()
        const timer = setInterval(update, 1000)
        return () => clearInterval(timer)
    }, [open])
    useEffect(() => {
        const current = ++generation.current
        if (!open) return
        setBusy(true)
        const timer = setTimeout(() => {
            window.personal
                .search(query)
                .then(result => {
                    if (current !== generation.current) return
                    setHits(result)
                    setMore(result.length === 50)
                    setError("")
                })
                .catch(error => {
                    if (current === generation.current) setError(String(error))
                })
                .finally(() => {
                    if (current === generation.current) setBusy(false)
                })
        }, 180)
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
        } catch (error) {
            setError(String(error))
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
            dispatch(
                initFeedSuccess(new RSSFeed("PERSONAL_SEARCH", [item.source]), [
                    item,
                ])
            )
            await dispatch(markRead(item))
            dispatch(showItem("PERSONAL_SEARCH", { ...item, hasRead: true }))
            setOpen(false)
        } catch (error) {
            setError(String(error))
        }
    }
    return (
        <Dialog
            hidden={!open}
            onDismiss={() => setOpen(false)}
            minWidth={700}
            maxWidth={800}
            dialogContentProps={{
                type: DialogType.close,
                title: intl.get("personal.search"),
            }}
            modalProps={{ isBlocking: false }}>
            <SearchBox
                autoFocus
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
                <MessageBar>
                    {intl.get("personal.failed")} {error || index.error}
                </MessageBar>
            )}
            <div className={classes.results}>
                {!busy && query && !hits.length && (
                    <p>{intl.get("personal.noResults")}</p>
                )}
                {hits.map(hit => (
                    <div className={classes.hit} key={hit.id}>
                        <DefaultButton
                            className={classes.title}
                            onClick={() => void openArticle(hit.id)}>
                            <Highlight text={hit.title} query={query} />
                        </DefaultButton>
                        <small>{hit.source}</small>
                        <p className={classes.excerpt}>
                            <Highlight text={hit.excerpt} query={query} />
                        </p>
                    </div>
                ))}
                {more && (
                    <DefaultButton
                        disabled={busy}
                        onClick={() => void loadMore()}>
                        {intl.get("loadMore")}
                    </DefaultButton>
                )}
            </div>
        </Dialog>
    )
}
