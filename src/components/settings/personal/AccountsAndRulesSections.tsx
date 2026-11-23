import * as React from "react"
import { useState } from "react"
import intl from "react-intl-universal"
import {
    DefaultButton,
    Dropdown,
    MessageBar,
    MessageBarType,
    PrimaryButton,
    Separator,
    TextField,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import {
    ExtractionPreview,
    PersonalSettings,
    SiteExtractionRule,
    WebAccountInfo,
} from "../../../personal-types"
import { extractHost, normalizeHttpUrl } from "./usePersonalSettings"

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
    badgeSubscribed: {
        display: "inline-block",
        fontSize: "11px",
        lineHeight: "1.4",
        padding: "1px 6px",
        marginLeft: "6px",
        borderRadius: "4px",
        border: "1px solid var(--themePrimary)",
        color: "var(--themePrimary)",
    },
    badgeExplicit: {
        display: "inline-block",
        fontSize: "11px",
        lineHeight: "1.4",
        padding: "1px 6px",
        marginLeft: "6px",
        borderRadius: "4px",
        border: "1px solid var(--neutralSecondary)",
        color: "var(--neutralSecondary)",
    },
    details: {
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        padding: "8px 12px",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    summary: {
        cursor: "pointer",
        fontSize: "13px",
        color: "var(--neutralPrimary)",
        userSelect: "none",
    },
    detailsBody: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        marginTop: "10px",
    },
    previewBox: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "12px 14px",
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    previewResult: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "10px 12px",
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternary)",
        backgroundColor: "var(--white)",
    },
    previewSnippet: {
        margin: 0,
        fontSize: "13px",
        lineHeight: "1.65",
        color: "var(--neutralPrimaryAlt)",
        overflowWrap: "anywhere",
    },
})

function extractPreviewSnippet(html: string): string {
    if (!html) return ""
    try {
        const doc = new DOMParser().parseFromString(html, "text/html")
        const raw = (doc.body?.textContent || "").replace(/\s+/g, " ").trim()
        return raw.length > 360 ? raw.slice(0, 360) + "…" : raw
    } catch {
        return ""
    }
}

export const AccountsSection: React.FC<{
    site: string
    onSiteChange: (v: string) => void
    accounts: WebAccountInfo[]
    onRefreshAccounts: () => void
    onLogin: (normalizedUrl: string) => void
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

    const primaryAccounts = accounts
        .filter(a => a.explicit || a.subscribed || a.count > 1)
        .sort((a, b) => {
            const scoreA = (a.explicit ? 2 : 0) + (a.subscribed ? 1 : 0)
            const scoreB = (b.explicit ? 2 : 0) + (b.subscribed ? 1 : 0)
            if (scoreB !== scoreA) return scoreB - scoreA
            return b.count - a.count
        })

    const otherAccounts = accounts.filter(
        a => !a.explicit && !a.subscribed && a.count <= 1
    )

    const renderAccountRow = (account: WebAccountInfo) => (
        <div className={c.itemCard} key={account.host}>
            <span className={c.grow}>
                <strong>{account.host}</strong>
                {account.subscribed && (
                    <span className={c.badgeSubscribed}>已订阅站点</span>
                )}
                {account.explicit && (
                    <span className={c.badgeExplicit}>手动登录</span>
                )}{" "}
                · 已保存登录状态（{account.count} 项 Cookie）
            </span>
            <DefaultButton
                disabled={busy}
                onClick={() => onClearAccount(account.host)}>
                {intl.get("personal.clearAccount")}
            </DefaultButton>
        </div>
    )

    return (
        <section id="personal-accounts" className={c.panel}>
            <Separator>{intl.get("personal.accounts")}</Separator>
            <form
                className={c.row}
                onSubmit={e => {
                    e.preventDefault()
                    if (site.trim() && !busy) {
                        onLogin(normalizeHttpUrl(site))
                    }
                }}>
                <TextField
                    className={c.grow}
                    label={intl.get("personal.siteAddress")}
                    placeholder="https://example.com"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    value={site}
                    onChange={(_, value) => onSiteChange(value || "")}
                />
                <PrimaryButton type="submit" disabled={busy || !site.trim()}>
                    {intl.get("personal.login")}
                </PrimaryButton>
                <DefaultButton
                    type="button"
                    disabled={busy}
                    onClick={onRefreshAccounts}>
                    {intl.get("personal.refreshAccounts")}
                </DefaultButton>
            </form>
            <p className={c.hint}>{intl.get("personal.loginHint")}</p>
            {accounts.length === 0 ? (
                <small className={c.hint}>
                    当前还没有已保存的网站登录状态。
                </small>
            ) : (
                <>
                    {primaryAccounts.map(renderAccountRow)}
                    {otherAccounts.length > 0 && (
                        <details className={c.details}>
                            <summary className={c.summary}>
                                其他缓存站点 Cookie（{otherAccounts.length} 个）
                            </summary>
                            <div className={c.detailsBody}>
                                {otherAccounts.map(renderAccountRow)}
                            </div>
                        </details>
                    )}
                </>
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
    testUrl: string
    onTestUrlChange: (v: string) => void
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
    testUrl,
    onTestUrlChange,
    onUpdateRules,
}) => {
    const c = useStyles()
    const [previewBusy, setPreviewBusy] = useState(false)
    const [previewError, setPreviewError] = useState("")
    const [previewResult, setPreviewResult] =
        useState<ExtractionPreview | null>(null)

    const modeOptions = (["direct", "rendered", "off"] as const).map(key => ({
        key,
        text: intl.get("personal." + key),
    }))

    const handleHostInput = (raw: string) => {
        const val = raw || ""
        if (
            /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(val.trim()) ||
            val.includes("/")
        ) {
            const extracted = extractHost(val)
            onHostChange(extracted)
            if (!testUrl.trim() && /^https?:\/\/[^/]+\/.+/i.test(val.trim())) {
                onTestUrlChange(val.trim())
            }
        } else {
            onHostChange(val)
        }
    }

    const runPreview = async (e?: React.FormEvent) => {
        e?.preventDefault()
        const normalizedUrl = normalizeHttpUrl(testUrl)
        if (!normalizedUrl) return
        setPreviewBusy(true)
        setPreviewError("")
        setPreviewResult(null)
        try {
            const effectiveHost =
                extractHost(host) || extractHost(normalizedUrl)
            const draftRule: Partial<SiteExtractionRule> = {
                host: effectiveHost,
                container: container.trim(),
                remove: remove.trim(),
                mode,
            }
            const result = await window.personal.previewExtraction(
                normalizedUrl,
                draftRule
            )
            setPreviewResult(result)
            if (!host.trim() && effectiveHost) {
                onHostChange(effectiveHost)
            }
        } catch (err) {
            setPreviewError(String(err))
        } finally {
            setPreviewBusy(false)
        }
    }

    const saveCurrentRule = () => {
        const cleanHost = extractHost(host)
        if (!cleanHost) return
        onUpdateRules([
            ...settings.siteRules.filter(rule => rule.host !== cleanHost),
            {
                host: cleanHost,
                container: container.trim(),
                remove: remove.trim(),
                mode,
            },
        ])
        onHostChange("")
        onContainerChange("")
        onRemoveChange("")
    }

    const previewSnippet = previewResult
        ? extractPreviewSnippet(previewResult.html)
        : ""

    return (
        <section id="personal-siteRules" className={c.panel}>
            <Separator>{intl.get("personal.siteRules")}</Separator>
            <p className={c.hint}>
                若个别网站抓取全文不完整或混入广告、侧边栏，可在此按域名单独指定提取方式与网页元素规则；添加或删除规则将立即自动保存生效。
            </p>
            <div className={c.row}>
                <TextField
                    className={c.grow}
                    label={intl.get("personal.host")}
                    placeholder="example.com（粘贴完整文章链接将自动提取域名）"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    value={host}
                    onChange={(_, value) => handleHostInput(value || "")}
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
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    value={container}
                    onChange={(_, value) => onContainerChange(value || "")}
                />
                <TextField
                    className={c.grow}
                    label={intl.get("personal.removeSelector")}
                    placeholder="例如 .ads, .related-posts"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    value={remove}
                    onChange={(_, value) => onRemoveChange(value || "")}
                />
            </div>
            <div className={c.row}>
                <PrimaryButton
                    disabled={!extractHost(host)}
                    onClick={saveCurrentRule}>
                    {settings.siteRules.some(r => r.host === extractHost(host))
                        ? "更新站点规则"
                        : intl.get("personal.addSiteRule")}
                </PrimaryButton>
            </div>

            <div className={c.previewBox}>
                <form className={c.row} onSubmit={runPreview}>
                    <TextField
                        className={c.grow}
                        label="输入文章链接测试提取效果"
                        placeholder="https://example.com/post/1"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="none"
                        value={testUrl}
                        onChange={(_, value) => onTestUrlChange(value || "")}
                    />
                    <DefaultButton
                        type="submit"
                        disabled={previewBusy || !testUrl.trim()}>
                        {previewBusy ? "正在提取…" : "测试提取"}
                    </DefaultButton>
                </form>
                {previewError && (
                    <MessageBar messageBarType={MessageBarType.error}>
                        {intl.get("personal.failed")} {previewError}
                    </MessageBar>
                )}
                {previewResult && (
                    <div className={c.previewResult}>
                        <div>
                            <strong>
                                {previewResult.title || "（未识别标题）"}
                            </strong>{" "}
                            · 正文字数：{previewResult.textLength} 字
                        </div>
                        {previewResult.textLength > 0 ? (
                            <p className={c.previewSnippet}>{previewSnippet}</p>
                        ) : (
                            <small className={c.hint}>
                                未提取到有效正文，可尝试将提取方式切换为「渲染网页提取」或调整正文选择器。
                            </small>
                        )}
                    </div>
                )}
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
