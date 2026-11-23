import * as React from "react"
import { useEffect, useState } from "react"
import {
    Checkbox,
    DefaultButton,
    MessageBar,
    MessageBarType,
    PrimaryButton,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import {
    ArchiveRule,
    ArticleFolder,
    summarizeArchiveConditions,
} from "../../../archive-types"
import { useAppSelector } from "../../../scripts/reducer"
import { RSSSource } from "../../../scripts/models/source"
import { SourceGroup } from "../../../schema-types"
import { folderLabel, useFolders } from "../folders"
import { openOrganize } from "./useOrganizeState"

const useStyles = makeStyles({
    root: {
        marginBottom: "20px",
    },
    headerRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        marginBottom: "8px",
    },
    ruleRow: {
        display: "flex",
        gap: "10px",
        alignItems: "center",
        flexWrap: "wrap",
        padding: "10px 12px",
        marginBottom: "8px",
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    ruleGrow: {
        flexGrow: 1,
        minWidth: "200px",
        display: "grid",
        gap: "4px",
    },
    subtitle: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
        lineHeight: "1.45",
        paddingInlineStart: "28px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap",
    },
    colorDot: {
        display: "inline-block",
        width: "9px",
        height: "9px",
        borderRadius: "999px",
        verticalAlign: "middle",
    },
    ruleError: {
        color: "#d13438",
        width: "100%",
        paddingInlineStart: "28px",
    },
})

const FIELD_NAMES: Record<string, string> = {
    full: "标题及正文",
    title: "标题",
    body: "正文",
    author: "作者",
    link: "链接",
}

const ACTION_NAMES: Record<string, string> = {
    hide: "隐藏匹配文章",
    restore: "恢复到订阅流",
    read: "标为已读",
    unread: "标为未读",
    star: "加入收藏",
    unstar: "取消收藏",
    later: "加入稍后读",
    unlater: "移出稍后读",
    highlight: "仅高亮颜色",
    notify: "发送系统通知",
    offline: "自动保存离线网页",
}

function summarizeRule(
    rule: ArchiveRule,
    sources: Record<number, RSSSource>,
    groups: SourceGroup[],
    folders: ArticleFolder[]
): string {
    const q = rule.query
    let scopeLabel = "全部文章"
    if (q.gid !== undefined) {
        const g = groups.find(item => item.gid === q.gid)
        scopeLabel = `分组：${g?.name || "#" + q.gid}`
    } else if (q.sids && q.sids.length > 0) {
        const first = sources[q.sids[0]]?.name || `源 #${q.sids[0]}`
        scopeLabel =
            q.sids.length === 1 ? first : `${first} 等 ${q.sids.length} 个源`
    }

    const fieldText = FIELD_NAMES[q.field] || "正文"
    const conds: string[] = []
    if (q.conditions || q.legacyFilter) {
        conds.push(summarizeArchiveConditions(q))
    } else if (q.regex !== undefined) {
        conds.push(`${fieldText}匹配正则 /${q.regex}/`)
    } else if (q.include.trim()) {
        conds.push(
            `${fieldText}包含「${q.include.trim()}」${
                q.all ? "（全部命中）" : ""
            }`
        )
    }
    if (q.exclude.trim()) {
        conds.push(`排除「${q.exclude.trim()}」`)
    }
    if (q.readState === "unread") conds.push("仅未读")
    else if (q.readState === "read") conds.push("仅已读")
    if (q.unfolderedOnly) conds.push("仅未归入文件夹")
    if (q.starredOnly) conds.push("仅收藏")

    const condLabel = conds.length > 0 ? conds.join(" · ") : "任意新文章"

    const act = rule.action
    const actionParts: string[] = []
    if (act.kind === "folder") {
        const f = folders.find(item => item.id === act.folderId)
        const fName = f ? folderLabel(f, folders) : "指定文件夹"
        actionParts.push(
            `归入「${fName}」${act.feedHidden ? "（隐藏订阅流）" : ""}`
        )
    } else {
        actionParts.push(
            act.kind === "notify" && act.notify === false
                ? "禁止系统通知"
                : act.kind === "offline" && act.autoOffline === false
                ? "禁止自动离线"
                : ACTION_NAMES[act.kind] || act.kind
        )
    }
    if (act.highlight && act.kind !== "highlight") {
        actionParts.push("高亮颜色")
    }
    if (act.notify !== undefined && act.kind !== "notify") {
        actionParts.push(act.notify ? "发送通知" : "禁止系统通知")
    }
    if (act.autoOffline !== undefined && act.kind !== "offline") {
        actionParts.push(act.autoOffline ? "自动离线保存" : "禁止自动离线")
    }

    return `[${scopeLabel}] ${condLabel} → ${actionParts.join(" ＋ ")}`
}

export function ArchiveRules() {
    const c = useStyles()
    const sources = useAppSelector(s => s.sources)
    const groups = useAppSelector(s => s.groups)
    const { folders } = useFolders()
    const [rules, setRules] = useState<ArchiveRule[]>([])
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [message, setMessage] = useState("")

    useEffect(() => {
        let active = true
        const load = () =>
            window.personal
                .archiveRules()
                .then(r => {
                    if (active) setRules(r)
                })
                .catch(e => {
                    if (active) setMessage(String(e))
                })
        void load()
        const off = window.personal.onChanged(() => void load())
        return () => {
            active = false
            off()
        }
    }, [])

    useEffect(() => {
        if (!confirmDeleteId) return
        const timer = setTimeout(() => setConfirmDeleteId(null), 4000)
        return () => clearTimeout(timer)
    }, [confirmDeleteId])

    const run = async (fn: () => Promise<unknown>) => {
        try {
            await fn()
            setMessage("")
        } catch (e) {
            setMessage(String(e))
        }
    }

    return (
        <section className={c.root}>
            <div className={c.headerRow}>
                <h3 style={{ margin: 0 }}>自动归档规则</h3>
                <PrimaryButton onClick={() => openOrganize()}>
                    ＋ 新建自动规则
                </PrimaryButton>
            </div>
            {rules.length === 0 && (
                <p
                    style={{
                        color: "var(--neutralSecondary)",
                        margin: "4px 0 12px",
                    }}>
                    暂无自动归档规则。可点击右上角「＋ 新建自动规则」（或按 F6
                    打开「筛选归档」），将常用条件保存为自动规则。
                </p>
            )}
            {rules.map(rule => {
                const summary = summarizeRule(rule, sources, groups, folders)
                const confirming = confirmDeleteId === rule.id
                return (
                    <div key={rule.id} className={c.ruleRow}>
                        <div className={c.ruleGrow}>
                            <Checkbox
                                label={rule.name}
                                checked={rule.enabled}
                                onChange={(_, v) =>
                                    void run(() =>
                                        window.personal.archiveSaveRule({
                                            ...rule,
                                            enabled: !!v,
                                        })
                                    )
                                }
                            />
                            <div className={c.subtitle}>
                                {rule.action.highlight && (
                                    <span
                                        className={c.colorDot}
                                        style={{
                                            backgroundColor:
                                                rule.action.highlight,
                                        }}
                                        title={`高亮颜色 ${rule.action.highlight}`}
                                    />
                                )}
                                <span>{summary}</span>
                            </div>
                        </div>
                        <DefaultButton onClick={() => openOrganize(rule)}>
                            编辑 / 整理现有文章
                        </DefaultButton>
                        {confirming ? (
                            <>
                                <PrimaryButton
                                    onClick={() => {
                                        setConfirmDeleteId(null)
                                        void run(() =>
                                            window.personal.archiveDeleteRule(
                                                rule.id
                                            )
                                        )
                                    }}>
                                    确认删除？
                                </PrimaryButton>
                                <DefaultButton
                                    onClick={() => setConfirmDeleteId(null)}>
                                    取消
                                </DefaultButton>
                            </>
                        ) : (
                            <DefaultButton
                                onClick={() => setConfirmDeleteId(rule.id)}>
                                删除规则
                            </DefaultButton>
                        )}
                        {rule.error && (
                            <small className={c.ruleError}>{rule.error}</small>
                        )}
                    </div>
                )
            })}
            {message && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {message}
                </MessageBar>
            )}
        </section>
    )
}
