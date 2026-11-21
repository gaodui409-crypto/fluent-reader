import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    DefaultButton,
    PrimaryButton,
    TextField,
    Dropdown,
    MessageBar,
    ProgressIndicator,
    Stack,
    Separator,
    Checkbox,
} from "@fluentui/react"
import { AISettingsPanel } from "../personal/ai"
import { makeStyles, mergeClasses } from "@griffel/react"
import {
    defaultPersonalSettings,
    PersonalSettings,
    PersonalStatus,
} from "../../personal-types"

const useStyles = makeStyles({
    root: { display: "flex", flexDirection: "column", gap: "16px" },
    row: { display: "flex", alignItems: "end", gap: "12px", flexWrap: "wrap" },
    grow: { flexGrow: 1, minWidth: "200px" },
    hint: { color: "var(--neutralSecondary)", margin: 0 },
    navigation: {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        paddingBottom: "12px",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
    },
    panel: { display: "flex", flexDirection: "column", gap: "16px" },
})

export default function PersonalTab() {
    const classes = useStyles()
    const [section, setSection] = useState("accounts")
    const [settings, setSettings] = useState<PersonalSettings>(
        defaultPersonalSettings
    )
    const [status, setStatus] = useState<PersonalStatus>()
    const [message, setMessage] = useState("")
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    const [accounts, setAccounts] = useState<{ host: string; count: number }[]>(
        []
    )
    const [site, setSite] = useState("")
    const [host, setHost] = useState("")
    const [container, setContainer] = useState("")
    const [remove, setRemove] = useState("")
    const [mode, setMode] = useState<"direct" | "rendered" | "off">("direct")
    const options = (keys: string[]) =>
        keys.map(key => ({ key, text: intl.get("personal." + key) }))
    async function act(fn: () => Promise<unknown>) {
        setBusy(true)
        setError("")
        setMessage("")
        try {
            const result = await fn()
            if (result !== null && result !== false)
                setMessage(
                    typeof result === "string"
                        ? result
                        : intl.get("personal.saved")
                )
        } catch (error) {
            setError(String(error))
        } finally {
            setBusy(false)
        }
    }
    const update = <K extends keyof PersonalSettings>(
        key: K,
        value: PersonalSettings[K]
    ) => setSettings(current => ({ ...current, [key]: value }))
    useEffect(() => {
        window.personal
            .settings()
            .then(setSettings)
            .catch(error => setError(String(error)))
        window.personal
            .accounts()
            .then(setAccounts)
            .catch(error => setError(String(error)))
        const poll = () =>
            window.personal
                .status()
                .then(setStatus)
                .catch(error => setError(String(error)))
        void poll()
        const timer = setInterval(poll, 1000)
        return () => clearInterval(timer)
    }, [])
    return (
        <div className={mergeClasses("tab-body", classes.root)}>
            {error && (
                <MessageBar>
                    {intl.get("personal.failed")} {error}
                </MessageBar>
            )}
            {message && <MessageBar>{message}</MessageBar>}
            <div
                className={classes.navigation}
                role="tablist"
                aria-label={intl.get("organize.settingsSections")}>
                {[
                    "accounts",
                    "siteRules",
                    "offlineSave",
                    "ai",
                    "backup",
                    "search",
                    "network",
                    "health",
                    "shortcuts",
                ].map(key => (
                    <DefaultButton
                        key={key}
                        role="tab"
                        aria-selected={section === key}
                        aria-controls={"personal-" + key}
                        checked={section === key}
                        onClick={() => setSection(key)}>
                        {key === "ai"
                            ? intl.get("ai.settings")
                            : key === "health"
                            ? intl.get("health.title")
                            : intl.get("personal." + key)}
                    </DefaultButton>
                ))}
            </div>
            <PrimaryButton
                disabled={busy}
                onClick={() =>
                    void act(async () => {
                        setSettings(
                            await window.personal.saveSettings(settings)
                        )
                        return true
                    })
                }>
                {intl.get("personal.saveSettings")}
            </PrimaryButton>
            <section
                id="personal-search"
                role="tabpanel"
                className={classes.panel}
                style={{ display: section === "search" ? undefined : "none" }}>
                <Separator>{intl.get("personal.search")}</Separator>
                <div className={classes.row}>
                    <DefaultButton
                        onClick={() =>
                            window.dispatchEvent(new Event("personal-search"))
                        }>
                        {intl.get("personal.search")}
                    </DefaultButton>
                    <DefaultButton
                        disabled={status?.index.running}
                        onClick={() =>
                            void act(() => window.personal.rebuildIndex())
                        }>
                        {intl.get("personal.rebuild")}
                    </DefaultButton>
                </div>
                <p className={classes.hint}>
                    {intl.get("personal.searchShortcut")}
                </p>
                {status && (
                    <ProgressIndicator
                        label={intl.get("personal.indexProgress", {
                            done: status.index.indexed,
                            total: status.index.total,
                        })}
                        percentComplete={
                            status.index.total
                                ? status.index.indexed / status.index.total
                                : 1
                        }
                    />
                )}
                {status?.index.error && (
                    <MessageBar>{status.index.error}</MessageBar>
                )}
            </section>
            <section
                id="personal-offlineSave"
                role="tabpanel"
                className={classes.panel}
                style={{
                    display: section === "offlineSave" ? undefined : "none",
                }}>
                <Separator>{intl.get("personal.offlineSave")}</Separator>
                <div className={classes.row}>
                    <TextField
                        className={classes.grow}
                        readOnly
                        label={intl.get("personal.offlineFolder")}
                        value={
                            settings.offlineFolder ||
                            intl.get("personal.defaultOfflineFolder")
                        }
                    />
                    <DefaultButton
                        onClick={() =>
                            void act(async () => {
                                const folder =
                                    await window.personal.chooseFolder()
                                if (folder) update("offlineFolder", folder)
                                return null
                            })
                        }>
                        {intl.get("personal.chooseFolder")}
                    </DefaultButton>
                </div>
                <p className={classes.hint}>
                    {intl.get("personal.offlineHint")}
                </p>
                <Checkbox
                    checked={settings.removeLaterOnRead}
                    label={intl.get("personal.removeLaterOnRead")}
                    onChange={(_, checked) =>
                        update("removeLaterOnRead", checked)
                    }
                />
                {status?.offline
                    .slice()
                    .reverse()
                    .map(task => (
                        <div className={classes.row} key={task.id}>
                            <span className={classes.grow}>
                                {task.title} ·{" "}
                                {intl.get("personal." + task.state)}{" "}
                                {task.error}
                            </span>
                            {task.state === "failed" && (
                                <DefaultButton
                                    onClick={() =>
                                        void act(() =>
                                            window.personal.saveOffline(task.id)
                                        )
                                    }>
                                    {intl.get("personal.retry")}
                                </DefaultButton>
                            )}
                            {task.state === "done" && (
                                <DefaultButton
                                    onClick={() =>
                                        void act(() =>
                                            window.personal.openOffline(
                                                task.id,
                                                true
                                            )
                                        )
                                    }>
                                    {intl.get("personal.showFile")}
                                </DefaultButton>
                            )}
                        </div>
                    ))}
            </section>
            <section
                id="personal-shortcuts"
                role="tabpanel"
                className={classes.panel}
                style={{
                    display: section === "shortcuts" ? undefined : "none",
                }}>
                <Separator>{intl.get("personal.shortcuts")}</Separator>
                <p>{intl.get("personal.shortcutsHelp")}</p>
            </section>
            <section
                id="personal-backup"
                role="tabpanel"
                className={classes.panel}
                style={{ display: section === "backup" ? undefined : "none" }}>
                <Separator>{intl.get("personal.backup")}</Separator>
                <div className={classes.row}>
                    <TextField
                        className={classes.grow}
                        readOnly
                        label={intl.get("personal.backupFolder")}
                        value={settings.backupFolder}
                    />
                    <DefaultButton
                        onClick={() =>
                            void act(async () => {
                                const folder =
                                    await window.personal.chooseFolder()
                                if (folder) update("backupFolder", folder)
                                return null
                            })
                        }>
                        {intl.get("personal.chooseFolder")}
                    </DefaultButton>
                </div>
                <div className={classes.row}>
                    <Dropdown
                        label={intl.get("personal.schedule")}
                        options={options(["off", "daily", "weekly"])}
                        selectedKey={settings.backupSchedule}
                        onChange={(_, value) =>
                            update(
                                "backupSchedule",
                                value.key as PersonalSettings["backupSchedule"]
                            )
                        }
                    />
                    <TextField
                        type="number"
                        min={1}
                        max={100}
                        label={intl.get("personal.keep")}
                        value={String(settings.backupKeep)}
                        onChange={(_, value) =>
                            update("backupKeep", Number(value))
                        }
                    />
                </div>
                <div className={classes.row}>
                    <DefaultButton
                        disabled={busy || status?.backupRunning}
                        onClick={() =>
                            void act(async () => {
                                await window.personal.saveSettings(settings)
                                return window.personal.backup()
                            })
                        }>
                        {intl.get("personal.backupNow")}
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        onClick={() =>
                            void act(() => window.personal.restore())
                        }>
                        {intl.get("personal.restore")}
                    </DefaultButton>
                </div>
                <p className={classes.hint}>
                    {intl.get("personal.backupHint")}
                </p>
                {status?.backupError && (
                    <MessageBar>
                        {intl.get("personal.backupFailed")} {status.backupError}
                    </MessageBar>
                )}
            </section>
            <section
                id="personal-accounts"
                role="tabpanel"
                className={classes.panel}
                style={{
                    display: section === "accounts" ? undefined : "none",
                }}>
                <Separator>{intl.get("personal.accounts")}</Separator>
                <div className={classes.row}>
                    <TextField
                        className={classes.grow}
                        label={intl.get("personal.siteAddress")}
                        value={site}
                        onChange={(_, value) => setSite(value)}
                    />
                    <DefaultButton
                        disabled={busy || !site}
                        onClick={() =>
                            void act(() => window.personal.login(site))
                        }>
                        {intl.get("personal.login")}
                    </DefaultButton>
                    <DefaultButton
                        onClick={() =>
                            void act(async () => {
                                setAccounts(await window.personal.accounts())
                                return null
                            })
                        }>
                        {intl.get("personal.refreshAccounts")}
                    </DefaultButton>
                </div>
                <p className={classes.hint}>{intl.get("personal.loginHint")}</p>
                {accounts.map(account => (
                    <div className={classes.row} key={account.host}>
                        <span className={classes.grow}>
                            {account.host} ({account.count})
                        </span>
                        <DefaultButton
                            onClick={() =>
                                void act(async () => {
                                    await window.personal.clearAccount(
                                        account.host
                                    )
                                    setAccounts(
                                        await window.personal.accounts()
                                    )
                                    return true
                                })
                            }>
                            {intl.get("personal.clearAccount")}
                        </DefaultButton>
                    </div>
                ))}
            </section>
            <section
                id="personal-siteRules"
                role="tabpanel"
                className={classes.panel}
                style={{
                    display: section === "siteRules" ? undefined : "none",
                }}>
                <Separator>{intl.get("personal.siteRules")}</Separator>
                <TextField
                    label={intl.get("personal.host")}
                    placeholder="example.com"
                    value={host}
                    onChange={(_, value) => setHost(value)}
                />
                <Dropdown
                    label={intl.get("personal.fetchMode")}
                    selectedKey={mode}
                    options={options(["direct", "rendered", "off"])}
                    onChange={(_, value) => setMode(value.key as typeof mode)}
                />
                <div className={classes.row}>
                    <TextField
                        className={classes.grow}
                        label={intl.get("personal.container")}
                        value={container}
                        onChange={(_, value) => setContainer(value)}
                    />
                    <TextField
                        className={classes.grow}
                        label={intl.get("personal.removeSelector")}
                        value={remove}
                        onChange={(_, value) => setRemove(value)}
                    />
                </div>
                <DefaultButton
                    disabled={!host}
                    onClick={() => {
                        update("siteRules", [
                            ...settings.siteRules.filter(
                                rule => rule.host !== host
                            ),
                            { host, container, remove, mode },
                        ])
                        setHost("")
                        setContainer("")
                        setRemove("")
                    }}>
                    {intl.get("personal.addSiteRule")}
                </DefaultButton>
                {settings.siteRules.map(rule => (
                    <div className={classes.row} key={rule.host}>
                        <span className={classes.grow}>
                            {rule.host} · {intl.get("personal." + rule.mode)} ·{" "}
                            {rule.container}
                        </span>
                        <DefaultButton
                            onClick={() => {
                                setHost(rule.host)
                                setMode(rule.mode)
                                setContainer(rule.container)
                                setRemove(rule.remove)
                            }}>
                            {intl.get("edit")}
                        </DefaultButton>
                        <DefaultButton
                            onClick={() =>
                                update(
                                    "siteRules",
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
            <section
                id="personal-ai"
                role="tabpanel"
                style={{ display: section === "ai" ? undefined : "none" }}>
                <AISettingsPanel />
            </section>
            <section
                id="personal-health"
                role="tabpanel"
                className={classes.panel}
                style={{ display: section === "health" ? undefined : "none" }}>
                <Separator>{intl.get("health.title")}</Separator>
                <TextField
                    label={intl.get("discovery.rssHubAddress")}
                    value={settings.rssHub}
                    onChange={(_, v) => update("rssHub", v)}
                />
                <TextField
                    type="number"
                    min={1}
                    max={3650}
                    label={intl.get("health.staleDays")}
                    value={String(settings.staleDays)}
                    onChange={(_, v) => update("staleDays", Number(v))}
                />
            </section>
            <section
                id="personal-network"
                role="tabpanel"
                className={classes.panel}
                style={{ display: section === "network" ? undefined : "none" }}>
                <Separator>{intl.get("personal.network")}</Separator>
                <div className={classes.row}>
                    <TextField
                        type="number"
                        min={0}
                        max={3600}
                        label={intl.get("personal.domainInterval")}
                        value={String(settings.domainInterval)}
                        onChange={(_, value) =>
                            update("domainInterval", Number(value))
                        }
                    />
                    <TextField
                        type="number"
                        min={1}
                        max={8}
                        label={intl.get("personal.concurrency")}
                        value={String(settings.concurrency)}
                        onChange={(_, value) =>
                            update("concurrency", Number(value))
                        }
                    />
                </div>
                <p className={classes.hint}>
                    {intl.get("personal.networkHint")}
                </p>
                <Stack tokens={{ childrenGap: 6 }}>
                    {status?.tasks
                        .slice(-10)
                        .reverse()
                        .map(task => (
                            <small key={task.id}>
                                {task.host} ·{" "}
                                {intl.get("personal." + task.label)} ·{" "}
                                {intl.get("personal." + task.state)}{" "}
                                {task.error}
                            </small>
                        ))}
                </Stack>
            </section>
        </div>
    )
}
