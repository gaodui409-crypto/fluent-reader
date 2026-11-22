import * as React from "react"
import intl from "react-intl-universal"
import { DefaultButton, Dropdown, Separator, TextField } from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { PersonalSettings } from "../../../personal-types"

const useStyles = makeStyles({
    panel: { display: "flex", flexDirection: "column", gap: "14px" },
    row: { display: "flex", alignItems: "end", gap: "12px", flexWrap: "wrap" },
    itemCard: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
        padding: "8px 12px",
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    grow: { flexGrow: 1, minWidth: "200px" },
    hint: { color: "var(--neutralSecondary)", margin: 0, lineHeight: "1.6" },
})

export const AccountsSection: React.FC<{
    site: string
    onSiteChange: (v: string) => void
    accounts: { host: string; count: number }[]
    onRefreshAccounts: () => void
    onLogin: () => void
    onClearAccount: (host: string) => void
    busy: boolean
}> = ({
    site,
    onSiteChange,
    accounts,
    onRefreshAccounts,
    onLogin,
    onClearAccount,
    busy,
}) => {
    const c = useStyles()
    return (
        <section id="personal-accounts" role="tabpanel" className={c.panel}>
            <Separator>{intl.get("personal.accounts")}</Separator>
            <div className={c.row}>
                <TextField
                    className={c.grow}
                    label={intl.get("personal.siteAddress")}
                    placeholder="https://example.com"
                    value={site}
                    onChange={(_, value) => onSiteChange(value || "")}
                />
                <DefaultButton
                    disabled={busy || !site.trim()}
                    onClick={onLogin}>
                    {intl.get("personal.login")}
                </DefaultButton>
                <DefaultButton disabled={busy} onClick={onRefreshAccounts}>
                    {intl.get("personal.refreshAccounts")}
                </DefaultButton>
            </div>
            <p className={c.hint}>{intl.get("personal.loginHint")}</p>
            {accounts.length === 0 ? (
                <small className={c.hint}>
                    当前还没有已保存的网站登录状态。
                </small>
            ) : (
                accounts.map(account => (
                    <div className={c.itemCard} key={account.host}>
                        <span className={c.grow}>
                            <strong>{account.host}</strong> · 已保存登录状态（
                            {account.count} 项 Cookie）
                        </span>
                        <DefaultButton
                            disabled={busy}
                            onClick={() => onClearAccount(account.host)}>
                            {intl.get("personal.clearAccount")}
                        </DefaultButton>
                    </div>
                ))
            )}
        </section>
    )
}

export const SiteRulesSection: React.FC<{
    settings: PersonalSettings
    host: string
    onHostChange: (v: string) => void
    mode: "direct" | "rendered" | "off"
    onModeChange: (v: "direct" | "rendered" | "off") => void
    container: string
    onContainerChange: (v: string) => void
    remove: string
    onRemoveChange: (v: string) => void
    onUpdateRules: (rules: PersonalSettings["siteRules"]) => void
}> = ({
    settings,
    host,
    onHostChange,
    mode,
    onModeChange,
    container,
    onContainerChange,
    remove,
    onRemoveChange,
    onUpdateRules,
}) => {
    const c = useStyles()
    const modeOptions = (["direct", "rendered", "off"] as const).map(key => ({
        key,
        text: intl.get("personal." + key),
    }))

    return (
        <section id="personal-siteRules" role="tabpanel" className={c.panel}>
            <Separator>{intl.get("personal.siteRules")}</Separator>
            <p className={c.hint}>
                若个别网站抓取全文不完整或混入广告、侧边栏，可在此按域名单独指定提取方式与网页元素规则。
            </p>
            <div className={c.row}>
                <TextField
                    className={c.grow}
                    label={intl.get("personal.host")}
                    placeholder="example.com"
                    value={host}
                    onChange={(_, value) => onHostChange(value || "")}
                />
                <Dropdown
                    label={intl.get("personal.fetchMode")}
                    selectedKey={mode}
                    options={modeOptions}
                    onChange={(_, value) =>
                        value &&
                        onModeChange(value.key as "direct" | "rendered" | "off")
                    }
                />
            </div>
            <div className={c.row}>
                <TextField
                    className={c.grow}
                    label={intl.get("personal.container")}
                    placeholder="例如 article, .post-body"
                    value={container}
                    onChange={(_, value) => onContainerChange(value || "")}
                />
                <TextField
                    className={c.grow}
                    label={intl.get("personal.removeSelector")}
                    placeholder="例如 .ads, .related-posts"
                    value={remove}
                    onChange={(_, value) => onRemoveChange(value || "")}
                />
            </div>
            <div>
                <DefaultButton
                    disabled={!host.trim()}
                    onClick={() => {
                        const cleanHost = host.trim().toLowerCase()
                        onUpdateRules([
                            ...settings.siteRules.filter(
                                rule => rule.host !== cleanHost
                            ),
                            { host: cleanHost, container, remove, mode },
                        ])
                        onHostChange("")
                        onContainerChange("")
                        onRemoveChange("")
                    }}>
                    {intl.get("personal.addSiteRule")}
                </DefaultButton>
            </div>
            {settings.siteRules.map(rule => (
                <div className={c.itemCard} key={rule.host}>
                    <span className={c.grow}>
                        <strong>{rule.host}</strong> ·{" "}
                        {intl.get("personal." + rule.mode)}
                        {rule.container ? ` · 正文：${rule.container}` : ""}
                        {rule.remove ? ` · 移除：${rule.remove}` : ""}
                    </span>
                    <DefaultButton
                        onClick={() => {
                            onHostChange(rule.host)
                            onModeChange(rule.mode)
                            onContainerChange(rule.container)
                            onRemoveChange(rule.remove)
                        }}>
                        {intl.get("edit")}
                    </DefaultButton>
                    <DefaultButton
                        onClick={() =>
                            onUpdateRules(
                                settings.siteRules.filter(
                                    r => r.host !== rule.host
                                )
                            )
                        }>
                        {intl.get("delete")}
                    </DefaultButton>
                </div>
            ))}
        </section>
    )
}
