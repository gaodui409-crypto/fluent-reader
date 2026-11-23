import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    DefaultButton,
    Dropdown,
    PrimaryButton,
    TextField,
    MessageBar,
    MessageBarType,
    Spinner,
    Separator,
    Link,
} from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import type { DiscoveredFeed, SourceHealth } from "../../personal-types"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { updateSourceDone } from "../../scripts/models/source"
import { addSourceToGroup } from "../../scripts/models/group"
import { fetchItems } from "../../scripts/models/item"
import { openSourcePreferences } from "../../scripts/models/preferences"
import { LinuxDoSubscriptions } from "./linuxdo"

const useStyles = makeStyles({
    row: { display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" },
    actionRow: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
    },
    field: { flexGrow: 1, minWidth: "240px" },
    entries: { display: "flex", flexDirection: "column", gap: "12px" },
    health: {
        padding: "12px 14px",
        border: "1px solid var(--neutralQuaternary)",
        borderRadius: "6px",
        overflowWrap: "anywhere",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    },
    healthHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        flexWrap: "wrap",
    },
    hint: { color: "var(--neutralSecondary)", margin: 0 },
    pills: {
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        alignItems: "center",
    },
    pill: {
        borderRadius: "16px",
        padding: "4px 12px",
        fontSize: "12px",
        lineHeight: "1.5",
        border: "1px solid var(--neutralQuaternary)",
        backgroundColor: "var(--neutralLighterAlt)",
        color: "var(--black)",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    pillActive: {
        border: "1px solid var(--themePrimary)",
        color: "var(--themePrimary)",
        backgroundColor: "var(--neutralLight)",
        fontWeight: 600,
    },
})

export function normalizeFeedDiscoveryUrl(
    raw: string,
    rssHubBase: string
): string {
    const trimmed = raw.trim()
    if (!trimmed) return ""
    if (/^rsshub:\/\//i.test(trimmed)) {
        const route = trimmed.replace(/^rsshub:\/\/+/i, "").replace(/^\/+/, "")
        const baseRaw = (rssHubBase || "https://rsshub.app")
            .trim()
            .replace(/\/+$/, "")
        const base = /^https?:\/\//i.test(baseRaw)
            ? baseRaw
            : "https://" + baseRaw
        return route ? `${base}/${route}` : base
    }
    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
        return "https://" + trimmed.replace(/^\/+/, "")
    }
    return trimmed
}

export function FeedDiscovery({
    addSource,
}: {
    addSource: (url: string) => Promise<number> | void
}) {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const sources = useAppSelector(s => s.sources)
    const groups = useAppSelector(s => s.groups)

    const [url, setURL] = useState("")
    const [targetGid, setTargetGid] = useState<number>(-1)
    const [feeds, setFeeds] = useState<DiscoveredFeed[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [empty, setEmpty] = useState(false)
    const [rssHub, setRssHub] = useState("https://rsshub.app")

    useEffect(() => {
        void window.personal
            .settings()
            .then(s => {
                if (s.rssHub) setRssHub(s.rssHub)
            })
            .catch(e => setError(String(e)))
    }, [])

    const multiGroups = groups.filter(g => g.isMultiple)
    const effectiveGid = multiGroups.some(g => g.gid === targetGid)
        ? targetGid
        : -1

    const subscribedUrls = new Set(
        Object.values(sources)
            .filter(s => !s.archived)
            .map(s => s.url)
    )

    async function subscribeFeedUrl(feedUrl: string, clearList = false) {
        const sid = await addSource(feedUrl)
        if (typeof sid === "number" && effectiveGid > -1) {
            dispatch(addSourceToGroup(effectiveGid, sid))
        }
        setURL("")
        if (clearList) {
            setFeeds([])
            setEmpty(false)
        }
    }

    async function discover(event: React.FormEvent) {
        event.preventDefault()
        const normalized = normalizeFeedDiscoveryUrl(url, rssHub)
        if (!normalized) return
        setBusy(true)
        setError("")
        setEmpty(false)
        setFeeds([])
        try {
            const found = await window.personal.discover(normalized)
            if (found.length === 1 && found[0].url === normalized) {
                await subscribeFeedUrl(found[0].url, true)
            } else {
                setFeeds(found)
                setEmpty(!found.length)
            }
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    async function handleAddDiscovered(feedUrl: string) {
        setBusy(true)
        setError("")
        try {
            await subscribeFeedUrl(feedUrl, false)
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
                    placeholder="输入网站域名、RSS 地址或 rsshub:// 路由（可省略 https://）"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    value={url}
                    onChange={(_, v) => {
                        setURL(v || "")
                        setFeeds([])
                        setEmpty(false)
                    }}
                />
                <Dropdown
                    label="归入分组"
                    selectedKey={effectiveGid}
                    options={[
                        { key: -1, text: "不归入分组" },
                        ...multiGroups.map(g => ({
                            key: g.gid,
                            text: g.name,
                        })),
                    ]}
                    onChange={(_, opt) => opt && setTargetGid(Number(opt.key))}
                    style={{ minWidth: 148 }}
                />
                <PrimaryButton type="submit" disabled={busy || !url.trim()}>
                    {intl.get("add")}
                </PrimaryButton>
            </form>
            {busy && <Spinner label={intl.get("discovery.working")} />}
            {error && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {intl.get("personal.failed")} {error}
                </MessageBar>
            )}
            {feeds.length > 0 && <p>{intl.get("discovery.choose")}</p>}
            {feeds.map(feed => {
                const isSubscribed = subscribedUrls.has(feed.url)
                return (
                    <div key={feed.url} className={classes.row}>
                        <span className={classes.field}>
                            {feed.title}
                            <br />
                            <small>{feed.url}</small>
                        </span>
                        <DefaultButton
                            disabled={busy || isSubscribed}
                            onClick={() => void handleAddDiscovered(feed.url)}>
                            {isSubscribed ? "已订阅" : intl.get("add")}
                        </DefaultButton>
                    </div>
                )
            })}
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

type HealthFilter = "all" | "error" | "stale" | "redirect"

export function SourceHealthPanel({
    defaultOpen = false,
}: {
    defaultOpen?: boolean
}) {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const sources = useAppSelector(s => s.sources)
    const refreshing = useAppSelector(
        s => s.app.refreshRunning || s.app.syncing
    )
    const [open, setOpen] = useState(defaultOpen)
    const [filter, setFilter] = useState<HealthFilter>("all")
    const [rows, setRows] = useState<SourceHealth[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")

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

    const errorCount = rows.filter(
        r => r.failures > 0 || Boolean(r.lastError)
    ).length
    const staleCount = rows.filter(r => r.stale).length
    const redirectCount = rows.filter(r => Boolean(r.redirect)).length
    const redirectableRows = rows.filter(r => r.redirect && !r.service)

    const filteredRows = rows.filter(row => {
        if (filter === "error")
            return row.failures > 0 || Boolean(row.lastError)
        if (filter === "stale") return row.stale
        if (filter === "redirect") return Boolean(row.redirect)
        return true
    })

    async function applyAllRedirects() {
        if (!redirectableRows.length) return
        setBusy(true)
        setError("")
        try {
            for (const row of redirectableRows) {
                const nextUrl = await window.personal.applyRedirect(row.sid)
                if (sources[row.sid]) {
                    dispatch(
                        updateSourceDone({
                            ...sources[row.sid],
                            url: nextUrl,
                        })
                    )
                }
            }
            await load()
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    const filterOptions: { key: HealthFilter; label: string }[] = [
        { key: "all", label: `全部（${rows.length}）` },
        { key: "error", label: `拉取异常（${errorCount}）` },
        { key: "stale", label: `长期停更（${staleCount}）` },
        { key: "redirect", label: `有新地址（${redirectCount}）` },
    ]

    return (
        <div className={classes.entries}>
            <Separator>{defaultOpen ? intl.get("health.title") : ""}</Separator>
            {!defaultOpen && (
                <div>
                    <DefaultButton onClick={() => setOpen(!open)}>
                        {intl.get("health.title")}
                    </DefaultButton>
                </div>
            )}
            {open && (
                <>
                    <p className={classes.hint}>{intl.get("health.help")}</p>
                    <div className={classes.actionRow}>
                        <DefaultButton
                            disabled={busy}
                            onClick={() => void load(true)}>
                            {intl.get("health.check")}
                        </DefaultButton>
                        {redirectableRows.length > 0 && (
                            <PrimaryButton
                                disabled={busy}
                                onClick={() => void applyAllRedirects()}>
                                一键更新全部跳转地址（{redirectableRows.length}
                                ）
                            </PrimaryButton>
                        )}
                    </div>
                    <div
                        className={classes.pills}
                        role="group"
                        aria-label="筛选订阅健康状态">
                        {filterOptions.map(opt => (
                            <button
                                key={opt.key}
                                type="button"
                                aria-pressed={filter === opt.key}
                                className={mergeClasses(
                                    classes.pill,
                                    filter === opt.key && classes.pillActive
                                )}
                                onClick={() => setFilter(opt.key)}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {busy && <Spinner label={intl.get("health.checking")} />}
                    {error && (
                        <MessageBar messageBarType={MessageBarType.error}>
                            {intl.get("personal.failed")} {error}
                        </MessageBar>
                    )}
                    {!busy && filteredRows.length === 0 && (
                        <p className={classes.hint}>
                            {rows.length === 0
                                ? "暂无订阅源记录。"
                                : "当前筛选条件下没有订阅源。"}
                        </p>
                    )}
                    {filteredRows.map(row => (
                        <div key={row.sid} className={classes.health}>
                            <div className={classes.healthHeader}>
                                <strong>{row.name}</strong>
                                <div className={classes.actionRow}>
                                    <DefaultButton
                                        onClick={() =>
                                            openSourcePreferences({
                                                sids: [row.sid],
                                            })
                                        }>
                                        偏好设置
                                    </DefaultButton>
                                    {!row.service && (
                                        <DefaultButton
                                            disabled={busy || refreshing}
                                            onClick={async () => {
                                                setBusy(true)
                                                setError("")
                                                try {
                                                    await dispatch(
                                                        fetchItems(false, [
                                                            row.sid,
                                                        ])
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
                                </div>
                            </div>
                            <small className={classes.hint}>{row.url}</small>
                            <small>
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
                            </small>
                            <small>
                                {intl.get("health.stats", {
                                    updates: row.updates,
                                    opened: row.opened,
                                    rate: row.updates
                                        ? Math.round(
                                              (row.opened / row.updates) * 100
                                          )
                                        : 0,
                                })}
                            </small>
                            {row.failures > 0 && (
                                <MessageBar
                                    messageBarType={MessageBarType.warning}>
                                    {intl.get("health.failures", {
                                        n: row.failures,
                                    })}{" "}
                                    {row.lastError}
                                </MessageBar>
                            )}
                            {row.stale && (
                                <small className={classes.hint}>
                                    {intl.get("health.stale")}{" "}
                                    {row.latest
                                        ? new Date(
                                              row.latest
                                          ).toLocaleDateString()
                                        : ""}
                                </small>
                            )}
                            {row.updates >= 10 &&
                                row.opened / row.updates < 0.05 && (
                                    <small className={classes.hint}>
                                        {intl.get("health.lowRate")}
                                    </small>
                                )}
                            {row.service && (
                                <small className={classes.hint}>
                                    {intl.get("health.service")}
                                </small>
                            )}
                            {row.redirect && (
                                <div className={classes.actionRow}>
                                    <span>
                                        {intl.get("health.redirect")}{" "}
                                        {row.redirect}
                                    </span>
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
                                </div>
                            )}
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}
