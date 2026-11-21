import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    DefaultButton,
    PrimaryButton,
    TextField,
    MessageBar,
    Spinner,
    Separator,
    Link,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import type { DiscoveredFeed, SourceHealth } from "../../personal-types"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { updateSourceDone } from "../../scripts/models/source"
import { fetchItems } from "../../scripts/models/item"
import { LinuxDoSubscriptions } from "./linuxdo"

const useStyles = makeStyles({
    row: { display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" },
    field: { flexGrow: 1, minWidth: "240px" },
    entries: { display: "flex", flexDirection: "column", gap: "12px" },
    health: {
        padding: "12px",
        border: "1px solid var(--neutralQuaternary)",
        borderRadius: "6px",
        overflowWrap: "anywhere",
    },
    hint: { color: "var(--neutralSecondary)" },
})
export function FeedDiscovery({
    addSource,
}: {
    addSource: (url: string) => void
}) {
    const classes = useStyles(),
        [url, setURL] = useState(""),
        [feeds, setFeeds] = useState<DiscoveredFeed[]>([])
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [empty, setEmpty] = useState(false),
        [rssHub, setRssHub] = useState("")
    useEffect(() => {
        void window.personal
            .settings()
            .then(s => setRssHub(s.rssHub))
            .catch(e => setError(String(e)))
    }, [])
    async function discover(event: React.FormEvent) {
        event.preventDefault()
        setBusy(true)
        setError("")
        setEmpty(false)
        setFeeds([])
        try {
            const found = await window.personal.discover(url.trim())
            if (found.length === 1 && found[0].url === url.trim())
                addSource(found[0].url)
            else {
                setFeeds(found)
                setEmpty(!found.length)
            }
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className={classes.entries}>
            <LinuxDoSubscriptions />
            <form onSubmit={discover} className={classes.row}>
                <TextField
                    className={classes.field}
                    id="newUrl"
                    label={intl.get("sources.add")}
                    placeholder={intl.get("discovery.placeholder")}
                    value={url}
                    onChange={(_, v) => {
                        setURL(v)
                        setFeeds([])
                        setEmpty(false)
                    }}
                />
                <PrimaryButton
                    type="submit"
                    disabled={busy || !/^https?:\/\//i.test(url.trim())}>
                    {intl.get("add")}
                </PrimaryButton>
            </form>
            {busy && <Spinner label={intl.get("discovery.working")} />}
            {error && (
                <MessageBar>
                    {intl.get("personal.failed")} {error}
                </MessageBar>
            )}
            {feeds.length > 0 && <p>{intl.get("discovery.choose")}</p>}
            {feeds.map(feed => (
                <div key={feed.url} className={classes.row}>
                    <span className={classes.field}>
                        {feed.title}
                        <br />
                        <small>{feed.url}</small>
                    </span>
                    <DefaultButton onClick={() => addSource(feed.url)}>
                        {intl.get("add")}
                    </DefaultButton>
                </div>
            ))}
            {empty && (
                <MessageBar>
                    {intl.get("discovery.noFeed")}{" "}
                    <Link
                        onClick={() => void window.utils.openExternal(rssHub)}>
                        {intl.get("discovery.rssHub")}
                    </Link>
                </MessageBar>
            )}
        </div>
    )
}

export function SourceHealthPanel() {
    const classes = useStyles(),
        dispatch = useAppDispatch(),
        sources = useAppSelector(s => s.sources)
    const refreshing = useAppSelector(
        s => s.app.refreshRunning || s.app.syncing
    )
    const [open, setOpen] = useState(false),
        [rows, setRows] = useState<SourceHealth[]>([]),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("")
    async function load(check = false) {
        setBusy(true)
        setError("")
        try {
            setRows(
                await (check
                    ? window.personal.checkHealth()
                    : window.personal.health())
            )
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }
    useEffect(() => {
        if (open) void load()
    }, [open, sources])
    return (
        <div className={classes.entries}>
            <Separator />
            <DefaultButton onClick={() => setOpen(!open)}>
                {intl.get("health.title")}
            </DefaultButton>
            {open && (
                <>
                    <p className={classes.hint}>{intl.get("health.help")}</p>
                    <DefaultButton
                        disabled={busy}
                        onClick={() => void load(true)}>
                        {intl.get("health.check")}
                    </DefaultButton>
                    {busy && <Spinner label={intl.get("health.checking")} />}
                    {error && (
                        <MessageBar>
                            {intl.get("personal.failed")} {error}
                        </MessageBar>
                    )}
                    {rows.map(row => (
                        <div key={row.sid} className={classes.health}>
                            <strong>{row.name}</strong>
                            <p>{row.url}</p>
                            <p>
                                {intl.get("refresh.sourceTimes", {
                                    fetched: row.lastFetched
                                        ? new Date(
                                              row.lastFetched
                                          ).toLocaleString()
                                        : "—",
                                    checked: row.checkedAt
                                        ? new Date(
                                              row.checkedAt
                                          ).toLocaleString()
                                        : "—",
                                    published: row.latest
                                        ? new Date(row.latest).toLocaleString()
                                        : "—",
                                })}
                            </p>
                            {!row.service && (
                                <DefaultButton
                                    disabled={busy || refreshing}
                                    onClick={async () => {
                                        setBusy(true)
                                        setError("")
                                        try {
                                            await dispatch(
                                                fetchItems(false, [row.sid])
                                            )
                                            await load()
                                        } catch (e) {
                                            setError(String(e))
                                        } finally {
                                            setBusy(false)
                                        }
                                    }}>
                                    {intl.get("refresh.now")}
                                </DefaultButton>
                            )}
                            <p>
                                {intl.get("health.stats", {
                                    updates: row.updates,
                                    opened: row.opened,
                                    rate: row.updates
                                        ? Math.round(
                                              (row.opened / row.updates) * 100
                                          )
                                        : 0,
                                })}
                            </p>
                            {row.failures > 0 && (
                                <MessageBar>
                                    {intl.get("health.failures", {
                                        n: row.failures,
                                    })}{" "}
                                    {row.lastError}
                                </MessageBar>
                            )}
                            {row.stale && (
                                <p>
                                    {intl.get("health.stale")}{" "}
                                    {new Date(row.latest).toLocaleDateString()}
                                </p>
                            )}
                            {row.updates >= 10 &&
                                row.opened / row.updates < 0.05 && (
                                    <p>{intl.get("health.lowRate")}</p>
                                )}
                            {row.service && <p>{intl.get("health.service")}</p>}
                            {row.redirect && (
                                <>
                                    <p>
                                        {intl.get("health.redirect")}{" "}
                                        {row.redirect}
                                    </p>
                                    <DefaultButton
                                        disabled={busy || row.service}
                                        onClick={async () => {
                                            setBusy(true)
                                            setError("")
                                            try {
                                                const url =
                                                    await window.personal.applyRedirect(
                                                        row.sid
                                                    )
                                                if (sources[row.sid])
                                                    dispatch(
                                                        updateSourceDone({
                                                            ...sources[row.sid],
                                                            url,
                                                        })
                                                    )
                                                await load()
                                            } catch (e) {
                                                setError(String(e))
                                            } finally {
                                                setBusy(false)
                                            }
                                        }}>
                                        {intl.get("health.apply")}
                                    </DefaultButton>
                                </>
                            )}
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}
