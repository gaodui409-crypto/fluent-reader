import * as React from "react"
import intl from "react-intl-universal"
import { Separator, Stack, TextField } from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { PersonalSettings, PersonalStatus } from "../../../personal-types"

const useStyles = makeStyles({
    panel: { display: "flex", flexDirection: "column", gap: "14px" },
    row: { display: "flex", alignItems: "end", gap: "12px", flexWrap: "wrap" },
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
    onChangeDomainInterval: (n: number) => void
    onChangeConcurrency: (n: number) => void
}> = ({ settings, status, onChangeDomainInterval, onChangeConcurrency }) => {
    const c = useStyles()
    const q = status?.queueSummary

    return (
        <section id="personal-network" role="tabpanel" className={c.panel}>
            <Separator>{intl.get("personal.network")}</Separator>
            <div className={c.row}>
                <TextField
                    type="number"
                    min={0}
                    max={3600}
                    label={intl.get("personal.domainInterval")}
                    value={String(settings.domainInterval)}
                    onChange={(_, value) =>
                        onChangeDomainInterval(Number(value))
                    }
                />
                <TextField
                    type="number"
                    min={1}
                    max={8}
                    label={intl.get("personal.concurrency")}
                    value={String(settings.concurrency)}
                    onChange={(_, value) => onChangeConcurrency(Number(value))}
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
    onChangeRssHub: (v: string) => void
    onChangeStaleDays: (n: number) => void
}> = ({ settings, onChangeRssHub, onChangeStaleDays }) => {
    const c = useStyles()
    return (
        <section id="personal-health" role="tabpanel" className={c.panel}>
            <Separator>{intl.get("health.title")}</Separator>
            <p className={c.hint}>
                可在「选项 → 订阅源 → 订阅健康」中查看各订阅源近 30
                天的点开率、连续失败次数及网址变更提醒。
            </p>
            <TextField
                label={intl.get("discovery.rssHubAddress")}
                placeholder="https://docs.rsshub.app"
                value={settings.rssHub}
                onChange={(_, v) => onChangeRssHub(v || "")}
            />
            <TextField
                type="number"
                min={1}
                max={3650}
                label={intl.get("health.staleDays")}
                value={String(settings.staleDays)}
                onChange={(_, v) => onChangeStaleDays(Number(v))}
            />
        </section>
    )
}

export const ShortcutsSection: React.FC = () => {
    const c = useStyles()
    const globalShortcuts: [string, string][] = [
        ["F1", "展开 / 收起侧边栏"],
        ["F2", "当前列表筛选搜索"],
        ["Ctrl + Shift + F", "全局全文搜索（含正文与备注）"],
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
        <section id="personal-shortcuts" role="tabpanel" className={c.panel}>
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
