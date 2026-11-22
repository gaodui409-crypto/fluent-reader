import * as React from "react"
import intl from "react-intl-universal"
import {
    DefaultButton,
    MessageBar,
    MessageBarType,
    PrimaryButton,
} from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { AISettingsPanel } from "../personal/ai"
import { usePersonalSettings } from "./personal/usePersonalSettings"
import {
    AccountsSection,
    SiteRulesSection,
} from "./personal/AccountsAndRulesSections"
import {
    BackupSection,
    OfflineSaveSection,
    SearchIndexSection,
} from "./personal/ContentAndBackupSections"
import {
    HealthSettingsSection,
    NetworkSection,
    ShortcutsSection,
} from "./personal/NetworkHealthShortcutsSections"

const useStyles = makeStyles({
    root: { display: "flex", flexDirection: "column", gap: "16px" },
    navigation: {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        paddingBottom: "12px",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
    },
    saveBar: {
        position: "sticky",
        top: 0,
        zIndex: 2,
        backgroundColor: "var(--white)",
        paddingTop: "6px",
        paddingBottom: "8px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
    },
    dirtyHint: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
    },
})

const SECTION_KEYS = [
    "accounts",
    "siteRules",
    "offlineSave",
    "ai",
    "backup",
    "search",
    "network",
    "health",
    "shortcuts",
] as const

export default function PersonalTab() {
    const classes = useStyles()
    const s = usePersonalSettings()

    return (
        <div className={mergeClasses("tab-body", classes.root)}>
            {s.error && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {intl.get("personal.failed")} {s.error}
                </MessageBar>
            )}
            {s.message && (
                <MessageBar messageBarType={MessageBarType.success}>
                    {s.message}
                </MessageBar>
            )}
            <div
                className={classes.navigation}
                role="tablist"
                aria-label={intl.get("organize.settingsSections")}>
                {SECTION_KEYS.map(key => (
                    <DefaultButton
                        key={key}
                        role="tab"
                        aria-selected={s.section === key}
                        aria-controls={"personal-" + key}
                        checked={s.section === key}
                        onClick={() => s.setSection(key)}>
                        {key === "ai"
                            ? intl.get("ai.settings")
                            : key === "health"
                            ? intl.get("health.title")
                            : intl.get("personal." + key)}
                    </DefaultButton>
                ))}
            </div>

            {s.needsSaveBar && (
                <div className={classes.saveBar}>
                    <PrimaryButton
                        disabled={s.busy}
                        onClick={() => void s.saveAllSettings()}>
                        {intl.get("personal.saveSettings")}
                    </PrimaryButton>
                    {s.dirty && (
                        <span className={classes.dirtyHint}>
                            有未保存的修改，点击「保存设置」后生效
                        </span>
                    )}
                </div>
            )}

            {s.section === "accounts" && (
                <AccountsSection
                    site={s.site}
                    onSiteChange={s.setSite}
                    accounts={s.accounts}
                    busy={s.busy}
                    onLogin={() =>
                        void s.act(() => window.personal.login(s.site))
                    }
                    onRefreshAccounts={() =>
                        void s.act(async () => {
                            s.setAccounts(await window.personal.accounts())
                            return null
                        })
                    }
                    onClearAccount={host =>
                        void s.act(async () => {
                            await window.personal.clearAccount(host)
                            s.setAccounts(await window.personal.accounts())
                            return true
                        })
                    }
                />
            )}

            {s.section === "siteRules" && (
                <SiteRulesSection
                    settings={s.settings}
                    host={s.host}
                    onHostChange={s.setHost}
                    mode={s.mode}
                    onModeChange={s.setMode}
                    container={s.container}
                    onContainerChange={s.setContainer}
                    remove={s.remove}
                    onRemoveChange={s.setRemove}
                    onUpdateRules={rules => s.update("siteRules", rules)}
                />
            )}

            {s.section === "offlineSave" && (
                <OfflineSaveSection
                    settings={s.settings}
                    status={s.status}
                    busy={s.busy}
                    onChooseFolder={() =>
                        void s.act(async () => {
                            const folder = await window.personal.chooseFolder()
                            if (folder) s.update("offlineFolder", folder)
                            return null
                        })
                    }
                    onToggleRemoveLater={checked =>
                        s.update("removeLaterOnRead", checked)
                    }
                    onRetryTask={id =>
                        void s.act(() => window.personal.saveOffline(id))
                    }
                    onShowFile={id =>
                        void s.act(() => window.personal.openOffline(id, true))
                    }
                />
            )}

            {s.section === "ai" && (
                <section id="personal-ai" role="tabpanel">
                    <AISettingsPanel />
                </section>
            )}

            {s.section === "backup" && (
                <BackupSection
                    settings={s.settings}
                    status={s.status}
                    busy={s.busy}
                    onChooseFolder={() =>
                        void s.act(async () => {
                            const folder = await window.personal.chooseFolder()
                            if (folder) s.update("backupFolder", folder)
                            return null
                        })
                    }
                    onChangeSchedule={schedule =>
                        s.update("backupSchedule", schedule)
                    }
                    onChangeKeep={keep => s.update("backupKeep", keep)}
                    onBackupNow={() =>
                        void s.act(async () => {
                            const saved = await window.personal.saveSettings(
                                s.settings
                            )
                            s.replaceSavedSettings(saved)
                            return window.personal.backup()
                        })
                    }
                    onRestore={() =>
                        void s.act(() => window.personal.restore())
                    }
                />
            )}

            {s.section === "search" && (
                <SearchIndexSection
                    status={s.status}
                    busy={s.busy}
                    onRebuild={() =>
                        void s.act(() => window.personal.rebuildIndex())
                    }
                />
            )}

            {s.section === "network" && (
                <NetworkSection
                    settings={s.settings}
                    status={s.status}
                    onChangeDomainInterval={n => s.update("domainInterval", n)}
                    onChangeConcurrency={n => s.update("concurrency", n)}
                />
            )}

            {s.section === "health" && (
                <HealthSettingsSection
                    settings={s.settings}
                    onChangeRssHub={v => s.update("rssHub", v)}
                    onChangeStaleDays={n => s.update("staleDays", n)}
                />
            )}

            {s.section === "shortcuts" && <ShortcutsSection />}
        </div>
    )
}
