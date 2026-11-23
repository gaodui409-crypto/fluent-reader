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
    MessageBarType,
    Separator,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import {
    defaultSourcePreferences,
    resolveSourcePreferences,
    SourcePreferences,
} from "../../source-preferences"
import { loadPreferences } from "../../scripts/models/preferences"

type Target = { sids: number[] } | { gid: number }

const useStyles = makeStyles({
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    },
    grid: {
        "display": "grid",
        "gridTemplateColumns": "repeat(2, minmax(0, 1fr))",
        "gap": "12px",
        "@media (max-width: 560px)": {
            gridTemplateColumns: "1fr",
        },
    },
    row: {
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        alignItems: "center",
        gap: "12px",
    },
    hint: {
        margin: 0,
        color: "var(--neutralSecondary)",
        lineHeight: "1.6",
    },
    groupResetBox: {
        padding: "10px 12px",
        borderRadius: "6px",
        border: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
    },
})

export default function SourceSettings() {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const preferences = useAppSelector(state => state.preferences)
    const sources = useAppSelector(state => state.sources)
    const groups = useAppSelector(state => state.groups)
    const [target, setTarget] = useState<Target | null>(null)
    const [values, setValues] = useState<Partial<SourcePreferences>>({})
    const [changes, setChanges] = useState<Set<keyof SourcePreferences>>(
        new Set()
    )
    const [clearChildSources, setClearChildSources] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        const listener = (event: CustomEvent<Target>) => {
            const nextTarget = event.detail
            const first =
                "gid" in nextTarget
                    ? preferences.groups[nextTarget.gid]
                    : nextTarget.sids.length === 1
                    ? preferences.sources[nextTarget.sids[0]]
                    : {}
            setValues(first || {})
            setChanges(new Set())
            setClearChildSources(false)
            setTarget(nextTarget)
            setError("")
        }
        window.addEventListener("source-preferences", listener)
        return () => window.removeEventListener("source-preferences", listener)
    }, [preferences])

    const isGroupTarget = Boolean(target && "gid" in target)
    const multiple = Boolean(
        target && "sids" in target && target.sids.length > 1
    )
    const singleSource =
        target && "sids" in target && target.sids.length === 1
            ? sources[target.sids[0]]
            : undefined
    const basePrefs: SourcePreferences = singleSource
        ? resolveSourcePreferences(singleSource, groups, {
              ...preferences,
              sources: {},
          })
        : defaultSourcePreferences

    const update = (
        key: keyof SourcePreferences,
        value: SourcePreferences[keyof SourcePreferences]
    ) => {
        setValues(current => ({ ...current, [key]: value }))
        setChanges(current => new Set([...current, key]))
    }

    async function save() {
        if (!target) return
        setBusy(true)
        setError("")
        const patch: Partial<SourcePreferences> = {}
        const clear: (keyof SourcePreferences)[] = []
        for (const key of changes) {
            if (values[key] === undefined) clear.push(key)
            else Object.assign(patch, { [key]: values[key] })
        }
        try {
            await window.personal.savePreferences(
                target,
                patch,
                clear,
                Boolean("gid" in target && clearChildSources)
            )
            await dispatch(loadPreferences())
            setTarget(null)
        } catch (err) {
            setError(String(err))
        } finally {
            setBusy(false)
        }
    }

    const name = target
        ? "gid" in target
            ? groups.find(g => g.gid === target.gid)?.name
            : target.sids
                  .map(sid => sources[sid]?.name)
                  .filter(Boolean)
                  .join("、")
        : ""

    const inheritText = (resolvedLabel?: string) =>
        multiple || !resolvedLabel
            ? intl.get("personal.inherit")
            : `${intl.get("personal.inherit")}（当前：${resolvedLabel}）`

    const openTargetKeys = [
        "summaryView",
        "webView",
        "externalView",
        "fullView",
    ] as const

    const toggleKeys = [
        "autoFullText",
        "offlineEnabled",
        "autoOffline",
        "aiEnabled",
        "autoTranslateTitle",
        "autoSummary",
    ] as const

    const canSave = changes.size > 0 || (isGroupTarget && clearChildSources)

    return (
        <Dialog
            hidden={!target}
            onDismiss={() => !busy && setTarget(null)}
            minWidth={580}
            maxWidth={680}
            dialogContentProps={{
                type: DialogType.close,
                title: isGroupTarget
                    ? intl.get("personal.groupSettings")
                    : intl.get("personal.sourceSettings"),
                closeButtonAriaLabel: intl.get("close"),
                subText: name,
            }}
            modalProps={{
                isBlocking: busy,
                styles: {
                    main: {
                        minWidth: "min(580px, calc(100vw - 24px))",
                        maxWidth: "min(680px, calc(100vw - 24px))",
                    },
                },
            }}>
            <div className={classes.form}>
                {error && (
                    <MessageBar messageBarType={MessageBarType.error}>
                        {intl.get("personal.failed")} {error}
                    </MessageBar>
                )}
                <p className={classes.hint}>
                    {intl.get(
                        multiple ? "personal.bulkHint" : "personal.inheritHint"
                    )}
                </p>

                <Separator>阅读与正文抓取</Separator>
                <div className={classes.grid}>
                    <Dropdown
                        disabled={busy}
                        label={intl.get("personal.openTarget")}
                        selectedKey={values.openTarget ?? "inherit"}
                        options={[
                            {
                                key: "inherit",
                                text: inheritText(
                                    intl.get(
                                        "personal." +
                                            openTargetKeys[
                                                basePrefs.openTarget ?? 0
                                            ]
                                    )
                                ),
                            },
                            ...openTargetKeys.map((key, value) => ({
                                key: value,
                                text: intl.get("personal." + key),
                            })),
                        ]}
                        onChange={(_, option) =>
                            option &&
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
                            {
                                key: "inherit",
                                text: inheritText(
                                    intl.get("personal." + basePrefs.fetchMode)
                                ),
                            },
                            ...(["direct", "rendered", "off"] as const).map(
                                key => ({
                                    key,
                                    text: intl.get("personal." + key),
                                })
                            ),
                        ]}
                        onChange={(_, option) =>
                            option &&
                            update(
                                "fetchMode",
                                option.key === "inherit"
                                    ? undefined
                                    : (option.key as SourcePreferences["fetchMode"])
                            )
                        }
                    />
                </div>

                <Separator>离线保存与 AI 辅助</Separator>
                <div className={classes.grid}>
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
                                {
                                    key: "inherit",
                                    text: inheritText(
                                        intl.get(
                                            basePrefs[key]
                                                ? "personal.on"
                                                : "personal.off"
                                        )
                                    ),
                                },
                                { key: "on", text: intl.get("personal.on") },
                                { key: "off", text: intl.get("personal.off") },
                            ]}
                            onChange={(_, option) =>
                                option &&
                                update(
                                    key,
                                    option.key === "inherit"
                                        ? undefined
                                        : option.key === "on"
                                )
                            }
                        />
                    ))}
                </div>

                <Separator>刷新间隔与过期自动已读</Separator>
                {(["fetchFrequency", "unreadExpiryDays"] as const).map(key => {
                    const isCustom = values[key] !== undefined
                    return (
                        <div className={classes.row} key={key}>
                            <Checkbox
                                disabled={busy}
                                label="自定义单独数值"
                                checked={isCustom}
                                onChange={(_, checked) =>
                                    update(
                                        key,
                                        checked
                                            ? basePrefs[key] ??
                                                  defaultSourcePreferences[key]
                                            : undefined
                                    )
                                }
                            />
                            <TextField
                                disabled={busy || !isCustom}
                                type="number"
                                min={0}
                                label={intl.get("personal." + key)}
                                description={
                                    !isCustom && !multiple
                                        ? `当前跟随默认：${basePrefs[key] ?? 0}`
                                        : undefined
                                }
                                value={String(
                                    values[key] ?? basePrefs[key] ?? 0
                                )}
                                onChange={(_, value) =>
                                    update(key, Math.max(0, Number(value) || 0))
                                }
                            />
                        </div>
                    )
                })}

                {isGroupTarget && (
                    <div className={classes.groupResetBox}>
                        <Checkbox
                            disabled={busy}
                            checked={clearChildSources}
                            label="同时清除组内各订阅源的单独覆盖，统一跟随本组设置"
                            onChange={(_, checked) =>
                                setClearChildSources(Boolean(checked))
                            }
                        />
                    </div>
                )}
            </div>
            <DialogFooter>
                <PrimaryButton
                    disabled={busy || !canSave}
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
