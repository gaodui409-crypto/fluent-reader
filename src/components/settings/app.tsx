import * as React from "react"
import { useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import {
    urlTest,
    byteToMB,
    calculateItemSize,
    getSearchEngineName,
} from "../../scripts/utils"
import { ThemeSettings, SearchEngines } from "../../schema-types"
import {
    getThemeSettings,
    setThemeSettings,
    exportAll,
} from "../../scripts/settings"
import {
    Button,
    Dropdown,
    Field,
    Input,
    Link,
    Option,
    RadioGroup,
    Radio,
    Switch,
    Text,
    tokens,
} from "@fluentui/react-components"
import { makeStyles, mergeClasses } from "@griffel/react"
import { DangerButton } from "../utils/DangerButton"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { saveReadingPreferences } from "../../scripts/models/reading"

type AppTabProps = {
    setLanguage: (option: string) => void
    setFetchInterval: (interval: number) => void
    deleteArticles: (days: number) => Promise<void>
    importAll: () => Promise<void>
}

const useStyles = makeStyles({
    root: { display: "flex", flexDirection: "column", gap: "16px" },
    row: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
    },
    section: { display: "flex", flexDirection: "column", gap: "6px" },
    proxyBox: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "12px 14px",
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    grow: { flex: 1, minWidth: "220px" },
    dropdown: { width: "220px", minWidth: 0 },
    cleanup: { width: "100%", minWidth: 0 },
    proxyHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
    },
    hint: { color: tokens.colorNeutralForeground3 },
    savedStatus: {
        fontSize: "12px",
        color: tokens.colorBrandForeground1,
    },
})

function isValidProxyAddress(value: string, mode: "direct" | "pac"): boolean {
    const trimmed = value.trim()
    if (!trimmed) return false
    if (mode === "direct") {
        return /^(?:(?:https?|socks5h?|socks4):\/\/)?(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+):\d{1,5}\/?$/i.test(
            trimmed
        )
    }
    return urlTest(trimmed) || /^(?:https?|file|data):\S+$/i.test(trimmed)
}

function AppTab({
    setLanguage,
    setFetchInterval,
    deleteArticles,
    importAll,
}: AppTabProps) {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const hoverSummary = useAppSelector(s => s.reading.hoverSummary)
    const [locale, setLocale] = useState(() =>
        window.settings.getLocaleSettings()
    )
    const [theme, setTheme] = useState(getThemeSettings)
    const [fetchInterval, setSelectedFetchInterval] = useState(() =>
        String(window.settings.getFetchInterval())
    )
    const [searchEngine, setSearchEngine] = useState(() =>
        window.settings.getSearchEngine()
    )
    const [proxyStatus, setProxyStatus] = useState(() =>
        window.settings.getProxyStatus()
    )
    const [proxyMode, setProxyMode] = useState<"direct" | "pac">(
        () => window.settings.getProxyMode?.() || "pac"
    )
    const [proxyUrl, setProxyUrl] = useState(
        () => window.settings.getProxy() || ""
    )
    const [proxyTouched, setProxyTouched] = useState(false)
    const [proxyNotice, setProxyNotice] = useState("")
    const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [itemSize, setItemSize] = useState<string>(null)
    const [cacheSize, setCacheSize] = useState<string>(null)
    const [deleteIndex, setDeleteIndex] = useState<string>(null)

    useEffect(() => {
        let active = true
        calculateItemSize().then(size => {
            if (active) setItemSize(byteToMB(size))
        })
        window.utils.getCacheSize().then(size => {
            if (active) setCacheSize(byteToMB(size))
        })
        return () => {
            active = false
            if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
        }
    }, [])

    const flashProxyNotice = (text: string) => {
        setProxyNotice(text)
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = setTimeout(() => {
            setProxyNotice("")
        }, 3000)
    }

    const languageOptions = [
        { value: "default", text: intl.get("followSystem") },
        { value: "de", text: "Deutsch" },
        { value: "en-US", text: "English" },
        { value: "es", text: "Español" },
        { value: "cs", text: "Čeština" },
        { value: "fr-FR", text: "Français" },
        { value: "it", text: "Italiano" },
        { value: "nl", text: "Nederlands" },
        { value: "pt-BR", text: "Português do Brasil" },
        { value: "pt-PT", text: "Português de Portugal" },
        { value: "sk-SK", text: "Slovenčina" },
        { value: "fi-FI", text: "Suomi" },
        { value: "sv", text: "Svenska" },
        { value: "tr", text: "Türkçe" },
        { value: "uk", text: "Українська" },
        { value: "ru", text: "Русский" },
        { value: "ko", text: "한글" },
        { value: "ja", text: "日本語" },
        { value: "zh-CN", text: "中文（简体）" },
        { value: "zh-TW", text: "中文（繁體）" },
    ]
    const fetchIntervalOptions = [0, 10, 15, 20, 30, 45, 60].map(minutes => ({
        value: String(minutes),
        text:
            minutes === 0
                ? intl.get("app.never")
                : minutes === 60
                ? intl.get("time.hour", { h: 1 })
                : intl.get("time.minute", { m: minutes }),
    }))
    const searchEngineOptions = [
        SearchEngines.Google,
        SearchEngines.Bing,
        SearchEngines.Baidu,
        SearchEngines.DuckDuckGo,
    ]
    const deleteOptions = [7, 14, 21, 28, 30, 90, 180, 365, 0].map(days => ({
        value: String(days),
        text: days
            ? intl.get("app.daysAgo", { days })
            : intl.get("app.deleteAll"),
    }))

    const validProxyUrl = isValidProxyAddress(proxyUrl, proxyMode)
    const proxyError =
        proxyTouched && proxyUrl.trim() && !validProxyUrl
            ? proxyMode === "direct"
                ? "请输入有效的代理地址（例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080）"
                : intl.get("app.badUrl")
            : ""

    async function toggleProxy() {
        window.settings.toggleProxyStatus()
        const nextStatus = window.settings.getProxyStatus()
        setProxyStatus(nextStatus)
        const storedUrl = window.settings.getProxy() || proxyUrl
        setProxyUrl(storedUrl)
        if (nextStatus) {
            await window.settings.setProxyMode?.(proxyMode)
            if (isValidProxyAddress(storedUrl, proxyMode)) {
                await window.settings.setProxy(storedUrl.trim())
                flashProxyNotice("✓ 网络代理已开启并即时生效（无需重启）")
            }
        } else {
            flashProxyNotice("✓ 已关闭网络代理（即时生效）")
        }
    }

    async function handleProxyModeChange(nextMode: "direct" | "pac") {
        setProxyMode(nextMode)
        setProxyTouched(false)
        await window.settings.setProxyMode?.(nextMode)
        if (isValidProxyAddress(proxyUrl, nextMode)) {
            await window.settings.setProxy(proxyUrl.trim())
            flashProxyNotice("✓ 代理模式已切换并即时生效")
        }
    }

    async function applyProxyAddress(event?: React.FormEvent) {
        event?.preventDefault()
        setProxyTouched(true)
        const trimmed = proxyUrl.trim()
        if (!trimmed) {
            await window.settings.setProxy("")
            flashProxyNotice("✓ 已清空代理地址（即时生效）")
            return
        }
        if (isValidProxyAddress(trimmed, proxyMode)) {
            await window.settings.setProxyMode?.(proxyMode)
            await window.settings.setProxy(trimmed)
            flashProxyNotice("✓ 代理地址已保存并即时生效（无需重启）")
        }
    }

    async function confirmDelete() {
        if (itemSize === null || deleteIndex === null) return
        setItemSize(null)
        await deleteArticles(Number(deleteIndex))
        setItemSize(byteToMB(await calculateItemSize()))
    }

    async function clearCache() {
        await window.utils.clearCache()
        setCacheSize(byteToMB(await window.utils.getCacheSize()))
    }

    return (
        <div className={mergeClasses("tab-body", classes.root)}>
            <Field label={intl.get("app.language")}>
                <Dropdown
                    inlinePopup
                    className={classes.dropdown}
                    selectedOptions={[locale]}
                    value={
                        languageOptions.find(option => option.value === locale)
                            ?.text || ""
                    }
                    onOptionSelect={(_, data) => {
                        if (!data.optionValue) return
                        setLocale(data.optionValue)
                        setLanguage(data.optionValue)
                    }}>
                    {languageOptions.map(option => (
                        <Option key={option.value} value={option.value}>
                            {option.text}
                        </Option>
                    ))}
                </Dropdown>
            </Field>

            <Switch
                label={intl.get("organize.hoverSummary")}
                checked={hoverSummary}
                onChange={(_, data) =>
                    void dispatch(
                        saveReadingPreferences({ hoverSummary: data.checked })
                    )
                }
            />
            <Field label={intl.get("app.theme")}>
                <RadioGroup
                    value={theme}
                    onChange={(_, data) => {
                        const value = data.value as ThemeSettings
                        setThemeSettings(value)
                        setTheme(value)
                    }}>
                    <Radio
                        value={ThemeSettings.Default}
                        label={intl.get("followSystem")}
                    />
                    <Radio
                        value={ThemeSettings.Light}
                        label={intl.get("app.lightTheme")}
                    />
                    <Radio
                        value={ThemeSettings.Dark}
                        label={intl.get("app.darkTheme")}
                    />
                </RadioGroup>
            </Field>

            <Field label={intl.get("app.fetchInterval")}>
                <Dropdown
                    inlinePopup
                    className={classes.dropdown}
                    selectedOptions={[fetchInterval]}
                    value={
                        fetchIntervalOptions.find(
                            option => option.value === fetchInterval
                        )?.text || ""
                    }
                    onOptionSelect={(_, data) => {
                        if (!data.optionValue) return
                        setSelectedFetchInterval(data.optionValue)
                        setFetchInterval(Number(data.optionValue))
                    }}>
                    {fetchIntervalOptions.map(option => (
                        <Option key={option.value} value={option.value}>
                            {option.text}
                        </Option>
                    ))}
                </Dropdown>
                <Text size={200}>{intl.get("refresh.settingsHelp")}</Text>
            </Field>

            <Field label={intl.get("searchEngine.name")}>
                <Dropdown
                    inlinePopup
                    className={classes.dropdown}
                    selectedOptions={[String(searchEngine)]}
                    value={getSearchEngineName(searchEngine)}
                    onOptionSelect={(_, data) => {
                        if (!data.optionValue) return
                        const value = Number(data.optionValue)
                        setSearchEngine(value)
                        window.settings.setSearchEngine(value)
                    }}>
                    {searchEngineOptions.map(engine => (
                        <Option key={engine} value={String(engine)}>
                            {getSearchEngineName(engine)}
                        </Option>
                    ))}
                </Dropdown>
            </Field>

            <div className={classes.proxyBox}>
                <div className={classes.proxyHeader}>
                    <Text weight="semibold">{intl.get("app.enableProxy")}</Text>
                    <div className={classes.row}>
                        {proxyNotice && (
                            <span
                                className={classes.savedStatus}
                                role="status"
                                aria-live="polite">
                                {proxyNotice}
                            </span>
                        )}
                        <Switch
                            aria-label={intl.get("app.enableProxy")}
                            checked={proxyStatus}
                            onChange={() => void toggleProxy()}
                        />
                    </div>
                </div>
                {proxyStatus && (
                    <form onSubmit={e => void applyProxyAddress(e)}>
                        <Field label="代理连接方式">
                            <RadioGroup
                                value={proxyMode}
                                onChange={(_, data) =>
                                    void handleProxyModeChange(
                                        data.value as "direct" | "pac"
                                    )
                                }>
                                <Radio
                                    value="direct"
                                    label="直连代理地址（HTTP / SOCKS5，如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080）"
                                />
                                <Radio
                                    value="pac"
                                    label="PAC 自动配置脚本链接"
                                />
                            </RadioGroup>
                        </Field>
                        <Field
                            validationState={proxyError ? "error" : "none"}
                            validationMessage={proxyError}
                            hint={
                                proxyMode === "direct"
                                    ? "修改失焦或点击应用后立即对所有订阅抓取、正文提取与 AI 请求生效，无需重启软件。"
                                    : "填写 PAC 脚本 URL 后失焦或点击应用立即生效，无需重启软件。"
                            }>
                            <div className={classes.row}>
                                <Input
                                    required
                                    className={classes.grow}
                                    spellCheck={false}
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    aria-label={
                                        proxyMode === "direct"
                                            ? "直连代理地址"
                                            : intl.get("app.pac")
                                    }
                                    placeholder={
                                        proxyMode === "direct"
                                            ? "http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                                            : intl.get("app.pac")
                                    }
                                    name="proxyUrl"
                                    value={proxyUrl}
                                    onChange={(_, data) => {
                                        const next = data.value
                                        setProxyUrl(next)
                                        if (
                                            proxyTouched &&
                                            isValidProxyAddress(next, proxyMode)
                                        ) {
                                            setProxyTouched(false)
                                        }
                                    }}
                                    onBlur={() => void applyProxyAddress()}
                                />
                                <Button disabled={!validProxyUrl} type="submit">
                                    应用代理
                                </Button>
                            </div>
                        </Field>
                    </form>
                )}
            </div>

            <Field
                label={intl.get("app.cleanup")}
                hint={
                    itemSize
                        ? `${intl.get("app.itemSize", {
                              size: itemSize,
                          })}（收藏、稍后读、有备注或已归入文件夹的文章将自动保留）`
                        : intl.get("app.calculatingSize")
                }>
                <div className={classes.row}>
                    <Dropdown
                        inlinePopup
                        className={mergeClasses(classes.grow, classes.cleanup)}
                        placeholder={intl.get("app.deleteChoices")}
                        selectedOptions={
                            deleteIndex === null ? [] : [deleteIndex]
                        }
                        value={
                            deleteOptions.find(
                                option => option.value === deleteIndex
                            )?.text || ""
                        }
                        onOptionSelect={(_, data) =>
                            setDeleteIndex(data.optionValue ?? null)
                        }>
                        {deleteOptions.map(option => (
                            <Option key={option.value} value={option.value}>
                                {option.text}
                            </Option>
                        ))}
                    </Dropdown>
                    <DangerButton
                        disabled={itemSize === null || deleteIndex === null}
                        text={intl.get("app.confirmDelete")}
                        onClick={confirmDelete}
                    />
                </div>
            </Field>
            <div className={classes.section}>
                <div className={classes.row}>
                    <Button
                        disabled={cacheSize === null || cacheSize === "0MB"}
                        onClick={clearCache}>
                        {intl.get("app.cache")}
                    </Button>
                </div>
                <Text size={200} className={classes.hint}>
                    {cacheSize
                        ? intl.get("app.cacheSize", { size: cacheSize })
                        : intl.get("app.calculatingSize")}
                </Text>
            </div>

            <div className={classes.section}>
                <Text weight="semibold">
                    轻量数据导入导出（.frdata，不含离线网页与加密密钥）
                </Text>
                <Text size={200} className={classes.hint}>
                    仅导出基础订阅配置与常规设置；如需连同文章正文、备注、文件夹与离线网页完整迁移，请前往{" "}
                    <Link
                        onClick={() =>
                            window.dispatchEvent(
                                new CustomEvent("open-personal-section", {
                                    detail: "backup",
                                })
                            )
                        }>
                        离线与备份
                    </Link>{" "}
                    使用全量 ZIP 打包备份。
                </Text>
                <div className={classes.row}>
                    <Button onClick={exportAll}>
                        {intl.get("app.backup")}
                    </Button>
                    <Button onClick={importAll}>
                        {intl.get("app.restore")}
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default AppTab
