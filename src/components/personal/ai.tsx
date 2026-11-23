import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import intl from "react-intl-universal"
import {
    CommandBarButton,
    ComboBox,
    DefaultButton,
    Dropdown,
    IComboBoxOption,
    IconButton,
    PrimaryButton,
    TextField,
    Checkbox,
    MessageBar,
    MessageBarType,
    Spinner,
    SpinnerSize,
    Separator,
    Modal,
    Link,
    Icon,
} from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import type {
    AIArticleState,
    AISettings,
    AIResult,
    AIKind,
    AIUsage,
    Briefing,
    BilingualBlock,
} from "../../personal-types"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { showItemFromId } from "../../scripts/models/page"
import {
    exitSettings,
    toggleMenu,
    toggleSettings,
} from "../../scripts/models/app"
import {
    markRead,
    markUnread,
    RSSItem,
    toggleStarred,
    updateItemMeta,
} from "../../scripts/models/item"
import { refreshArchive } from "../../scripts/models/archive"
import Highlights from "../cards/highlights"
import type { FeedFilter } from "../../scripts/models/feed"
import {
    AIMarkdown,
    AI_PROVIDER_PRESETS,
    renderCodeSource,
} from "./ai-markdown"

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
    grow: { flexGrow: 1, minWidth: "200px" },
    profilesBar: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
        padding: "8px 10px",
        borderRadius: "6px",
        backgroundColor: "var(--neutralLighterAlt)",
        border: "1px solid var(--neutralQuaternaryAlt)",
    },
    toolbarIconWrap: {
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    },
    cacheDot: {
        position: "absolute",
        top: "-2px",
        right: "-3px",
        width: "6px",
        height: "6px",
        borderRadius: "999px",
        backgroundColor: "var(--themePrimary)",
    },
    inlinePanel: {
        flexShrink: 0,
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
        padding: "12px 18px",
        maxHeight: "42vh",
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
    bilingualStack: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    },
    bilingualRow: {
        "display": "grid",
        "gridTemplateColumns": "minmax(0, 1fr) minmax(0, 1fr)",
        "gap": "20px",
        "alignItems": "start",
        "@media(max-width:740px)": { gridTemplateColumns: "1fr", gap: "8px" },
    },
    bilingualCodeRow: {
        gridColumn: "1 / -1",
    },
    bilingualCell: {
        minWidth: 0,
        paddingBottom: "8px",
        borderBottom: "1px dashed var(--neutralQuaternaryAlt)",
    },
    sectionLabel: {
        margin: 0,
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--neutralSecondary)",
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
        "padding": "10px 0",
        "borderBottom": "1px dashed var(--neutralLight)",
        ":last-child": {
            borderBottom: "none",
        },
    },
    entryHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        flexWrap: "wrap",
    },
    entryQuickActions: {
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
    },
    returnBriefingPill: {
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: 60,
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.2)",
        borderRadius: "999px",
    },
})

const usageText = (tokens: number | null) =>
    tokens === null
        ? intl.get("ai.unknownTokens")
        : intl.get("ai.tokens", { n: tokens })

function resolveTranslatedHeader(targetLanguage: string): string {
    const trimmed = (targetLanguage || "").trim()
    if (!trimmed || /中文|汉语|简体|繁体|^zh\b|chinese/i.test(trimmed)) {
        return intl.get("ai.translated") || "译文"
    }
    return `译文（${trimmed}）`
}

function fallbackBilingualBlocks(
    originalText: string,
    translatedText: string
): BilingualBlock[] {
    const srcParts = (originalText || "")
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/)
        .map(s => s.trim())
        .filter(Boolean)
    const tgtParts = (translatedText || "")
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/)
        .map(s => s.trim())
        .filter(Boolean)
    const count = Math.max(srcParts.length, tgtParts.length)
    const rows: BilingualBlock[] = []
    for (let i = 0; i < count; i++) {
        const src = srcParts[i] || ""
        const tgt = tgtParts[i] || ""
        rows.push({
            source: src,
            target: tgt,
            isCode: /^```[\s\S]*```$/.test(src) && !tgt,
        })
    }
    return rows
}

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
    const [streamingText, setStreamingText] = useState("")
    const [chunkProgress, setChunkProgress] = useState<{
        index: number
        count: number
    } | null>(null)
    const [targetLanguage, setTargetLanguage] = useState("")
    const requestIdRef = useRef("")
    const cancelledRef = useRef(false)

    useEffect(() => {
        setKind(null)
        setExpanded(false)
        setResult(undefined)
        setCacheState({})
        setError("")
        setForceNonce(0)
        setCopied(false)
        setStreamingText("")
        setChunkProgress(null)
    }, [id])

    useEffect(() => {
        let active = true
        const loadState = () => {
            if (window.personal.aiArticleState) {
                void window.personal
                    .aiArticleState(id)
                    .then(s => {
                        if (active && s) setCacheState(s)
                    })
                    .catch(console.warn)
            }
            if (window.personal.aiSettings) {
                void window.personal
                    .aiSettings()
                    .then(cfg => {
                        if (active && cfg) {
                            setTargetLanguage(cfg.targetLanguage || "")
                        }
                    })
                    .catch(() => {})
            }
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
        const reqId =
            typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `ai_${Date.now()}_${Math.random().toString(36).slice(2)}`
        requestIdRef.current = reqId
        cancelledRef.current = false
        setBusy(true)
        setError("")
        setCopied(false)
        setStreamingText("")
        setChunkProgress(null)
        if (force) setResult(undefined)

        let zeroBasedSeen = false
        const offStream = window.personal.onAIStream
            ? window.personal.onAIStream(ev => {
                  if (!live || ev.requestId !== reqId) return
                  if (typeof ev.text === "string") {
                      setStreamingText(ev.text)
                  }
                  if (ev.chunkCount && ev.chunkCount > 1) {
                      const rawIdx = ev.chunkIndex ?? 0
                      if (rawIdx === 0) zeroBasedSeen = true
                      const displayIdx = zeroBasedSeen
                          ? Math.min(ev.chunkCount, rawIdx + 1)
                          : Math.min(ev.chunkCount, Math.max(1, rawIdx))
                      setChunkProgress({
                          index: displayIdx,
                          count: ev.chunkCount,
                      })
                  }
              })
            : undefined

        let settled = false
        void window.personal
            .aiGenerate(id, kind, force, reqId)
            .then(value => {
                settled = true
                if (live) {
                    setResult(value)
                    setStreamingText("")
                    setChunkProgress(null)
                    setCacheState(prev => ({
                        ...prev,
                        ...(kind === "summary"
                            ? { summary: value.text }
                            : kind === "translation"
                            ? {
                                  translation: value.text,
                                  original: value.original,
                                  blocks: value.blocks,
                              }
                            : {}),
                    }))
                }
            })
            .catch(e => {
                settled = true
                if (!live) return
                const msg = String(e)
                if (
                    cancelledRef.current ||
                    /abort|cancel|取消|已停止/i.test(msg)
                ) {
                    setError("")
                } else {
                    setError(msg)
                }
            })
            .finally(() => {
                if (live) {
                    setBusy(false)
                    setChunkProgress(null)
                }
            })

        return () => {
            live = false
            offStream?.()
            if (!settled) {
                void window.personal.aiCancel?.(reqId).catch(() => {})
            }
        }
    }, [id, kind, aiConfigured, forceNonce])

    const cancel = useCallback(() => {
        const reqId = requestIdRef.current
        if (!reqId) return
        cancelledRef.current = true
        void window.personal.aiCancel?.(reqId).catch(() => {})
        setBusy(false)
        setChunkProgress(null)
        setStreamingText(prev => {
            if (prev) {
                setResult(
                    cur =>
                        cur || {
                            text: prev,
                            tokens: null,
                            cached: false,
                        }
                )
            }
            return ""
        })
    }, [])

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
        if (busy && requestIdRef.current) {
            cancelledRef.current = true
            void window.personal
                .aiCancel?.(requestIdRef.current)
                .catch(() => {})
        }
        setKind(null)
        setExpanded(false)
    }, [busy])

    const copyResult = useCallback(() => {
        const text = result?.text || streamingText
        if (!text) return
        window.utils.writeClipboard(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
    }, [result, streamingText])

    return {
        aiConfigured,
        kind,
        result,
        streamingText,
        chunkProgress,
        targetLanguage,
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
        cancel,
        close,
        copyResult,
    }
}

export function AIArticleButtons({
    controller,
}: {
    controller: ReturnType<typeof useAIArticleController>
}) {
    const classes = useStyles()
    const { kind, cacheState, toggleKind } = controller
    const summaryOpen = kind === "summary"
    const summaryCached = Boolean(cacheState.summary)
    const translationOpen = kind === "translation"
    const translationCached = Boolean(cacheState.translation)

    return (
        <>
            <CommandBarButton
                title={
                    intl.get("ai.summary") +
                    (summaryCached && !summaryOpen ? " · 已有缓存" : "")
                }
                aria-pressed={summaryOpen}
                className={summaryOpen ? "active" : ""}
                iconProps={{ iconName: "TextDocument" }}
                onRenderIcon={() => (
                    <span className={classes.toolbarIconWrap}>
                        <Icon iconName="TextDocument" />
                        {summaryCached && !summaryOpen && (
                            <span
                                className={classes.cacheDot}
                                aria-hidden="true"
                            />
                        )}
                    </span>
                )}
                onClick={() => toggleKind("summary")}
            />
            <CommandBarButton
                title={
                    intl.get("ai.translation") +
                    (translationCached && !translationOpen ? " · 已有缓存" : "")
                }
                aria-pressed={translationOpen}
                className={translationOpen ? "active" : ""}
                iconProps={{ iconName: "LocaleLanguage" }}
                onRenderIcon={() => (
                    <span className={classes.toolbarIconWrap}>
                        <Icon iconName="LocaleLanguage" />
                        {translationCached && !translationOpen && (
                            <span
                                className={classes.cacheDot}
                                aria-hidden="true"
                            />
                        )}
                    </span>
                )}
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
        streamingText,
        chunkProgress,
        targetLanguage,
        busy,
        error,
        bilingual,
        setBilingual,
        expanded,
        setExpanded,
        copied,
        regenerate,
        cancel,
        close,
        copyResult,
    } = controller

    const alignedBlocks = useMemo(() => {
        if (kind !== "translation" || !bilingual || !result) return []
        if (result.blocks && result.blocks.length > 0) return result.blocks
        if (result.original) {
            return fallbackBilingualBlocks(result.original, result.text)
        }
        return []
    }, [kind, bilingual, result])

    if (!kind) return null
    const handleClose = onCloseRestoreFocus || close
    const textStyle: React.CSSProperties = {
        ...(fontSize ? { fontSize: `${fontSize}px` } : {}),
        ...(fontFamily ? { fontFamily } : {}),
    }

    const hasBilingualData = Boolean(
        result && (result.blocks?.length || result.original)
    )
    const hasOutput = Boolean(result?.text || streamingText)

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
                    {busy && chunkProgress && chunkProgress.count > 1
                        ? `正在处理第 ${chunkProgress.index} / ${chunkProgress.count} 段…`
                        : result
                        ? `${usageText(result.tokens)} · ${intl.get(
                              result.cached ? "ai.cached" : "ai.generated"
                          )}`
                        : ""}
                </span>
                {kind === "translation" && hasBilingualData && !busy && (
                    <DefaultButton onClick={() => setBilingual(v => !v)}>
                        {bilingual ? "仅看译文" : "双语对照"}
                    </DefaultButton>
                )}
                {hasOutput && (
                    <DefaultButton onClick={() => setExpanded(v => !v)}>
                        {expanded ? "退出全屏" : "全屏阅读"}
                    </DefaultButton>
                )}
                {hasOutput && (
                    <DefaultButton onClick={copyResult}>
                        {copied ? "已复制" : "复制"}
                    </DefaultButton>
                )}
                {busy ? (
                    <DefaultButton onClick={cancel}>停止生成</DefaultButton>
                ) : (
                    aiConfigured && (
                        <DefaultButton onClick={regenerate}>
                            {error ? intl.get("personal.retry") : "重新生成"}
                        </DefaultButton>
                    )
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
                    {busy && (
                        <div className={classes.row}>
                            <Spinner
                                size={SpinnerSize.small}
                                label={
                                    chunkProgress && chunkProgress.count > 1
                                        ? `正在处理第 ${chunkProgress.index} / ${chunkProgress.count} 段…`
                                        : intl.get("ai.working")
                                }
                                labelPosition="right"
                            />
                        </div>
                    )}
                    {error && (
                        <MessageBar messageBarType={MessageBarType.error}>
                            {intl.get("personal.failed")} {error}
                        </MessageBar>
                    )}
                    {busy && streamingText ? (
                        <AIMarkdown text={streamingText} style={textStyle} />
                    ) : (
                        result &&
                        (kind === "translation" &&
                        bilingual &&
                        alignedBlocks.length > 0 ? (
                            <div className={classes.bilingualStack}>
                                <div className={classes.bilingualRow}>
                                    <h4 className={classes.sectionLabel}>
                                        {intl.get("ai.original") || "原文"}
                                    </h4>
                                    <h4 className={classes.sectionLabel}>
                                        {resolveTranslatedHeader(
                                            targetLanguage
                                        )}
                                    </h4>
                                </div>
                                {alignedBlocks.map((block, idx) =>
                                    block.isCode ? (
                                        <div
                                            key={idx}
                                            className={
                                                classes.bilingualCodeRow
                                            }>
                                            {renderCodeSource(
                                                block.source || block.target,
                                                textStyle
                                            )}
                                        </div>
                                    ) : (
                                        <div
                                            key={idx}
                                            className={classes.bilingualRow}>
                                            <div
                                                className={
                                                    classes.bilingualCell
                                                }>
                                                <AIMarkdown
                                                    text={block.source}
                                                    style={textStyle}
                                                />
                                            </div>
                                            <div
                                                className={
                                                    classes.bilingualCell
                                                }>
                                                <AIMarkdown
                                                    text={block.target}
                                                    style={textStyle}
                                                />
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        ) : (
                            <AIMarkdown text={result.text} style={textStyle} />
                        ))
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

function inferProfileNameFromUrl(baseURL: string): string {
    const clean = (baseURL || "").trim().replace(/\/+$/, "")
    const preset = AI_PROVIDER_PRESETS.find(
        p => p.baseURL.replace(/\/+$/, "") === clean
    )
    if (preset) return preset.name
    try {
        return new URL(clean).host
    } catch {
        return ""
    }
}

export function AISettingsPanel() {
    const classes = useStyles()
    const [settings, setSettings] = useState<AISettings>()
    const [profileName, setProfileName] = useState("")
    const [creatingNew, setCreatingNew] = useState(false)
    const [models, setModels] = useState<string[]>([])
    const [fetchingModels, setFetchingModels] = useState(false)
    const [key, setKey] = useState("")
    const [removeKey, setRemoveKey] = useState(false)
    const [usage, setUsage] = useState<AIUsage>()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

    const applyLoadedSettings = useCallback((next: AISettings) => {
        setSettings(next)
        const active = next.profiles?.find(p => p.id === next.activeProfileId)
        setProfileName(active?.name || inferProfileNameFromUrl(next.baseURL))
        setCreatingNew(false)
    }, [])

    async function refreshUsage() {
        setUsage(await window.personal.aiUsage())
    }

    useEffect(() => {
        void window.personal
            .aiSettings()
            .then(applyLoadedSettings)
            .catch(e => setError(String(e)))
        void refreshUsage().catch(e => setError(String(e)))
        return window.personal.onChanged(
            () => void refreshUsage().catch(e => setError(String(e)))
        )
    }, [applyLoadedSettings])

    const modelOptions: IComboBoxOption[] = useMemo(() => {
        const set = new Set<string>(models)
        if (settings?.model) set.add(settings.model)
        if (settings?.summaryModel) set.add(settings.summaryModel)
        if (settings?.translateModel) set.add(settings.translateModel)
        return [...set].filter(Boolean).map(m => ({ key: m, text: m }))
    }, [
        models,
        settings?.model,
        settings?.summaryModel,
        settings?.translateModel,
    ])

    const optionalModelOptions: IComboBoxOption[] = useMemo(
        () => [{ key: "", text: "（留空跟随主模型）" }, ...modelOptions],
        [modelOptions]
    )

    async function handleSelectProfile(profileId: string) {
        if (!window.personal.aiSelectProfile) return
        setBusy(true)
        setError("")
        setMessage("")
        try {
            const next = await window.personal.aiSelectProfile(profileId)
            applyLoadedSettings(next)
            setKey("")
            setRemoveKey(false)
            setModels([])
            const active = next.profiles?.find(p => p.id === profileId)
            setMessage(`已切换到服务配置「${active?.name || profileId}」`)
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    function handleStartNewProfile() {
        if (!settings) return
        setCreatingNew(true)
        setProfileName("")
        setKey("")
        setRemoveKey(false)
        setModels([])
        setError("")
        setMessage("")
        setSettings({
            ...settings,
            baseURL: "",
            model: "",
            summaryModel: "",
            translateModel: "",
            hasKey: false,
        })
    }

    async function handleDeleteCurrentProfile() {
        if (
            !settings?.activeProfileId ||
            creatingNew ||
            !window.personal.aiDeleteProfile
        )
            return
        setBusy(true)
        setError("")
        setMessage("")
        try {
            const next = await window.personal.aiDeleteProfile(
                settings.activeProfileId
            )
            applyLoadedSettings(next)
            setKey("")
            setRemoveKey(false)
            setModels([])
            setMessage("已删除该服务配置")
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    function handleApplyPreset(presetKey: string) {
        if (!settings) return
        const preset = AI_PROVIDER_PRESETS.find(p => p.key === presetKey)
        if (!preset) return
        const matchesOtherPreset = AI_PROVIDER_PRESETS.some(
            p => p.name === profileName.trim()
        )
        if (!profileName.trim() || matchesOtherPreset) {
            setProfileName(preset.name)
        }
        setSettings({
            ...settings,
            baseURL: preset.baseURL,
            model: settings.model.trim() || preset.defaultModel,
        })
        setModels([])
    }

    async function handleFetchModels() {
        if (!settings?.baseURL || !window.personal.aiModels) return
        setFetchingModels(true)
        setError("")
        setMessage("")
        try {
            const fetched = await window.personal.aiModels(
                settings.baseURL,
                key || undefined,
                creatingNew ? undefined : settings.activeProfileId
            )
            setModels(fetched)
            if (fetched.length > 0 && !settings.model.trim()) {
                setSettings(prev =>
                    prev ? { ...prev, model: fetched[0] } : prev
                )
            }
            setMessage(
                fetched.length > 0
                    ? `已拉取 ${fetched.length} 个可用模型`
                    : "接口返回模型列表为空，可手动输入模型名"
            )
        } catch (e) {
            setError(String(e))
        } finally {
            setFetchingModels(false)
        }
    }

    async function save(test = false) {
        if (!settings) return
        setBusy(true)
        setError("")
        setMessage("")
        try {
            let next: AISettings
            if (window.personal.aiSaveProfile && settings.baseURL.trim()) {
                const resolvedName =
                    profileName.trim() ||
                    inferProfileNameFromUrl(settings.baseURL) ||
                    "默认配置"
                const afterProfile = await window.personal.aiSaveProfile(
                    {
                        id: creatingNew ? undefined : settings.activeProfileId,
                        name: resolvedName,
                        baseURL: settings.baseURL,
                        model: settings.model,
                        summaryModel: settings.summaryModel || "",
                        translateModel: settings.translateModel || "",
                    },
                    key || undefined,
                    removeKey
                )
                next = await window.personal.saveAI(
                    {
                        ...settings,
                        activeProfileId: afterProfile.activeProfileId,
                        summaryModel: settings.summaryModel || "",
                        translateModel: settings.translateModel || "",
                    },
                    undefined
                )
            } else {
                next = await window.personal.saveAI(
                    settings,
                    removeKey ? "" : key || undefined
                )
            }
            applyLoadedSettings(next)
            setKey("")
            setRemoveKey(false)
            if (test) {
                const result = await window.personal.testAI()
                setMessage(
                    intl.get("ai.connected") + " · " + usageText(result.tokens)
                )
                await refreshUsage()
            } else {
                setMessage(intl.get("personal.saved"))
            }
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }

    if (!settings) return error ? <MessageBar>{error}</MessageBar> : <Spinner />

    const matchedPreset = AI_PROVIDER_PRESETS.find(
        p =>
            p.baseURL.replace(/\/+$/, "") ===
            settings.baseURL.trim().replace(/\/+$/, "")
    )
    const profiles = settings.profiles || []

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

            <div
                className={classes.profilesBar}
                role="group"
                aria-label="已保存的 AI 服务配置">
                {profiles.map(p => {
                    const isActive =
                        !creatingNew && settings.activeProfileId === p.id
                    return (
                        <DefaultButton
                            key={p.id}
                            disabled={busy}
                            checked={isActive}
                            aria-pressed={isActive}
                            onClick={() => void handleSelectProfile(p.id)}>
                            {p.name || p.baseURL}
                        </DefaultButton>
                    )
                })}
                <DefaultButton
                    disabled={busy}
                    checked={creatingNew}
                    onClick={handleStartNewProfile}>
                    + 新建服务配置
                </DefaultButton>
                {!creatingNew && settings.activeProfileId && (
                    <DefaultButton
                        disabled={busy}
                        onClick={() => void handleDeleteCurrentProfile()}>
                        删除当前配置
                    </DefaultButton>
                )}
            </div>

            <div className={classes.formRow}>
                <div className={classes.grow}>
                    <Dropdown
                        label="服务商预设"
                        placeholder="选择常用服务商快速填入地址…"
                        selectedKey={matchedPreset?.key ?? null}
                        disabled={busy}
                        options={AI_PROVIDER_PRESETS.map(p => ({
                            key: p.key,
                            text: `${p.name} (${p.baseURL})`,
                        }))}
                        onChange={(_, o) =>
                            o && handleApplyPreset(String(o.key))
                        }
                    />
                </div>
                <div className={classes.grow}>
                    <TextField
                        label="配置名称"
                        placeholder="例如 DeepSeek 主力 / 本地 Ollama"
                        value={profileName}
                        disabled={busy}
                        onChange={(_, v) => setProfileName(v || "")}
                    />
                </div>
            </div>

            <TextField
                label={intl.get("ai.baseURL")}
                placeholder="https://api.openai.com/v1"
                value={settings.baseURL}
                onChange={(_, v) =>
                    setSettings({ ...settings, baseURL: v || "" })
                }
            />

            <div className={classes.formRow}>
                <div className={classes.grow}>
                    <ComboBox
                        label={intl.get("ai.model")}
                        ariaLabel={intl.get("ai.model")}
                        placeholder="例如 gpt-4o-mini、deepseek-chat"
                        allowFreeform
                        autoComplete="on"
                        text={settings.model}
                        options={modelOptions}
                        disabled={busy}
                        onChange={(_, option, __, value) =>
                            setSettings({
                                ...settings,
                                model: option
                                    ? String(option.key)
                                    : value ?? "",
                            })
                        }
                        onPendingValueChanged={(option, _, value) => {
                            if (value !== undefined) {
                                setSettings(prev =>
                                    prev ? { ...prev, model: value } : prev
                                )
                            } else if (option) {
                                setSettings(prev =>
                                    prev
                                        ? { ...prev, model: String(option.key) }
                                        : prev
                                )
                            }
                        }}
                    />
                </div>
                <DefaultButton
                    disabled={busy || fetchingModels || !settings.baseURL}
                    onClick={() => void handleFetchModels()}>
                    {fetchingModels ? "正在拉取…" : "拉取模型列表"}
                </DefaultButton>
            </div>

            <div className={classes.formRow}>
                <div className={classes.grow}>
                    <ComboBox
                        label="总结与简报专用模型（留空跟随主模型）"
                        placeholder="留空则使用主模型"
                        allowFreeform
                        autoComplete="on"
                        text={settings.summaryModel || ""}
                        options={optionalModelOptions}
                        disabled={busy}
                        onChange={(_, option, __, value) =>
                            setSettings({
                                ...settings,
                                summaryModel: option
                                    ? String(option.key)
                                    : value ?? "",
                            })
                        }
                        onPendingValueChanged={(option, _, value) => {
                            if (value !== undefined) {
                                setSettings(prev =>
                                    prev
                                        ? { ...prev, summaryModel: value }
                                        : prev
                                )
                            } else if (option) {
                                setSettings(prev =>
                                    prev
                                        ? {
                                              ...prev,
                                              summaryModel: String(option.key),
                                          }
                                        : prev
                                )
                            }
                        }}
                    />
                </div>
                <div className={classes.grow}>
                    <ComboBox
                        label="翻译专用模型（用于全文翻译与标题自动翻译，留空跟随主模型）"
                        placeholder="留空则使用主模型"
                        allowFreeform
                        autoComplete="on"
                        text={settings.translateModel || ""}
                        options={optionalModelOptions}
                        disabled={busy}
                        onChange={(_, option, __, value) =>
                            setSettings({
                                ...settings,
                                translateModel: option
                                    ? String(option.key)
                                    : value ?? "",
                            })
                        }
                        onPendingValueChanged={(option, _, value) => {
                            if (value !== undefined) {
                                setSettings(prev =>
                                    prev
                                        ? { ...prev, translateModel: value }
                                        : prev
                                )
                            } else if (option) {
                                setSettings(prev =>
                                    prev
                                        ? {
                                              ...prev,
                                              translateModel: String(
                                                  option.key
                                              ),
                                          }
                                        : prev
                                )
                            }
                        }}
                    />
                </div>
            </div>

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
                    disabled={
                        busy ||
                        !settings.baseURL.trim() ||
                        !(
                            settings.model.trim() ||
                            settings.summaryModel?.trim() ||
                            settings.translateModel?.trim()
                        )
                    }
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

function BriefingEntryQuickActions({ entryId }: { entryId: number }) {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const item = useAppSelector(s => s.items[entryId])
    const [pending, setPending] = useState(false)

    const toggleViaArchive = async (
        kind: "read" | "unread" | "later" | "unlater" | "star" | "unstar"
    ) => {
        setPending(true)
        try {
            const res = await window.personal.archiveApply([entryId], { kind })
            await dispatch(refreshArchive(res))
        } catch (err) {
            window.utils.showErrorBox(intl.get("personal.failed"), String(err))
        } finally {
            setPending(false)
        }
    }

    const handleReadToggle = () => {
        if (item) {
            dispatch(item.hasRead ? markUnread(item) : markRead(item))
        } else {
            void toggleViaArchive("read")
        }
    }

    const handleLaterToggle = () => {
        if (item) {
            void dispatch(
                updateItemMeta(item, { readLater: !item.readLater })
            ).catch(err =>
                window.utils.showErrorBox(
                    intl.get("personal.failed"),
                    String(err)
                )
            )
        } else {
            void toggleViaArchive("later")
        }
    }

    const handleStarToggle = () => {
        if (item) {
            dispatch(toggleStarred(item))
        } else {
            void toggleViaArchive("star")
        }
    }

    return (
        <span className={classes.entryQuickActions}>
            <IconButton
                disabled={pending}
                title={item?.hasRead ? "标为未读" : "标已读"}
                ariaLabel={item?.hasRead ? "标为未读" : "标已读"}
                iconProps={{
                    iconName: item?.hasRead ? "StatusCircleRing" : "RadioBtnOn",
                }}
                onClick={handleReadToggle}
            />
            <IconButton
                disabled={pending}
                title={item?.readLater ? "移出稍后读" : "稍后读"}
                ariaLabel={item?.readLater ? "移出稍后读" : "稍后读"}
                checked={Boolean(item?.readLater)}
                iconProps={{ iconName: "Clock" }}
                onClick={handleLaterToggle}
            />
            <IconButton
                disabled={pending}
                title={item?.starred ? "取消收藏" : "收藏"}
                ariaLabel={item?.starred ? "取消收藏" : "收藏"}
                checked={Boolean(item?.starred)}
                iconProps={{
                    iconName: item?.starred
                        ? "FavoriteStarFill"
                        : "FavoriteStar",
                }}
                onClick={handleStarToggle}
            />
        </span>
    )
}

export function Briefings() {
    const settingsOpen = useAppSelector(s => s.app.settings.display)
    const menuOpen = useAppSelector(s => s.app.menu)
    const activeItemId = useAppSelector(s => s.page.itemId)
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const [open, setOpen] = useState(false)
    const [canReturn, setCanReturn] = useState(false)
    const [rows, setRows] = useState<Briefing[]>([])
    const [selected, setSelected] = useState<Briefing>()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        const show = () => {
            setCanReturn(false)
            setOpen(true)
        }
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
                setSelected(prev =>
                    prev ? data.find(d => d.id === prev.id) || data[0] : data[0]
                )
            })
            .catch(e => setError(String(e)))
    }, [open])

    useEffect(() => {
        if (canReturn && activeItemId === null && !open) {
            setCanReturn(false)
        }
    }, [canReturn, activeItemId, open])

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
        <>
            {!open && canReturn && activeItemId !== null && (
                <div className={classes.returnBriefingPill}>
                    <PrimaryButton
                        onClick={() => {
                            setCanReturn(false)
                            setOpen(true)
                        }}>
                        ← 返回每日简报
                    </PrimaryButton>
                </div>
            )}
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
                                        {new Date(
                                            row.createdAt
                                        ).toLocaleString()}
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
                                                        <div
                                                            className={
                                                                classes.entryHeader
                                                            }>
                                                            <Link
                                                                onClick={async () => {
                                                                    setOpen(
                                                                        false
                                                                    )
                                                                    if (
                                                                        settingsOpen
                                                                    )
                                                                        await dispatch(
                                                                            exitSettings()
                                                                        )
                                                                    if (
                                                                        menuOpen &&
                                                                        !window.matchMedia(
                                                                            "(min-width: 1280px)"
                                                                        )
                                                                            .matches
                                                                    )
                                                                        dispatch(
                                                                            toggleMenu()
                                                                        )
                                                                    await dispatch(
                                                                        showItemFromId(
                                                                            entry.id
                                                                        )
                                                                    )
                                                                    setCanReturn(
                                                                        true
                                                                    )
                                                                }}>
                                                                <strong>
                                                                    {
                                                                        entry.title
                                                                    }
                                                                </strong>
                                                            </Link>
                                                            <BriefingEntryQuickActions
                                                                entryId={
                                                                    entry.id
                                                                }
                                                            />
                                                        </div>
                                                        <div
                                                            style={{
                                                                margin: "4px 0 6px",
                                                            }}>
                                                            <AIMarkdown
                                                                text={
                                                                    entry.summary
                                                                }
                                                            />
                                                        </div>
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
        </>
    )
}
