import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import { Separator, Stack, TextField } from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { PersonalSettings, PersonalStatus } from "../../../personal-types"
import { normalizeHttpUrl } from "./usePersonalSettings"

const useStyles = makeStyles({
    panel: { display: "flex", flexDirection: "column", gap: "14px" },
    row: { display: "flex", alignItems: "end", gap: "12px", flexWrap: "wrap" },
    grow: { flexGrow: 1, minWidth: "240px" },
    hint: { color: "var(--neutralSecondary)", margin: 0, lineHeight: "1.6" },
    shortcutGrid: {
        "display": "grid",
        "gridTemplateColumns": "repeat(2, minmax(0, 1fr))",
        "gap": "16px",
        "@media (max-width: 640px)": {
            gridTemplateColumns: "1fr",
        },
    },
    shortcutGroup: {
        padding: "12px 14px",
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    shortcutRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
        padding: "5px 0",
        fontSize: "13px",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
    },
    kbd: {
        fontFamily: '"Cascadia Code", Consolas, monospace',
        fontSize: "12px",
        padding: "2px 6px",
        borderRadius: "4px",
        border: "1px solid var(--neutralQuaternary)",
        backgroundColor: "var(--white)",
        whiteSpace: "nowrap",
    },
})

export const NetworkSection: React.FC<{
    settings: PersonalSettings
    status?: PersonalStatus
    onChangeDomainInterval: (n: number, valid: boolean) => void
    onBlurDomainInterval: (clamped: number) => void
    onChangeConcurrency: (n: number, valid: boolean) => void
    onBlurConcurrency: (clamped: number) => void
}> = ({
    settings,
    status,
    onChangeDomainInterval,
    onBlurDomainInterval,
    onChangeConcurrency,
    onBlurConcurrency,
}) => {
    const c = useStyles()
    const q = status?.queueSummary

    const [intervalText, setIntervalText] = useState(
        String(settings.domainInterval)
    )
    const [intervalFocused, setIntervalFocused] = useState(false)
    const [concurrencyText, setConcurrencyText] = useState(
        String(settings.concurrency)
    )
    const [concurrencyFocused, setConcurrencyFocused] = useState(false)

    useEffect(() => {
        if (!intervalFocused) setIntervalText(String(settings.domainInterval))
    }, [settings.domainInterval, intervalFocused])

    useEffect(() => {
        if (!concurrencyFocused)
            setConcurrencyText(String(settings.concurrency))
    }, [settings.concurrency, concurrencyFocused])

    return (
        <section id="personal-network" className={c.panel}>
            <Separator>{intl.get("personal.network")}</Separator>
            <div className={c.row}>
                <TextField
                    type="number"
                    min={0}
                    max={3600}
                    label={intl.get("personal.domainInterval")}
                    value={intervalText}
                    onFocus={() => setIntervalFocused(true)}
                    onChange={(_, value) => {
                        const raw = value ?? ""
                        setIntervalText(raw)
                        const parsed = Number(raw)
                        if (
                            raw.trim() !== "" &&
                            Number.isFinite(parsed) &&
                            parsed >= 0 &&
                            parsed <= 3600
                        ) {
                            onChangeDomainInterval(parsed, true)
                        }
                    }}
                    onBlur={() => {
                        setIntervalFocused(false)
                        const parsed = Number(intervalText)
                        const clamped = Number.isFinite(parsed)
                            ? Math.min(3600, Math.max(0, parsed))
                            : settings.domainInterval
                        setIntervalText(String(clamped))
                        onBlurDomainInterval(clamped)
                    }}
                />
                <TextField
                    type="number"
                    min={1}
                    max={8}
                    label={intl.get("personal.concurrency")}
                    value={concurrencyText}
                    onFocus={() => setConcurrencyFocused(true)}
                    onChange={(_, value) => {
                        const raw = value ?? ""
                        setConcurrencyText(raw)
                        const parsed = Number(raw)
                        if (
                            raw.trim() !== "" &&
                            Number.isFinite(parsed) &&
                            parsed >= 1 &&
                            parsed <= 8
                        ) {
                            onChangeConcurrency(Math.round(parsed), true)
                        }
                    }}
                    onBlur={() => {
                        setConcurrencyFocused(false)
                        const parsed = Number(concurrencyText)
                        const clamped = Number.isFinite(parsed)
                            ? Math.min(8, Math.max(1, Math.round(parsed)))
                            : settings.concurrency
                        setConcurrencyText(String(clamped))
                        onBlurConcurrency(clamped)
                    }}
                />
            </div>
            <p className={c.hint}>{intl.get("personal.networkHint")}</p>
            {q && (q.running > 0 || q.waiting > 0 || q.failed > 0) && (
                <small className={c.hint}>
                    当前队列：处理中 {q.running} 项 · 排队中 {q.waiting} 项 ·
                    失败 {q.failed} 项
                </small>
            )}
            <Stack tokens={{ childrenGap: 6 }}>
                {status?.tasks
                    .slice(-10)
                    .reverse()
                    .map(task => (
                        <small key={task.id} style={{ lineHeight: "1.5" }}>
                            <strong>{task.host}</strong> ·{" "}
                            {intl.get("personal." + task.label)} ·{" "}
                            {task.state === "failed"
                                ? "失败"
                                : intl.get("personal." + task.state)}{" "}
                            {task.error && `（${task.error}）`}
                        </small>
                    ))}
            </Stack>
        </section>
    )
}

export const HealthSettingsSection: React.FC<{
    settings: PersonalSettings
    onChangeRssHub: (v: string, valid: boolean) => void
    onBlurRssHub: (normalized: string) => void
    onChangeStaleDays: (n: number, valid: boolean) => void
    onBlurStaleDays: (clamped: number) => void
}> = ({
    settings,
    onChangeRssHub,
    onBlurRssHub,
    onChangeStaleDays,
    onBlurStaleDays,
}) => {
    const c = useStyles()
    const [staleText, setStaleText] = useState(String(settings.staleDays))
    const [staleFocused, setStaleFocused] = useState(false)

    useEffect(() => {
        if (!staleFocused) setStaleText(String(settings.staleDays))
    }, [settings.staleDays, staleFocused])

    return (
        <section id="personal-health" className={c.panel}>
            <Separator>{intl.get("health.title")}参数</Separator>
            <p className={c.hint}>
                配置 RSSHub 实例基准地址（支持在添加订阅时直接输入{" "}
                <code>rsshub://...</code> 路由）与长期停更提醒阈值。
            </p>
            <div className={c.row}>
                <TextField
                    className={c.grow}
                    label={intl.get("discovery.rssHubAddress")}
                    placeholder="https://rsshub.app"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    value={settings.rssHub}
                    onChange={(_, v) => {
                        const val = v || ""
                        onChangeRssHub(
                            val,
                            /^https?:\/\/\S+$/i.test(val.trim())
                        )
                    }}
                    onBlur={() => {
                        const raw = settings.rssHub.trim()
                        const normalized = raw
                            ? normalizeHttpUrl(raw).replace(/\/+$/, "")
                            : "https://rsshub.app"
                        onBlurRssHub(normalized)
                    }}
                />
                <TextField
                    type="number"
                    min={1}
                    max={3650}
                    label={intl.get("health.staleDays")}
                    value={staleText}
                    onFocus={() => setStaleFocused(true)}
                    onChange={(_, v) => {
                        const raw = v ?? ""
                        setStaleText(raw)
                        const parsed = Number(raw)
                        if (
                            raw.trim() !== "" &&
                            Number.isFinite(parsed) &&
                            parsed >= 1 &&
                            parsed <= 3650
                        ) {
                            onChangeStaleDays(Math.round(parsed), true)
                        }
                    }}
                    onBlur={() => {
                        setStaleFocused(false)
                        const parsed = Number(staleText)
                        const clamped = Number.isFinite(parsed)
                            ? Math.min(3650, Math.max(1, Math.round(parsed)))
                            : settings.staleDays || 30
                        setStaleText(String(clamped))
                        onBlurStaleDays(clamped)
                    }}
                />
            </div>
        </section>
    )
}

export const ShortcutsSection: React.FC = () => {
    const c = useStyles()
    const globalShortcuts: [string, string][] = [
        ["F1", "展开 / 收起侧边栏"],
        ["F2", "当前列表筛选搜索"],
        ["Ctrl + Shift + F", "全局全文搜索（支持 ↑ / ↓ / Enter 选篇）"],
        ["F5", "立即刷新订阅"],
        ["F6", "打开筛选归档面板"],
        ["F7 / F8 / F9", "消息通知 / 视图切换 / 选项"],
        ["Space（卡片列表）", "勾选 / 取消勾选当前卡片"],
        ["Shift + 点击选择", "连续多选文章卡片"],
    ]
    const readingShortcuts: [string, string][] = [
        ["J / →", "下一篇文章"],
        ["K / ←", "上一篇文章"],
        ["Space / Shift + Space", "正文向下 / 向上翻页"],
        ["M / S / R", "已读切换 / 收藏 / 稍后读"],
        ["N", "展开或收起文章备注与归类"],
        ["W / L", "切换抓取全文 / 内置网页"],
        ["O / B", "在系统浏览器打开原文"],
        ["H / Esc", "隐藏当前文章 / 关闭阅读或弹窗"],
    ]

    return (
        <section id="personal-shortcuts" className={c.panel}>
            <Separator>{intl.get("personal.shortcuts")}</Separator>
            <div className={c.shortcutGrid}>
                <div className={c.shortcutGroup}>
                    <h4 style={{ margin: "0 0 8px" }}>导航与批量整理</h4>
                    {globalShortcuts.map(([keys, desc]) => (
                        <div key={keys} className={c.shortcutRow}>
                            <span>{desc}</span>
                            <kbd className={c.kbd}>{keys}</kbd>
                        </div>
                    ))}
                </div>
                <div className={c.shortcutGroup}>
                    <h4 style={{ margin: "0 0 8px" }}>单篇沉浸阅读</h4>
                    {readingShortcuts.map(([keys, desc]) => (
                        <div key={keys} className={c.shortcutRow}>
                            <span>{desc}</span>
                            <kbd className={c.kbd}>{keys}</kbd>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
