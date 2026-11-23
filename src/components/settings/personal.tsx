import * as React from "react"
import intl from "react-intl-universal"
import { MessageBar, MessageBarType } from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { AISettingsPanel } from "../personal/ai"
import { SourceHealthPanel } from "../personal/subscriptions"
import {
    usePersonalSettings,
    PersonalPrefillRequest,
} from "./personal/usePersonalSettings"
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
} from "./personal/NetworkHealthShortcutsSections"

export type PersonalSectionMode =
    | "health"
    | "ai"
    | "accounts"
    | "network"
    | "backup"

export type { PersonalPrefillRequest }

const useStyles = makeStyles({
    root: { display: "flex", flexDirection: "column", gap: "20px" },
    statusRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        minHeight: "20px",
        marginBottom: "-12px",
    },
    autoSaveBadge: {
        fontSize: "12px",
        lineHeight: "20px",
        padding: "0 8px",
        borderRadius: "4px",
        color: "var(--themePrimary)",
        backgroundColor: "var(--neutralLighterAlt)",
        border: "1px solid var(--neutralQuaternaryAlt)",
        transition: "opacity 0.18s ease",
        userSelect: "none",
    },
    autoSaveHidden: {
        opacity: 0,
        pointerEvents: "none",
    },
})

export default function PersonalTab({
    section = "accounts",
    prefill,
}: {
    section?: PersonalSectionMode
    prefill?: PersonalPrefillRequest
}) {
    const classes = useStyles()
    const s = usePersonalSettings(section, prefill)

    const showStatusSlot = section !== "ai"

    return (
        <div className={mergeClasses("tab-body", classes.root)}>
            {showStatusSlot && (
                <div
                    className={classes.statusRow}
                    role="status"
                    aria-live="polite">
                    <span
                        className={mergeClasses(
                            classes.autoSaveBadge,
                            s.autoSaveState === "idle" && classes.autoSaveHidden
                        )}>
                        {s.autoSaveState === "saving"
                            ? "正在保存…"
                            : "✓ 已自动保存"}
                    </span>
                </div>
            )}

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

            {section === "accounts" && (
                <>
                    <AccountsSection
                        site={s.site}
                        onSiteChange={s.setSite}
                        accounts={s.accounts}
                        busy={s.busy}
                        onLogin={normalizedUrl =>
                            void s.act(async () => {
                                await window.personal.login(normalizedUrl)
                                s.setAccounts(await window.personal.accounts())
                                return null
                            })
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
                                return "✓ 已清除该站点登录状态"
                            })
                        }
                    />
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
                        testUrl={s.testUrl}
                        onTestUrlChange={s.setTestUrl}
                        onUpdateRules={rules =>
                            void s.saveImmediate({ siteRules: rules })
                        }
                    />
                </>
            )}

            {section === "backup" && (
                <>
                    <BackupSection
                        settings={s.settings}
                        status={s.status}
                        busy={s.busy}
                        onChooseFolder={() =>
                            void s.act(async () => {
                                const folder =
                                    await window.personal.chooseFolder()
                                if (folder) {
                                    await s.saveImmediate({
                                        backupFolder: folder,
                                    })
                                }
                                return null
                            })
                        }
                        onOpenBackupFolder={() =>
                            void s.act(async () => {
                                await window.personal.openPath(
                                    s.settings.backupFolder
                                )
                                return null
                            })
                        }
                        onChangeSchedule={schedule =>
                            void s.saveImmediate({ backupSchedule: schedule })
                        }
                        onChangeKeep={(keep, valid) =>
                            s.updateDraft("backupKeep", keep, valid)
                        }
                        onBlurKeep={clamped =>
                            s.flushDraft({ backupKeep: clamped })
                        }
                        onBackupNow={() =>
                            void s.act(async () => {
                                s.flushDraft()
                                const archivePath =
                                    await window.personal.backup()
                                await s.refreshSettings()
                                return archivePath
                            })
                        }
                        onRestore={() =>
                            void s.act(() => window.personal.restore())
                        }
                    />
                    <OfflineSaveSection
                        settings={s.settings}
                        status={s.status}
                        busy={s.busy}
                        onChooseFolder={() =>
                            void s.act(async () => {
                                const folder =
                                    await window.personal.chooseFolder()
                                if (folder) {
                                    await s.saveImmediate({
                                        offlineFolder: folder,
                                    })
                                }
                                return null
                            })
                        }
                        onOpenOfflineFolder={() =>
                            void s.act(async () => {
                                await window.personal.openPath(
                                    s.settings.offlineFolder
                                )
                                return null
                            })
                        }
                        onToggleRemoveLater={checked =>
                            void s.saveImmediate({ removeLaterOnRead: checked })
                        }
                        onRetryTask={id =>
                            void s.act(() => window.personal.saveOffline(id))
                        }
                        onShowFile={id =>
                            void s.act(() =>
                                window.personal.openOffline(id, true)
                            )
                        }
                    />
                    <SearchIndexSection
                        status={s.status}
                        busy={s.busy}
                        onRebuild={() =>
                            void s.act(() => window.personal.rebuildIndex())
                        }
                    />
                </>
            )}

            {section === "ai" && (
                <section id="personal-ai">
                    <AISettingsPanel />
                </section>
            )}

            {section === "network" && (
                <NetworkSection
                    settings={s.settings}
                    status={s.status}
                    onChangeDomainInterval={(n, valid) =>
                        s.updateDraft("domainInterval", n, valid)
                    }
                    onBlurDomainInterval={clamped =>
                        s.flushDraft({ domainInterval: clamped })
                    }
                    onChangeConcurrency={(n, valid) =>
                        s.updateDraft("concurrency", n, valid)
                    }
                    onBlurConcurrency={clamped =>
                        s.flushDraft({ concurrency: clamped })
                    }
                />
            )}

            {section === "health" && (
                <>
                    <HealthSettingsSection
                        settings={s.settings}
                        onChangeRssHub={(v, valid) =>
                            s.updateDraft("rssHub", v, valid)
                        }
                        onBlurRssHub={normalized =>
                            s.flushDraft({ rssHub: normalized })
                        }
                        onChangeStaleDays={(n, valid) =>
                            s.updateDraft("staleDays", n, valid)
                        }
                        onBlurStaleDays={clamped =>
                            s.flushDraft({ staleDays: clamped })
                        }
                    />
                    <SourceHealthPanel defaultOpen />
                </>
            )}
        </div>
    )
}
