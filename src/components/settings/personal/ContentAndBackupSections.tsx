import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    Checkbox,
    DefaultButton,
    Dropdown,
    MessageBar,
    MessageBarType,
    PrimaryButton,
    ProgressIndicator,
    Separator,
    TextField,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { PersonalSettings, PersonalStatus } from "../../../personal-types"

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
    summaryCard: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "12px 14px",
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    grow: { flexGrow: 1, minWidth: "200px" },
    hint: { color: "var(--neutralSecondary)", margin: 0, lineHeight: "1.6" },
    lastBackup: {
        fontSize: "13px",
        color: "var(--neutralPrimary)",
        margin: 0,
    },
})

export const OfflineSaveSection: React.FC<{
    settings: PersonalSettings
    status?: PersonalStatus
    busy: boolean
    onChooseFolder: () => void
    onOpenOfflineFolder: () => void
    onToggleRemoveLater: (checked: boolean) => void
    onRetryTask: (id: number) => void
    onShowFile: (id: number) => void
}> = ({
    settings,
    status,
    busy,
    onChooseFolder,
    onOpenOfflineFolder,
    onToggleRemoveLater,
    onRetryTask,
    onShowFile,
}) => {
    const c = useStyles()
    return (
        <section id="personal-offlineSave" className={c.panel}>
            <Separator>{intl.get("personal.offlineSave")}</Separator>
            <div className={c.row}>
                <TextField
                    className={c.grow}
                    readOnly
                    label={intl.get("personal.offlineFolder")}
                    value={
                        settings.offlineFolder ||
                        intl.get("personal.defaultOfflineFolder")
                    }
                />
                <DefaultButton disabled={busy} onClick={onChooseFolder}>
                    {intl.get("personal.chooseFolder")}
                </DefaultButton>
                <DefaultButton disabled={busy} onClick={onOpenOfflineFolder}>
                    打开离线网页目录
                </DefaultButton>
            </div>
            <p className={c.hint}>{intl.get("personal.offlineHint")}</p>
            <Checkbox
                checked={settings.removeLaterOnRead}
                label={intl.get("personal.removeLaterOnRead")}
                onChange={(_, checked) => onToggleRemoveLater(!!checked)}
            />
            {status?.offline &&
                status.offline
                    .slice()
                    .reverse()
                    .map(task => (
                        <div className={c.itemCard} key={task.id}>
                            <span className={c.grow}>
                                <strong>{task.title}</strong> ·{" "}
                                {task.state === "failed"
                                    ? "保存失败"
                                    : intl.get("personal." + task.state)}{" "}
                                {task.error && `（${task.error}）`}
                            </span>
                            {task.state === "failed" && (
                                <DefaultButton
                                    disabled={busy}
                                    onClick={() => onRetryTask(task.id)}>
                                    {intl.get("personal.retry")}
                                </DefaultButton>
                            )}
                            {task.state === "done" && (
                                <DefaultButton
                                    disabled={busy}
                                    onClick={() => onShowFile(task.id)}>
                                    {intl.get("personal.showFile")}
                                </DefaultButton>
                            )}
                        </div>
                    ))}
        </section>
    )
}

export const BackupSection: React.FC<{
    settings: PersonalSettings
    status?: PersonalStatus
    busy: boolean
    onChooseFolder: () => void
    onOpenBackupFolder: () => void
    onChangeSchedule: (s: PersonalSettings["backupSchedule"]) => void
    onChangeKeep: (n: number, valid: boolean) => void
    onBlurKeep: (clamped: number) => void
    onBackupNow: () => void
    onRestore: () => void
}> = ({
    settings,
    status,
    busy,
    onChooseFolder,
    onOpenBackupFolder,
    onChangeSchedule,
    onChangeKeep,
    onBlurKeep,
    onBackupNow,
    onRestore,
}) => {
    const c = useStyles()
    const [keepText, setKeepText] = useState(String(settings.backupKeep))
    const [focused, setFocused] = useState(false)

    useEffect(() => {
        if (!focused) {
            setKeepText(String(settings.backupKeep))
        }
    }, [settings.backupKeep, focused])

    const scheduleOptions = (["off", "daily", "weekly"] as const).map(key => ({
        key,
        text: intl.get("personal." + key),
    }))

    const formattedLastBackup =
        settings.lastBackup > 0
            ? new Date(settings.lastBackup).toLocaleString()
            : "尚未备份"

    return (
        <section id="personal-backup" className={c.panel}>
            <Separator>
                全量打包备份（ZIP，含文章、备注、文件夹、订阅列表与离线网页）
            </Separator>
            <div className={c.summaryCard}>
                <p className={c.lastBackup}>
                    <strong>上次备份：</strong>
                    {formattedLastBackup}
                </p>
                <p className={c.hint}>{intl.get("personal.backupHint")}</p>
            </div>
            <div className={c.row}>
                <TextField
                    className={c.grow}
                    readOnly
                    label={intl.get("personal.backupFolder")}
                    placeholder="请选择全量备份 ZIP 存放目录"
                    value={settings.backupFolder}
                />
                <DefaultButton disabled={busy} onClick={onChooseFolder}>
                    {intl.get("personal.chooseFolder")}
                </DefaultButton>
                <DefaultButton
                    disabled={busy || !settings.backupFolder}
                    onClick={onOpenBackupFolder}>
                    打开备份文件夹
                </DefaultButton>
            </div>
            <div className={c.row}>
                <Dropdown
                    label={intl.get("personal.schedule")}
                    options={scheduleOptions}
                    selectedKey={settings.backupSchedule}
                    onChange={(_, value) =>
                        value &&
                        onChangeSchedule(
                            value.key as PersonalSettings["backupSchedule"]
                        )
                    }
                />
                <TextField
                    type="number"
                    min={1}
                    max={100}
                    label={intl.get("personal.keep")}
                    value={keepText}
                    onFocus={() => setFocused(true)}
                    onChange={(_, value) => {
                        const raw = value ?? ""
                        setKeepText(raw)
                        const parsed = Number(raw)
                        if (
                            raw.trim() !== "" &&
                            Number.isFinite(parsed) &&
                            parsed >= 1 &&
                            parsed <= 100
                        ) {
                            onChangeKeep(Math.round(parsed), true)
                        }
                    }}
                    onBlur={() => {
                        setFocused(false)
                        const parsed = Number(keepText)
                        const clamped = Number.isFinite(parsed)
                            ? Math.min(100, Math.max(1, Math.round(parsed)))
                            : settings.backupKeep || 10
                        setKeepText(String(clamped))
                        onBlurKeep(clamped)
                    }}
                />
            </div>
            <div className={c.row}>
                <PrimaryButton
                    disabled={busy || status?.backupRunning}
                    onClick={onBackupNow}>
                    {status?.backupRunning
                        ? "正在打包备份…"
                        : intl.get("personal.backupNow")}
                </PrimaryButton>
                <DefaultButton disabled={busy} onClick={onRestore}>
                    {intl.get("personal.restore")}
                </DefaultButton>
            </div>
            {status?.backupWarning && (
                <MessageBar messageBarType={MessageBarType.warning}>
                    {status.backupWarning}
                </MessageBar>
            )}
            {status?.backupError && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {intl.get("personal.backupFailed")} {status.backupError}
                </MessageBar>
            )}
        </section>
    )
}

export const SearchIndexSection: React.FC<{
    status?: PersonalStatus
    busy: boolean
    onRebuild: () => void
}> = ({ status, busy, onRebuild }) => {
    const c = useStyles()
    return (
        <section id="personal-search" className={c.panel}>
            <Separator>{intl.get("personal.search")}</Separator>
            <div className={c.row}>
                <DefaultButton
                    onClick={() =>
                        window.dispatchEvent(new Event("personal-search"))
                    }>
                    {intl.get("personal.search")}
                </DefaultButton>
                <DefaultButton
                    disabled={busy || status?.index.running}
                    onClick={onRebuild}>
                    {intl.get("personal.rebuild")}
                </DefaultButton>
            </div>
            <p className={c.hint}>{intl.get("personal.searchShortcut")}</p>
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
                <MessageBar messageBarType={MessageBarType.error}>
                    {status.index.error}
                </MessageBar>
            )}
        </section>
    )
}
