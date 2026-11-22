import * as React from "react"
import intl from "react-intl-universal"
import {
    Checkbox,
    DefaultButton,
    Dropdown,
    MessageBar,
    MessageBarType,
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
    grow: { flexGrow: 1, minWidth: "200px" },
    hint: { color: "var(--neutralSecondary)", margin: 0, lineHeight: "1.6" },
})

export const OfflineSaveSection: React.FC<{
    settings: PersonalSettings
    status?: PersonalStatus
    busy: boolean
    onChooseFolder: () => void
    onToggleRemoveLater: (checked: boolean) => void
    onRetryTask: (id: number) => void
    onShowFile: (id: number) => void
}> = ({
    settings,
    status,
    busy,
    onChooseFolder,
    onToggleRemoveLater,
    onRetryTask,
    onShowFile,
}) => {
    const c = useStyles()
    return (
        <section id="personal-offlineSave" role="tabpanel" className={c.panel}>
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
    onChangeSchedule: (s: PersonalSettings["backupSchedule"]) => void
    onChangeKeep: (n: number) => void
    onBackupNow: () => void
    onRestore: () => void
}> = ({
    settings,
    status,
    busy,
    onChooseFolder,
    onChangeSchedule,
    onChangeKeep,
    onBackupNow,
    onRestore,
}) => {
    const c = useStyles()
    const scheduleOptions = (["off", "daily", "weekly"] as const).map(key => ({
        key,
        text: intl.get("personal." + key),
    }))

    return (
        <section id="personal-backup" role="tabpanel" className={c.panel}>
            <Separator>{intl.get("personal.backup")}</Separator>
            <div className={c.row}>
                <TextField
                    className={c.grow}
                    readOnly
                    label={intl.get("personal.backupFolder")}
                    value={settings.backupFolder}
                />
                <DefaultButton disabled={busy} onClick={onChooseFolder}>
                    {intl.get("personal.chooseFolder")}
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
                    value={String(settings.backupKeep)}
                    onChange={(_, value) => onChangeKeep(Number(value))}
                />
            </div>
            <div className={c.row}>
                <DefaultButton
                    disabled={busy || status?.backupRunning}
                    onClick={onBackupNow}>
                    {status?.backupRunning
                        ? "正在打包备份…"
                        : intl.get("personal.backupNow")}
                </DefaultButton>
                <DefaultButton disabled={busy} onClick={onRestore}>
                    {intl.get("personal.restore")}
                </DefaultButton>
            </div>
            <p className={c.hint}>{intl.get("personal.backupHint")}</p>
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
        <section id="personal-search" role="tabpanel" className={c.panel}>
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
