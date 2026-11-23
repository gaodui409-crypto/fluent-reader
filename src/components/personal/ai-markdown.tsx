import * as React from "react"
import { useRef, useState } from "react"
import { makeStyles, mergeClasses } from "@griffel/react"

export interface AIProviderPreset {
    key: string
    name: string
    baseURL: string
    defaultModel: string
    local?: boolean
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
    {
        key: "deepseek",
        name: "DeepSeek",
        baseURL: "https://api.deepseek.com/v1",
        defaultModel: "deepseek-chat",
    },
    {
        key: "siliconflow",
        name: "硅基流动 SiliconFlow",
        baseURL: "https://api.siliconflow.cn/v1",
        defaultModel: "deepseek-ai/DeepSeek-V3",
    },
    {
        key: "dashscope",
        name: "通义千问百炼",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        defaultModel: "qwen-plus",
    },
    {
        key: "zhipu",
        name: "智谱 GLM",
        baseURL: "https://open.bigmodel.cn/api/paas/v4",
        defaultModel: "glm-4-flash",
    },
    {
        key: "moonshot",
        name: "Kimi Moonshot",
        baseURL: "https://api.moonshot.cn/v1",
        defaultModel: "moonshot-v1-8k",
    },
    {
        key: "volces",
        name: "火山方舟",
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        defaultModel: "",
    },
    {
        key: "openrouter",
        name: "OpenRouter",
        baseURL: "https://openrouter.ai/api/v1",
        defaultModel: "openai/gpt-4o-mini",
    },
    {
        key: "openai",
        name: "OpenAI",
        baseURL: "https://api.openai.com/v1",
        defaultModel: "gpt-4o-mini",
    },
    {
        key: "gemini",
        name: "Google Gemini",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        defaultModel: "gemini-2.5-flash",
    },
    {
        key: "groq",
        name: "Groq",
        baseURL: "https://api.groq.com/openai/v1",
        defaultModel: "llama-3.3-70b-versatile",
    },
    {
        key: "ollama",
        name: "Ollama 本地",
        baseURL: "http://127.0.0.1:11434/v1",
        defaultModel: "qwen2.5:7b",
        local: true,
    },
    {
        key: "lmstudio",
        name: "LM Studio 本地",
        baseURL: "http://127.0.0.1:1234/v1",
        defaultModel: "local-model",
        local: true,
    },
]

const useStyles = makeStyles({
    root: {
        userSelect: "text",
        lineHeight: "1.75",
        fontSize: "14px",
        overflowWrap: "anywhere",
        color: "var(--black)",
    },
    paragraph: {
        "margin": "0 0 0.75em",
        ":last-child": {
            marginBottom: 0,
        },
    },
    h1: {
        "fontSize": "1.22em",
        "fontWeight": 650,
        "lineHeight": "1.38",
        "margin": "0.9em 0 0.45em",
        ":first-child": { marginTop: 0 },
    },
    h2: {
        "fontSize": "1.12em",
        "fontWeight": 650,
        "lineHeight": "1.4",
        "margin": "0.85em 0 0.4em",
        ":first-child": { marginTop: 0 },
    },
    h3: {
        "fontSize": "1.04em",
        "fontWeight": 600,
        "lineHeight": "1.42",
        "margin": "0.8em 0 0.35em",
        ":first-child": { marginTop: 0 },
    },
    h4: {
        "fontSize": "0.98em",
        "fontWeight": 600,
        "lineHeight": "1.45",
        "margin": "0.7em 0 0.3em",
        ":first-child": { marginTop: 0 },
    },
    list: {
        "margin": "0 0 0.75em",
        "paddingInlineStart": "1.45em",
        ":last-child": {
            marginBottom: 0,
        },
    },
    listItem: {
        "marginBottom": "0.28em",
        ":last-child": {
            marginBottom: 0,
        },
    },
    blockquote: {
        margin: "0.65em 0",
        padding: "6px 12px",
        borderLeft: "3px solid var(--themePrimary)",
        backgroundColor: "var(--neutralLighter)",
        borderRadius: "0 6px 6px 0",
        color: "var(--neutralPrimary)",
    },
    inlineCode: {
        fontFamily: '"Cascadia Code", Consolas, Monaco, monospace',
        fontSize: "0.88em",
        backgroundColor: "var(--neutralLighter)",
        padding: "0.12em 0.36em",
        borderRadius: "4px",
    },
    codeWrap: {
        position: "relative",
        margin: "0.75em 0",
        border: "1px solid var(--neutralQuaternaryAlt)",
        borderRadius: "6px",
        backgroundColor: "var(--neutralLighter)",
        overflow: "hidden",
    },
    codeHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        padding: "4px 10px",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        fontSize: "12px",
    },
    codeLang: {
        fontFamily: '"Cascadia Code", Consolas, Monaco, monospace',
        fontSize: "11.5px",
        color: "var(--neutralSecondary)",
        textTransform: "lowercase",
        userSelect: "none",
    },
    copyGroup: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        marginInlineStart: "auto",
    },
    copyBtn: {
        "minInlineSize": "24px",
        "minBlockSize": "24px",
        "padding": "2px 8px",
        "border": "1px solid var(--neutralQuaternary)",
        "borderRadius": "4px",
        "backgroundColor": "var(--white)",
        "color": "var(--black)",
        "fontSize": "12px",
        "cursor": "pointer",
        ":hover": {
            border: "1px solid var(--themePrimary)",
            color: "var(--themePrimary)",
        },
        ":focus-visible": {
            outline: "2px solid var(--themePrimary)",
            outlineOffset: "2px",
        },
    },
    copyTip: {
        fontSize: "11.5px",
        color: "var(--neutralSecondary)",
        opacity: 0,
        pointerEvents: "none",
        transition: "opacity 0.15s ease",
    },
    copyTipVisible: {
        opacity: 1,
    },
    pre: {
        margin: 0,
        padding: "10px 12px",
        overflowX: "auto",
        whiteSpace: "pre",
        lineHeight: "1.55",
        fontFamily: '"Cascadia Code", Consolas, Monaco, monospace',
        fontSize: "0.88em",
    },
    link: {
        "color": "var(--themePrimary)",
        "textDecoration": "none",
        ":hover": {
            textDecoration: "underline",
        },
    },
    hr: {
        border: "none",
        borderTop: "1px solid var(--neutralQuaternaryAlt)",
        margin: "0.9em 0",
    },
})

export function AICodeBlock({
    code,
    lang = "",
    style,
}: {
    code: string
    lang?: string
    style?: React.CSSProperties
}) {
    const classes = useStyles()
    const [status, setStatus] = useState<"" | "copied" | "failed">("")
    const [tipText, setTipText] = useState("")
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined
    )

    const handleCopy = () => {
        clearTimeout(timerRef.current)
        try {
            window.utils.writeClipboard(code)
            setStatus("copied")
            setTipText("已复制")
        } catch {
            setStatus("failed")
            setTipText("复制失败")
        }
        timerRef.current = setTimeout(() => {
            setStatus("")
            setTipText("")
        }, 2000)
    }

    return (
        <div className={classes.codeWrap} style={style}>
            <div className={classes.codeHeader}>
                <span className={classes.codeLang}>{lang}</span>
                <span className={classes.copyGroup}>
                    <button
                        type="button"
                        className={classes.copyBtn}
                        aria-label="复制代码"
                        {...(status === "copied" ? { "data-copied": "" } : {})}
                        {...(status === "failed" ? { "data-failed": "" } : {})}
                        onClick={handleCopy}>
                        复制
                    </button>
                    <span
                        role="status"
                        className={mergeClasses(
                            classes.copyTip,
                            status !== "" && classes.copyTipVisible
                        )}>
                        {tipText}
                    </span>
                </span>
            </div>
            <pre className={classes.pre}>
                <code>{code}</code>
            </pre>
        </div>
    )
}

const INLINE_TOKEN_RE =
    /(`[^`\n]+`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+(?:\*(?!\*)[^*\n]*)*)\*\*|\*([^*\s\n][^*\n]*?)\*)/g

function renderInline(
    text: string,
    classes: ReturnType<typeof useStyles>,
    keyPrefix = ""
): React.ReactNode[] {
    if (!text) return []
    const nodes: React.ReactNode[] = []
    let lastIndex = 0
    let idx = 0
    INLINE_TOKEN_RE.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index))
        }
        const full = match[0]
        const key = `${keyPrefix}-${idx++}`
        if (full.startsWith("`")) {
            nodes.push(
                <code key={key} className={classes.inlineCode}>
                    {full.slice(1, -1)}
                </code>
            )
        } else if (match[2] !== undefined && match[3] !== undefined) {
            const label = match[2]
            const url = match[3]
            if (/^https?:\/\//i.test(url)) {
                nodes.push(
                    <a
                        key={key}
                        href={url}
                        className={classes.link}
                        onClick={e => {
                            e.preventDefault()
                            window.utils.openExternal(url, false)
                        }}>
                        {renderInline(label, classes, key)}
                    </a>
                )
            } else {
                nodes.push(full)
            }
        } else if (match[4] !== undefined) {
            nodes.push(
                <strong key={key}>
                    {renderInline(match[4], classes, key)}
                </strong>
            )
        } else if (match[5] !== undefined) {
            nodes.push(
                <em key={key}>{renderInline(match[5], classes, key)}</em>
            )
        } else {
            nodes.push(full)
        }
        lastIndex = match.index + full.length
    }

    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex))
    }
    return nodes
}

function stripFenceWrapper(raw: string): { lang: string; code: string } | null {
    const trimmed = raw.trim()
    const fence = /^```([A-Za-z0-9_+#.-]*)\r?\n([\s\S]*?)(?:\r?\n```)?$/.exec(
        trimmed
    )
    if (!fence) return null
    return { lang: fence[1] || "", code: fence[2] }
}

export function renderCodeSource(raw: string, style?: React.CSSProperties) {
    const unwrapped = stripFenceWrapper(raw)
    if (unwrapped) {
        return (
            <AICodeBlock
                code={unwrapped.code}
                lang={unwrapped.lang}
                style={style}
            />
        )
    }
    return <AICodeBlock code={raw} style={style} />
}

export const AIMarkdown: React.FC<{
    text: string
    style?: React.CSSProperties
    className?: string
}> = ({ text, style, className }) => {
    const classes = useStyles()
    if (!text) return null

    const lines = text.replace(/\r\n/g, "\n").split("\n")
    const blocks: React.ReactNode[] = []
    let i = 0
    let blockKey = 0

    while (i < lines.length) {
        const line = lines[i]

        // Fenced code block: ```lang ... ```
        const fenceOpen = /^\s*```([A-Za-z0-9_+#.-]*)\s*$/.exec(line)
        if (fenceOpen) {
            const lang = fenceOpen[1] || ""
            const codeLines: string[] = []
            i++
            while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
                codeLines.push(lines[i])
                i++
            }
            if (i < lines.length) i++ // consume closing ```
            blocks.push(
                <AICodeBlock
                    key={`b-${blockKey++}`}
                    lang={lang}
                    code={codeLines.join("\n")}
                />
            )
            continue
        }

        // Blank line
        if (!line.trim()) {
            i++
            continue
        }

        // Horizontal rule
        if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
            blocks.push(<hr key={`b-${blockKey++}`} className={classes.hr} />)
            i++
            continue
        }

        // Heading (# to ####)
        const headingMatch = /^\s*(#{1,4})\s+(.+?)\s*$/.exec(line)
        if (headingMatch) {
            const level = headingMatch[1].length
            const content = renderInline(
                headingMatch[2],
                classes,
                `h-${blockKey}`
            )
            const key = `b-${blockKey++}`
            if (level === 1) {
                blocks.push(
                    <h2 key={key} className={classes.h1}>
                        {content}
                    </h2>
                )
            } else if (level === 2) {
                blocks.push(
                    <h3 key={key} className={classes.h2}>
                        {content}
                    </h3>
                )
            } else if (level === 3) {
                blocks.push(
                    <h4 key={key} className={classes.h3}>
                        {content}
                    </h4>
                )
            } else {
                blocks.push(
                    <h5 key={key} className={classes.h4}>
                        {content}
                    </h5>
                )
            }
            i++
            continue
        }

        // Blockquote (> ...)
        if (/^\s*>\s?/.test(line)) {
            const quoteLines: string[] = []
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                quoteLines.push(lines[i].replace(/^\s*>\s?/, ""))
                i++
            }
            const key = `b-${blockKey++}`
            blocks.push(
                <blockquote key={key} className={classes.blockquote}>
                    {quoteLines.map((ql, qi) => (
                        <React.Fragment key={qi}>
                            {qi > 0 && <br />}
                            {renderInline(ql, classes, `${key}-${qi}`)}
                        </React.Fragment>
                    ))}
                </blockquote>
            )
            continue
        }

        // Unordered list (- / * / +)
        if (/^\s*[-*+]\s+/.test(line)) {
            const items: string[] = []
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*+]\s+/, ""))
                i++
            }
            const key = `b-${blockKey++}`
            blocks.push(
                <ul key={key} className={classes.list}>
                    {items.map((itemText, liIdx) => (
                        <li key={liIdx} className={classes.listItem}>
                            {renderInline(
                                itemText,
                                classes,
                                `${key}-li-${liIdx}`
                            )}
                        </li>
                    ))}
                </ul>
            )
            continue
        }

        // Ordered list (1. ...)
        const olFirst = /^\s*(\d+)\.\s+(.+)$/.exec(line)
        if (olFirst) {
            const startNum = Number(olFirst[1]) || 1
            const items: string[] = []
            while (i < lines.length) {
                const m = /^\s*\d+\.\s+(.+)$/.exec(lines[i])
                if (!m) break
                items.push(m[1])
                i++
            }
            const key = `b-${blockKey++}`
            blocks.push(
                <ol
                    key={key}
                    start={startNum !== 1 ? startNum : undefined}
                    className={classes.list}>
                    {items.map((itemText, liIdx) => (
                        <li key={liIdx} className={classes.listItem}>
                            {renderInline(
                                itemText,
                                classes,
                                `${key}-oli-${liIdx}`
                            )}
                        </li>
                    ))}
                </ol>
            )
            continue
        }

        // Paragraph (collect until blank line or block starter)
        const paraLines: string[] = []
        while (
            i < lines.length &&
            lines[i].trim() &&
            !/^\s*```/.test(lines[i]) &&
            !/^\s*#{1,4}\s+/.test(lines[i]) &&
            !/^\s*>\s?/.test(lines[i]) &&
            !/^\s*[-*+]\s+/.test(lines[i]) &&
            !/^\s*\d+\.\s+/.test(lines[i]) &&
            !/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(lines[i])
        ) {
            paraLines.push(lines[i])
            i++
        }
        const key = `b-${blockKey++}`
        blocks.push(
            <p key={key} className={classes.paragraph}>
                {paraLines.map((pl, pi) => (
                    <React.Fragment key={pi}>
                        {pi > 0 && <br />}
                        {renderInline(pl, classes, `${key}-p-${pi}`)}
                    </React.Fragment>
                ))}
            </p>
        )
    }

    return (
        <div className={mergeClasses(classes.root, className)} style={style}>
            {blocks}
        </div>
    )
}
