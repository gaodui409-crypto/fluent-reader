import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    Dialog,
    DialogType,
    DialogFooter,
    DefaultButton,
    PrimaryButton,
    Dropdown,
    TextField,
    Checkbox,
    MessageBar,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import {
    defaultSourcePreferences,
    SourcePreferences,
} from "../../source-preferences"
import { savePreferences } from "../../scripts/models/preferences"

type Target = { sids: number[] } | { gid: number }
const useStyles = makeStyles({
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        maxHeight: "65vh",
        overflowY: "auto",
    },
    row: {
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        alignItems: "center",
        gap: "12px",
    },
})

export default function SourceSettings() {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const preferences = useAppSelector(state => state.preferences)
    const sources = useAppSelector(state => state.sources)
    const groups = useAppSelector(state => state.groups)
    const [target, setTarget] = useState<Target>(null)
    const [values, setValues] = useState<Partial<SourcePreferences>>({})
    const [changes, setChanges] = useState<Set<keyof SourcePreferences>>(
        new Set()
    )
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    useEffect(() => {
        const listener = (event: CustomEvent<Target>) => {
            const target = event.detail
            const first =
                "gid" in target
                    ? preferences.groups[target.gid]
                    : target.sids.length === 1
                    ? preferences.sources[target.sids[0]]
                    : {}
            setValues(first || {})
            setChanges(new Set())
            setTarget(target)
            setError("")
        }
        window.addEventListener("source-preferences", listener)
        return () => window.removeEventListener("source-preferences", listener)
    }, [preferences])
    const multiple = target && "sids" in target && target.sids.length > 1
    const update = (
        key: keyof SourcePreferences,
        value: SourcePreferences[keyof SourcePreferences]
    ) => {
        setValues(current => ({ ...current, [key]: value }))
        setChanges(current => new Set([...current, key]))
    }
    async function save() {
        setBusy(true)
        setError("")
        const patch: Partial<SourcePreferences> = {},
            clear: (keyof SourcePreferences)[] = []
        for (const key of changes) {
            if (values[key] === undefined) clear.push(key)
            else Object.assign(patch, { [key]: values[key] })
        }
        try {
            await dispatch(savePreferences(target, patch, clear))
            setTarget(null)
        } catch (error) {
            setError(String(error))
        } finally {
            setBusy(false)
        }
    }
    const name = target
        ? "gid" in target
            ? groups.find(g => g.gid === target.gid)?.name
            : target.sids.map(sid => sources[sid]?.name).join(", ")
        : ""
    const inherit = { key: "inherit", text: intl.get("personal.inherit") }
    const toggleKeys = [
        "autoFullText",
        "offlineEnabled",
        "autoOffline",
        "aiEnabled",
        "autoTranslateTitle",
        "autoSummary",
    ] as const
    return (
        <Dialog
            hidden={!target}
            onDismiss={() => !busy && setTarget(null)}
            minWidth={650}
            dialogContentProps={{
                type: DialogType.close,
                title: intl.get("personal.sourceSettings"),
                closeButtonAriaLabel: intl.get("close"),
                subText: name,
            }}
            modalProps={{ isBlocking: busy }}>
            <div className={classes.form}>
                {error && (
                    <MessageBar>
                        {intl.get("personal.failed")} {error}
                    </MessageBar>
                )}
                <p>
                    {intl.get(
                        multiple ? "personal.bulkHint" : "personal.inheritHint"
                    )}
                </p>
                <Dropdown
                    disabled={busy}
                    label={intl.get("personal.openTarget")}
                    selectedKey={values.openTarget ?? "inherit"}
                    options={[
                        inherit,
                        ...[
                            "summaryView",
                            "webView",
                            "externalView",
                            "fullView",
                        ].map((key, value) => ({
                            key: value,
                            text: intl.get("personal." + key),
                        })),
                    ]}
                    onChange={(_, option) =>
                        update(
                            "openTarget",
                            option.key === "inherit"
                                ? undefined
                                : Number(option.key)
                        )
                    }
                />
                <Dropdown
                    disabled={busy}
                    label={intl.get("personal.fetchMode")}
                    selectedKey={values.fetchMode ?? "inherit"}
                    options={[
                        inherit,
                        ...["direct", "rendered", "off"].map(key => ({
                            key,
                            text: intl.get("personal." + key),
                        })),
                    ]}
                    onChange={(_, option) =>
                        update(
                            "fetchMode",
                            option.key === "inherit"
                                ? undefined
                                : (option.key as SourcePreferences["fetchMode"])
                        )
                    }
                />
                {toggleKeys.map(key => (
                    <Dropdown
                        disabled={busy}
                        key={key}
                        label={intl.get("personal." + key)}
                        selectedKey={
                            values[key] === undefined
                                ? "inherit"
                                : values[key]
                                ? "on"
                                : "off"
                        }
                        options={[
                            inherit,
                            { key: "on", text: intl.get("personal.on") },
                            { key: "off", text: intl.get("personal.off") },
                        ]}
                        onChange={(_, option) =>
                            update(
                                key,
                                option.key === "inherit"
                                    ? undefined
                                    : option.key === "on"
                            )
                        }
                    />
                ))}
                {(["fetchFrequency", "unreadExpiryDays"] as const).map(key => (
                    <div className={classes.row} key={key}>
                        <Checkbox
                            disabled={busy}
                            label={intl.get("personal.inherit")}
                            checked={values[key] === undefined}
                            onChange={(_, checked) =>
                                update(
                                    key,
                                    checked
                                        ? undefined
                                        : defaultSourcePreferences[key]
                                )
                            }
                        />
                        <TextField
                            disabled={busy || values[key] === undefined}
                            type="number"
                            min={0}
                            label={intl.get("personal." + key)}
                            value={String(values[key] ?? 0)}
                            onChange={(_, value) => update(key, Number(value))}
                        />
                    </div>
                ))}
            </div>
            <DialogFooter>
                <PrimaryButton
                    disabled={busy || !changes.size}
                    onClick={() => void save()}>
                    {intl.get("personal.saveSettings")}
                </PrimaryButton>
                <DefaultButton disabled={busy} onClick={() => setTarget(null)}>
                    {intl.get("cancel")}
                </DefaultButton>
            </DialogFooter>
        </Dialog>
    )
}
