import * as React from "react"
import { useEffect, useState } from "react"
import {
    Checkbox,
    DefaultButton,
    MessageBar,
    MessageBarType,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { ArchiveRule } from "../../../archive-types"
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
        minWidth: "160px",
    },
    ruleError: {
        color: "#d13438",
        width: "100%",
    },
})

export function ArchiveRules() {
    const c = useStyles()
    const [rules, setRules] = useState<ArchiveRule[]>([])
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
                <DefaultButton onClick={() => openOrganize()}>
                    新建归档规则
                </DefaultButton>
            </div>
            {rules.length === 0 && (
                <p
                    style={{
                        color: "var(--neutralSecondary)",
                        margin: "4px 0 12px",
                    }}>
                    暂无自动归档规则。可点击右上角「新建归档规则」（或按 F6
                    打开「筛选归档」），将常用条件保存为自动规则。
                </p>
            )}
            {rules.map(rule => (
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
                    </div>
                    <DefaultButton onClick={() => openOrganize(rule)}>
                        编辑 / 整理现有文章
                    </DefaultButton>
                    <DefaultButton
                        onClick={() =>
                            void run(() =>
                                window.personal.archiveDeleteRule(rule.id)
                            )
                        }>
                        删除规则
                    </DefaultButton>
                    {rule.error && (
                        <small className={c.ruleError}>{rule.error}</small>
                    )}
                </div>
            ))}
            {message && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {message}
                </MessageBar>
            )}
        </section>
    )
}
