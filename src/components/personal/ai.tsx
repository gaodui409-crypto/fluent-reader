import * as React from "react"
import { useCallback, useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    CommandBarButton,
    DefaultButton,
    PrimaryButton,
    TextField,
    Checkbox,
    MessageBar,
    MessageBarType,
    Spinner,
    Separator,
    Modal,
    Link,
} from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import type {
    AIArticleState,
    AISettings,
    AIResult,
    AIKind,
    AIUsage,
    Briefing,
} from "../../personal-types"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { showItemFromId } from "../../scripts/models/page"
import {
    exitSettings,
    toggleMenu,
    toggleSettings,
} from "../../scripts/models/app"
import Highlights from "../cards/highlights"
import type { RSSItem } from "../../scripts/models/item"
import type { FeedFilter } from "../../scripts/models/feed"

const useStyles = makeStyles({
    column: { display: "flex", flexDirection: "column", gap: "12px" },
    row: {
        display: "flex",
        gap: "10px",
        alignItems: "center",
        flexWrap: "wrap",
    },
    formRow: {
        display: "flex",
        gap: "12px",
        alignItems: "end",
        flexWrap: "wrap",
    },
    grow: { flexGrow: 1 },
    inlinePanel: {
        flexShrink: 0,
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
        padding: "12px 18px",
        maxHeight: "40vh",
        overflowY: "auto",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
    },
    inlinePanelExpanded: {
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 0,
        maxHeight: "none",
        backgroundColor: "var(--white)",
        padding: "18px clamp(18px, 4vw, 40px) 32px",
    },
    panelHeader: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
    },
    panelTitle: {
        margin: 0,
        fontSize: "14px",
        fontWeight: 600,
    },
    metaBadge: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
        marginRight: "auto",
    },
    parallel: {
        "display": "grid",
        "gridTemplateColumns": "repeat(2,minmax(0,1fr))",
        "gap": "20px",
        "@media(max-width:740px)": { gridTemplateColumns: "1fr" },
    },
    sectionLabel: {
        margin: "0 0 6px",
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--neutralSecondary)",
    },
    text: {
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        userSelect: "text",
        lineHeight: "1.75",
        fontSize: "14px",
    },
    modal: {
        padding: "24px",
        width: "min(1020px, 88vw)",
        maxHeight: "82vh",
        overflowY: "auto",
        backgroundColor: "var(--white)",
        color: "var(--black)",
        boxSizing: "border-box",
    },
    briefingLayout: {
        "display": "grid",
        "gridTemplateColumns": "230px minmax(0, 1fr)",
        "gap": "20px",
        "marginTop": "14px",
        "@media(max-width:740px)": { gridTemplateColumns: "1fr" },
    },
    briefingList: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        borderRight: "1px solid var(--neutralQuaternaryAlt)",
        paddingRight: "12px",
        maxHeight: "60vh",
        overflowY: "auto",
    },
    briefingHistoryBtn: {
        justifyContent: "flex-start",
        textAlign: "left",
    },
    topic: {
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        paddingBottom: "16px",
        marginBottom: "16px",
    },
    entryCard: {
        padding: "8px 0",
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

export function useAIArticleController(id: number) {
    const aiConfigured = useAppSelector(s => s.library.aiConfigured)
    const [kind, setKind] = useState<AIKind | null>(null)
    const [result, setResult] = useState<AIResult>()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [forceNonce, setForceNonce] = useState(0)
    const [bilingual, setBilingual] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const [copied, setCopied] = useState(false)
    const [cacheState, setCacheState] = useState<AIArticleState>({})

    useEffect(() => {
        setKind(null)
        setExpanded(false)
        setResult(undefined)
        setError("")
        setForceNonce(0)
        setCopied(false)
    }, [id])

    useEffect(() => {
        let active = true
        const loadState = () => {
            if (!window.personal.aiArticleState) return
            void window.personal
                .aiArticleState(id)
                .then(s => {
                    if (active && s) setCacheState(s)
                })
                .catch(console.warn)
        }
        loadState()
        const off = window.personal.onChanged(loadState)
        return () => {
            active = false
            off()
        }
    }, [id])

    useEffect(() => {
        if (!kind || !aiConfigured) return
        let live = true
        const force = forceNonce > 0
        setBusy(true)
        setError("")
        setCopied(false)
        if (force) setResult(undefined)
        void window.personal
            .aiGenerate(id, kind, force)
            .then(value => {
                if (live) {
                    setResult(value)
                    setCacheState(prev => ({
                        ...prev,
                        ...(kind === "summary"
                            ? { summary: value.text }
                            : kind === "translation"
                            ? {
                                  translation: value.text,
                                  original: value.original,
                              }
                            : {}),
                    }))
                }
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
    }, [id, kind, aiConfigured, forceNonce])

    const toggleKind = useCallback((target: AIKind) => {
        setForceNonce(0)
        setKind(prev => {
            const next = prev === target ? null : target
            setExpanded(next === "translation")
            return next
        })
    }, [])

    const regenerate = useCallback(() => {
        setForceNonce(n => n + 1)
    }, [])

    const close = useCallback(() => {
        setKind(null)
        setExpanded(false)
    }, [])

    const copyResult = useCallback(() => {
        if (!result?.text) return
        window.utils.writeClipboard(result.text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
    }, [result])

    return {
        aiConfigured,
        kind,
        result,
        busy,
        error,
        bilingual,
        setBilingual,
        expanded,
        setExpanded,
        copied,
        cacheState,
        toggleKind,
        regenerate,
        close,
        copyResult,
    }
}

export function AIArticleButtons({
    controller,
}: {
    controller: ReturnType<typeof useAIArticleController>
}) {
    const { kind, cacheState, toggleKind } = controller
    return (
        <>
            <CommandBarButton
                title={intl.get("ai.summary")}
                className={
                    kind === "summary" || Boolean(cacheState.summary)
                        ? "active"
                        : ""
                }
                iconProps={{ iconName: "TextDocument" }}
                onClick={() => toggleKind("summary")}
            />
            <CommandBarButton
                title={intl.get("ai.translation")}
                className={
                    kind === "translation" || Boolean(cacheState.translation)
                        ? "active"
                        : ""
                }
                iconProps={{ iconName: "LocaleLanguage" }}
                onClick={() => toggleKind("translation")}
            />
        </>
    )
}

export function AIArticlePanel({
    controller,
    onCloseRestoreFocus,
    fontFamily,
    fontSize,
}: {
    controller: ReturnType<typeof useAIArticleController>
    onCloseRestoreFocus?: () => void
    fontFamily?: string
    fontSize?: number
}) {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const {
        aiConfigured,
        kind,
        result,
        busy,
        error,
        bilingual,
        setBilingual,
        expanded,
        setExpanded,
        copied,
        regenerate,
        close,
        copyResult,
    } = controller

    if (!kind) return null
    const handleClose = onCloseRestoreFocus || close
    const textStyle: React.CSSProperties = {
        ...(fontSize ? { fontSize: `${fontSize}px` } : {}),
        ...(fontFamily ? { fontFamily } : {}),
    }

    return (
        <div
            data-reader-drawer="true"
            data-ai-expanded={expanded ? "true" : undefined}
            className={mergeClasses(
                classes.inlinePanel,
                expanded && classes.inlinePanelExpanded
            )}
            role="region"
            aria-label={intl.get("ai." + kind)}
            onKeyDown={e => {
                if (
                    e.key === "Escape" &&
                    !e.ctrlKey &&
                    !e.altKey &&
                    !e.metaKey
                ) {
                    e.preventDefault()
                    e.stopPropagation()
                    handleClose()
                }
            }}>
            <div className={classes.panelHeader}>
                <h3 className={classes.panelTitle}>{intl.get("ai." + kind)}</h3>
                <span className={classes.metaBadge}>
                    {result
                        ? `${usageText(result.tokens)} · ${intl.get(
                              result.cached ? "ai.cached" : "ai.generated"
                          )}`
                        : ""}
                </span>
                {kind === "translation" && result?.original && (
                    <DefaultButton onClick={() => setBilingual(v => !v)}>
                        {bilingual ? "仅看译文" : "双语对照"}
                    </DefaultButton>
                )}
                {result?.text && (
                    <DefaultButton onClick={() => setExpanded(v => !v)}>
                        {expanded ? "退出全屏" : "全屏阅读"}
                    </DefaultButton>
                )}
                {result?.text && (
                    <DefaultButton onClick={copyResult}>
                        {copied ? "已复制" : "复制"}
                    </DefaultButton>
                )}
                {aiConfigured && !busy && (
                    <DefaultButton onClick={regenerate}>
                        {error ? intl.get("personal.retry") : "重新生成"}
                    </DefaultButton>
                )}
                <DefaultButton onClick={handleClose}>
                    {intl.get("close")}
                </DefaultButton>
            </div>

            {!aiConfigured ? (
                <div className={classes.row}>
                    <span>
                        尚未配置 AI
                        服务，填写接口基础地址与模型名后即可生成文章摘要与全文翻译。
                    </span>
                    <PrimaryButton
                        onClick={() => {
                            handleClose()
                            dispatch(toggleSettings())
                            setTimeout(() => {
                                window.dispatchEvent(
                                    new CustomEvent("open-personal-section", {
                                        detail: "ai",
                                    })
                                )
                            }, 80)
                        }}>
                        前往 AI 设置
                    </PrimaryButton>
                </div>
            ) : (
                <>
                    {busy && <Spinner label={intl.get("ai.working")} />}
                    {error && (
                        <MessageBar messageBarType={MessageBarType.error}>
                            {intl.get("personal.failed")} {error}
                        </MessageBar>
                    )}
                    {result && (
                        <div
                            className={mergeClasses(
                                kind === "translation" &&
                                    bilingual &&
                                    result.original &&
                                    classes.parallel
                            )}>
                            {kind === "translation" &&
                                bilingual &&
                                result.original && (
                                    <section>
                                        <h4 className={classes.sectionLabel}>
                                            {intl.get("ai.original")}
                                        </h4>
                                        <div
                                            className={classes.text}
                                            style={textStyle}>
                                            {result.original}
                                        </div>
                                    </section>
                                )}
                            <section>
                                {kind === "translation" &&
                                    bilingual &&
                                    result.original && (
                                        <h4 className={classes.sectionLabel}>
                                            {intl.get("ai.translated")}
                                        </h4>
                                    )}
                                <div className={classes.text} style={textStyle}>
                                    {result.text}
                                </div>
                            </section>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export function AIArticle({ id }: { id: number }) {
    const controller = useAIArticleController(id)
    return (
        <>
            <AIArticleButtons controller={controller} />
            <AIArticlePanel controller={controller} />
        </>
    )
}

export function AISettingsPanel() {
    const classes = useStyles()
    const [settings, setSettings] = useState<AISettings>()
    const [key, setKey] = useState("")
    const [removeKey, setRemoveKey] = useState(false)
    const [usage, setUsage] = useState<AIUsage>()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

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
        if (!settings) return
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
            <p
                style={{
                    margin: 0,
                    color: "var(--neutralSecondary)",
                    lineHeight: 1.6,
                }}>
                {intl.get("ai.help")}
            </p>
            <TextField
                label={intl.get("ai.baseURL")}
                placeholder="https://api.openai.com/v1"
                value={settings.baseURL}
                onChange={(_, v) =>
                    setSettings({ ...settings, baseURL: v || "" })
                }
            />
            <TextField
                label={intl.get("ai.model")}
                placeholder="例如 gpt-4o-mini、deepseek-chat"
                value={settings.model}
                onChange={(_, v) =>
                    setSettings({ ...settings, model: v || "" })
                }
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
                    setKey(v || "")
                    setRemoveKey(false)
                }}
            />
            {settings.hasKey && (
                <Checkbox
                    label={intl.get("ai.removeKey")}
                    checked={removeKey}
                    onChange={(_, v) => setRemoveKey(!!v)}
                />
            )}
            <TextField
                label={intl.get("ai.language")}
                value={settings.targetLanguage}
                onChange={(_, v) =>
                    setSettings({ ...settings, targetLanguage: v || "" })
                }
            />
            <Checkbox
                label={intl.get("ai.daily")}
                checked={settings.dailyBriefing}
                onChange={(_, v) =>
                    setSettings({ ...settings, dailyBriefing: !!v })
                }
            />
            {settings.dailyBriefing && (
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
            )}
            <div className={classes.formRow}>
                <PrimaryButton disabled={busy} onClick={() => void save()}>
                    {intl.get("ai.save")}
                </PrimaryButton>
                <DefaultButton
                    disabled={busy || !settings.baseURL || !settings.model}
                    onClick={() => void save(true)}>
                    {intl.get("ai.test")}
                </DefaultButton>
                {settings.configured && (
                    <DefaultButton onClick={openBriefings}>
                        {intl.get("ai.briefings")}
                    </DefaultButton>
                )}
            </div>
            {busy && <Spinner label={intl.get("ai.working")} />}
            {error && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {intl.get("personal.failed")} {error}
                </MessageBar>
            )}
            {message && (
                <MessageBar messageBarType={MessageBarType.success}>
                    {message}
                </MessageBar>
            )}
            {usage && (
                <small style={{ color: "var(--neutralSecondary)" }}>
                    {intl.get("ai.monthUsage", { n: usage.month })} ·{" "}
                    {intl.get("ai.lastUsage")} {usageText(usage.last)}{" "}
                    {usage.unknownCalls > 0 &&
                        intl.get("ai.unknownCalls", { n: usage.unknownCalls })}
                </small>
            )}
            {usage?.error && (
                <MessageBar messageBarType={MessageBarType.warning}>
                    {intl.get("ai.taskError")} {usage.error}
                </MessageBar>
            )}
        </div>
    )
}

export const openBriefings = () =>
    window.dispatchEvent(new Event("personal:briefings"))

export function Briefings() {
    const settingsOpen = useAppSelector(s => s.app.settings.display)
    const menuOpen = useAppSelector(s => s.app.menu)
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const [open, setOpen] = useState(false)
    const [rows, setRows] = useState<Briefing[]>([])
    const [selected, setSelected] = useState<Briefing>()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        const show = () => setOpen(true)
        window.addEventListener("personal:briefings", show)
        return () => window.removeEventListener("personal:briefings", show)
    }, [])

    useEffect(() => {
        if (!open) return
        setError("")
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
            const all = await window.personal.briefings()
            setRows(all)
            setSelected(row)
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    async function removeSelected() {
        if (!selected || !window.personal.deleteBriefing) return
        setBusy(true)
        setError("")
        try {
            await window.personal.deleteBriefing(selected.id)
            const next = await window.personal.briefings()
            setRows(next)
            setSelected(next[0])
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
                    <h2
                        id="briefings-title"
                        className={classes.grow}
                        style={{ margin: 0 }}>
                        {intl.get("ai.briefings")}
                    </h2>
                    <PrimaryButton
                        disabled={busy}
                        onClick={() => void create()}>
                        {intl.get("ai.createBriefing")}
                    </PrimaryButton>
                    {selected && (
                        <DefaultButton
                            disabled={busy}
                            onClick={() => void removeSelected()}>
                            删除此期
                        </DefaultButton>
                    )}
                    <DefaultButton onClick={() => setOpen(false)}>
                        {intl.get("close")}
                    </DefaultButton>
                </div>
                <p
                    style={{
                        color: "var(--neutralSecondary)",
                        margin: "8px 0 12px",
                    }}>
                    {intl.get("ai.briefingHelp")}
                </p>
                {busy && <Spinner label={intl.get("ai.working")} />}
                {error && (
                    <MessageBar messageBarType={MessageBarType.error}>
                        {intl.get("personal.failed")} {error}
                    </MessageBar>
                )}
                {!busy && rows.length === 0 && !error && (
                    <p style={{ color: "var(--neutralSecondary)" }}>
                        还没有生成过每日简报，点击右上角「立即生成简报」即可汇总过去
                        24 小时的未读文章。
                    </p>
                )}
                {rows.length > 0 && (
                    <div className={classes.briefingLayout}>
                        <div className={classes.briefingList}>
                            {rows.map(row => (
                                <DefaultButton
                                    key={row.id}
                                    className={classes.briefingHistoryBtn}
                                    checked={selected?.id === row.id}
                                    onClick={() => setSelected(row)}>
                                    {new Date(row.createdAt).toLocaleString()}
                                </DefaultButton>
                            ))}
                        </div>
                        <div>
                            {selected && (
                                <>
                                    <small
                                        style={{
                                            display: "block",
                                            color: "var(--neutralSecondary)",
                                            marginBottom: "12px",
                                        }}>
                                        生成时间：
                                        {new Date(
                                            selected.createdAt
                                        ).toLocaleString()}{" "}
                                        · {usageText(selected.tokens)}
                                    </small>
                                    {selected.topics.map((topic, index) => (
                                        <section
                                            key={index}
                                            className={classes.topic}>
                                            <h3 style={{ marginTop: 0 }}>
                                                {topic.topic}
                                            </h3>
                                            {topic.entries.map(entry => (
                                                <div
                                                    key={entry.id}
                                                    className={
                                                        classes.entryCard
                                                    }>
                                                    <Link
                                                        onClick={async () => {
                                                            setOpen(false)
                                                            if (settingsOpen)
                                                                await dispatch(
                                                                    exitSettings()
                                                                )
                                                            if (menuOpen)
                                                                dispatch(
                                                                    toggleMenu()
                                                                )
                                                            await dispatch(
                                                                showItemFromId(
                                                                    entry.id
                                                                )
                                                            )
                                                        }}>
                                                        <strong>
                                                            {entry.title}
                                                        </strong>
                                                    </Link>
                                                    <p
                                                        className={classes.text}
                                                        style={{
                                                            margin: "4px 0 6px",
                                                        }}>
                                                        {entry.summary}
                                                    </p>
                                                    <Link
                                                        onClick={() =>
                                                            void window.utils.openExternal(
                                                                entry.link
                                                            )
                                                        }>
                                                        {intl.get(
                                                            "ai.openOriginal"
                                                        )}
                                                    </Link>
                                                </div>
                                            ))}
                                        </section>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    )
}
