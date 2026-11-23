import * as React from "react"
import { makeStyles, mergeClasses } from "@griffel/react"
import {
    Alert20Regular,
    Filter20Regular,
    Folder20Regular,
    Star20Regular,
} from "@fluentui/react-icons"
import { ArchiveRules } from "../personal/organize"

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
    },
    banner: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "12px 16px",
        borderRadius: "8px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    titleRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontWeight: 600,
        fontSize: "14px",
        color: "var(--black)",
    },
    icons: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        color: "var(--themePrimary)",
    },
    desc: {
        margin: 0,
        fontSize: "13px",
        lineHeight: "1.6",
        color: "var(--neutralSecondary)",
    },
})

const RulesTab: React.FC = () => {
    const classes = useStyles()

    return (
        <div className={mergeClasses("tab-body", classes.root)}>
            <div className={classes.banner}>
                <div className={classes.titleRow}>
                    <span className={classes.icons} aria-hidden="true">
                        <Filter20Regular />
                        <Folder20Regular />
                        <Star20Regular />
                        <Alert20Regular />
                    </span>
                    <span>自动规则中心</span>
                </div>
                <p className={classes.desc}>
                    所有新拉取文章与历史库内文章的自动化处理规则已统一整合在此：支持按关键词或正则表达式匹配，并执行归入文件夹、标为已读
                    / 收藏 / 稍后读 /
                    隐藏、标题高亮配色、桌面通知提醒与自动离线保存网页。
                </p>
            </div>
            <ArchiveRules />
        </div>
    )
}

export default RulesTab
