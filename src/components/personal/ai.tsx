import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    CommandBarButton,
    DefaultButton,
    PrimaryButton,
    TextField,
    Checkbox,
    MessageBar,
    Spinner,
    Separator,
    Modal,
    Link,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import type {
    AISettings,
    AIResult,
    AIKind,
    AIUsage,
    Briefing,
} from "../../personal-types"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { showItemFromId } from "../../scripts/models/page"
import { exitSettings, toggleMenu } from "../../scripts/models/app"
import Highlights from "../cards/highlights"
import type { RSSItem } from "../../scripts/models/item"
import type { FeedFilter } from "../../scripts/models/feed"

const useStyles = makeStyles({
    column: { display: "flex", flexDirection: "column", gap: "12px" },
    row: { display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" },
    grow: { flexGrow: 1 },
    modal: {
        padding: "24px",
        width: "min(1000px,85vw)",
        maxHeight: "80vh",
        overflowY: "auto",
    },
    parallel: {
        "display": "grid",
        "gridTemplateColumns": "repeat(2,minmax(0,1fr))",
        "gap": "24px",
        "@media(max-width:700px)": { gridTemplateColumns: "1fr" },
    },
    text: {
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        userSelect: "text",
        lineHeight: "1.8",
    },
    topic: {
        borderBottom: "1px solid var(--neutralQuaternary)",
        paddingBottom: "16px",
    },
})
const usageText = (tokens: number | null) =>
    tokens === null
        ? intl.get("ai.unknownTokens")
        : intl.get("ai.tokens", { n: tokens })

export function TranslatedTitle({
    item,
    filter,
}: {
    item: RSSItem
    filter: FeedFilter
}) {
    const text = useAppSelector(s => s.library.titles[item._id]) || item.title
    return (
        <span title={item.title}>
            <Highlights text={text} filter={filter} title />
        </span>
    )
}

export function AIArticle({ id }: { id: number }) {
    const classes = useStyles(),
        [kind, setKind] = useState<AIKind | null>(null),
        [result, setResult] = useState<AIResult>(),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("")
    useEffect(() => {
        if (!kind) return
        let live = true
        setBusy(true)
        setError("")
        setResult(undefined)
        void window.personal
            .aiGenerate(id, kind)
            .then(value => {
                if (live) setResult(value)
            })
            .catch(e => {
                if (live) setError(String(e))
            })
            .finally(() => {
                if (live) setBusy(false)
            })
        return () => {
            live = false
        }
    }, [id, kind])
    return (
        <>
            <CommandBarButton
                title={intl.get("ai.summary")}
                iconProps={{ iconName: "TextDocument" }}
                onClick={() => setKind("summary")}
            />
            <CommandBarButton
                title={intl.get("ai.translation")}
                iconProps={{ iconName: "LocaleLanguage" }}
                onClick={() => setKind("translation")}
            />
            <Modal
                isOpen={!!kind}
                onDismiss={() => setKind(null)}
                titleAriaId="ai-article-title">
                <div className={classes.modal}>
                    <div className={classes.row}>
                        <h2 id="ai-article-title" className={classes.grow}>
                            {intl.get("ai." + kind)}
                        </h2>
                        <DefaultButton onClick={() => setKind(null)}>
                            {intl.get("close")}
                        </DefaultButton>
                    </div>
                    {busy && <Spinner label={intl.get("ai.working")} />}
                    {error && (
                        <MessageBar>
                            {intl.get("personal.failed")} {error}
                        </MessageBar>
                    )}
                    {result && (
                        <>
                            <p>
                                {usageText(result.tokens)} ·{" "}
                                {intl.get(
                                    result.cached ? "ai.cached" : "ai.generated"
                                )}
                            </p>
                            <div
                                className={
                                    kind === "translation"
                                        ? classes.parallel
                                        : undefined
                                }>
                                {result.original && (
                                    <section>
                                        <h3>{intl.get("ai.original")}</h3>
                                        <div className={classes.text}>
                                            {result.original}
                                        </div>
                                    </section>
                                )}
                                <section>
                                    <h3>
                                        {intl.get(
                                            kind === "translation"
                                                ? "ai.translated"
                                                : "ai.summary"
                                        )}
                                    </h3>
                                    <div className={classes.text}>
                                        {result.text}
                                    </div>
                                </section>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </>
    )
}

export function AISettingsPanel() {
    const classes = useStyles(),
        [settings, setSettings] = useState<AISettings>(),
        [key, setKey] = useState(""),
        [removeKey, setRemoveKey] = useState(false),
        [usage, setUsage] = useState<AIUsage>()
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [message, setMessage] = useState("")
    async function refreshUsage() {
        setUsage(await window.personal.aiUsage())
    }
    useEffect(() => {
        void window.personal
            .aiSettings()
            .then(setSettings)
            .catch(e => setError(String(e)))
        void refreshUsage().catch(e => setError(String(e)))
        return window.personal.onChanged(
            () => void refreshUsage().catch(e => setError(String(e)))
        )
    }, [])
    async function save(test = false) {
        setBusy(true)
        setError("")
        setMessage("")
        try {
            const next = await window.personal.saveAI(
                settings,
                removeKey ? "" : key || undefined
            )
            setSettings(next)
            setKey("")
            setRemoveKey(false)
            if (test) {
                const result = await window.personal.testAI()
                setMessage(
                    intl.get("ai.connected") + " · " + usageText(result.tokens)
                )
                await refreshUsage()
            } else setMessage(intl.get("personal.saved"))
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }
    if (!settings) return error ? <MessageBar>{error}</MessageBar> : <Spinner />
    return (
        <div className={classes.column}>
            <Separator>{intl.get("ai.settings")}</Separator>
            <p>{intl.get("ai.help")}</p>
            <TextField
                label={intl.get("ai.baseURL")}
                placeholder="https://api.example.com/v1"
                value={settings.baseURL}
                onChange={(_, v) => setSettings({ ...settings, baseURL: v })}
            />
            <TextField
                label={intl.get("ai.model")}
                value={settings.model}
                onChange={(_, v) => setSettings({ ...settings, model: v })}
            />
            <TextField
                type="password"
                autoComplete="off"
                label={intl.get("ai.key")}
                placeholder={intl.get(
                    settings.hasKey ? "ai.keySaved" : "ai.keyOptional"
                )}
                value={key}
                onChange={(_, v) => {
                    setKey(v)
                    setRemoveKey(false)
                }}
            />
            {settings.hasKey && (
                <Checkbox
                    label={intl.get("ai.removeKey")}
                    checked={removeKey}
                    onChange={(_, v) => setRemoveKey(v)}
                />
            )}
            <TextField
                label={intl.get("ai.language")}
                value={settings.targetLanguage}
                onChange={(_, v) =>
                    setSettings({ ...settings, targetLanguage: v })
                }
            />
            <Checkbox
                label={intl.get("ai.daily")}
                checked={settings.dailyBriefing}
                onChange={(_, v) =>
                    setSettings({ ...settings, dailyBriefing: v })
                }
            />
            <TextField
                type="number"
                min={0}
                max={23}
                label={intl.get("ai.hour")}
                value={String(settings.briefingHour)}
                onChange={(_, v) =>
                    setSettings({ ...settings, briefingHour: Number(v) })
                }
            />
            <div className={classes.row}>
                <PrimaryButton disabled={busy} onClick={() => void save()}>
                    {intl.get("ai.save")}
                </PrimaryButton>
                <DefaultButton
                    disabled={busy || !settings.baseURL || !settings.model}
                    onClick={() => void save(true)}>
                    {intl.get("ai.test")}
                </DefaultButton>
            </div>
            {busy && <Spinner label={intl.get("ai.working")} />}
            {error && (
                <MessageBar>
                    {intl.get("personal.failed")} {error}
                </MessageBar>
            )}
            {message && <MessageBar>{message}</MessageBar>}
            {usage && (
                <p>
                    {intl.get("ai.monthUsage", { n: usage.month })} ·{" "}
                    {intl.get("ai.lastUsage")} {usageText(usage.last)}{" "}
                    {usage.unknownCalls > 0 &&
                        intl.get("ai.unknownCalls", { n: usage.unknownCalls })}
                </p>
            )}
            {usage?.error && (
                <MessageBar>
                    {intl.get("ai.taskError")} {usage.error}
                </MessageBar>
            )}
            {settings.configured && (
                <DefaultButton onClick={openBriefings}>
                    {intl.get("ai.briefings")}
                </DefaultButton>
            )}
        </div>
    )
}

export const openBriefings = () =>
    window.dispatchEvent(new Event("personal:briefings"))
export function Briefings() {
    const settingsOpen = useAppSelector(s => s.app.settings.display)
    const menuOpen = useAppSelector(s => s.app.menu)
    const classes = useStyles(),
        dispatch = useAppDispatch(),
        [open, setOpen] = useState(false),
        [rows, setRows] = useState<Briefing[]>([]),
        [selected, setSelected] = useState<Briefing>(),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("")
    useEffect(() => {
        const show = () => setOpen(true)
        window.addEventListener("personal:briefings", show)
        return () => window.removeEventListener("personal:briefings", show)
    }, [])
    useEffect(() => {
        if (open)
            void window.personal
                .briefings()
                .then(data => {
                    setRows(data)
                    setSelected(data[0])
                })
                .catch(e => setError(String(e)))
    }, [open])
    async function create() {
        setBusy(true)
        setError("")
        try {
            const row = await window.personal.createBriefing()
            setRows(await window.personal.briefings())
            setSelected(row)
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }
    return (
        <Modal
            isOpen={open}
            onDismiss={() => setOpen(false)}
            titleAriaId="briefings-title">
            <div className={classes.modal}>
                <div className={classes.row}>
                    <h2 id="briefings-title" className={classes.grow}>
                        {intl.get("ai.briefings")}
                    </h2>
                    <DefaultButton onClick={() => setOpen(false)}>
                        {intl.get("close")}
                    </DefaultButton>
                </div>
                <p>{intl.get("ai.briefingHelp")}</p>
                <PrimaryButton disabled={busy} onClick={() => void create()}>
                    {intl.get("ai.createBriefing")}
                </PrimaryButton>
                {busy && <Spinner label={intl.get("ai.working")} />}
                {error && (
                    <MessageBar>
                        {intl.get("personal.failed")} {error}
                    </MessageBar>
                )}
                <div className={classes.row}>
                    {rows.map(row => (
                        <DefaultButton
                            key={row.id}
                            checked={selected?.id === row.id}
                            onClick={() => setSelected(row)}>
                            {new Date(row.createdAt).toLocaleString()}
                        </DefaultButton>
                    ))}
                </div>
                {selected && (
                    <>
                        <p>{usageText(selected.tokens)}</p>
                        {selected.topics.map((topic, index) => (
                            <section key={index} className={classes.topic}>
                                <h3>{topic.topic}</h3>
                                {topic.entries.map(entry => (
                                    <div key={entry.id}>
                                        <Link
                                            onClick={async () => {
                                                setOpen(false)
                                                if (settingsOpen)
                                                    await dispatch(
                                                        exitSettings()
                                                    )
                                                if (menuOpen)
                                                    dispatch(toggleMenu())
                                                await dispatch(
                                                    showItemFromId(entry.id)
                                                )
                                            }}>
                                            {entry.title}
                                        </Link>
                                        <p className={classes.text}>
                                            {entry.summary}
                                        </p>
                                        <Link
                                            onClick={() =>
                                                void window.utils.openExternal(
                                                    entry.link
                                                )
                                            }>
                                            {intl.get("ai.openOriginal")}
                                        </Link>
                                    </div>
                                ))}
                            </section>
                        ))}
                    </>
                )}
            </div>
        </Modal>
    )
}
