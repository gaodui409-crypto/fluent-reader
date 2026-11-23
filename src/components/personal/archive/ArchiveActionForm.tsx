import * as React from "react"
import { Checkbox, DefaultButton, Dropdown, TextField } from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { FolderPicker } from "../folders"
import { HIGHLIGHT_SWATCHES } from "./useOrganizeState"

const useStyles = makeStyles({
    swatchRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
    },
    swatchLabel: {
        fontSize: "12.5px",
        color: "var(--neutralPrimary)",
        marginInlineEnd: "4px",
    },
    swatchBtn: {
        "minInlineSize": "26px",
        "minBlockSize": "26px",
        "width": "26px",
        "height": "26px",
        "borderRadius": "999px",
        "border": "2px solid transparent",
        "cursor": "pointer",
        "display": "inline-flex",
        "alignItems": "center",
        "justifyContent": "center",
        "color": "#ffffff",
        "fontSize": "12px",
        "fontWeight": 700,
        "padding": 0,
        "boxShadow": "inset 0 0 0 1px rgba(0,0,0,0.18)",
        ":focus-visible": {
            outline: "2px solid var(--themePrimary)",
            outlineOffset: "2px",
        },
    },
    swatchSelected: {
        border: "2px solid var(--black)",
        transform: "scale(1.08)",
    },
    extraRulesBox: {
        display: "grid",
        gap: "8px",
        padding: "10px 12px",
        borderRadius: "6px",
        backgroundColor: "var(--neutralLighterAlt)",
        border: "1px solid var(--neutralQuaternaryAlt)",
    },
})

function HighlightSwatchPicker({
    value,
    onChange,
    disabled,
}: {
    value: string
    onChange: (color: string) => void
    disabled: boolean
}) {
    const c = useStyles()
    const effective = value || "#e3a008"
    return (
        <div className={c.swatchRow} role="group" aria-label="高亮颜色">
            <span className={c.swatchLabel}>高亮颜色：</span>
            {HIGHLIGHT_SWATCHES.map(swatch => {
                const selected =
                    effective.toLowerCase() === swatch.color.toLowerCase()
                return (
                    <button
                        key={swatch.color}
                        type="button"
                        disabled={disabled}
                        aria-label={swatch.label}
                        title={swatch.label}
                        aria-pressed={selected}
                        className={mergeClasses(
                            c.swatchBtn,
                            selected && c.swatchSelected
                        )}
                        style={{ backgroundColor: swatch.color }}
                        onClick={() => onChange(swatch.color)}>
                        {selected ? "✓" : ""}
                    </button>
                )
            })}
        </div>
    )
}

export const ArchiveActionForm: React.FC<{
    kind: string
    onKindChange: (kind: string) => void
    folderId?: number
    onFolderChange: (id: number) => void
    suggestion: string
    hide: boolean
    onHideChange: (hide: boolean) => void
    highlight: string
    onHighlightChange: (color: string) => void
    notify: boolean | undefined
    onNotifyChange: (notify: boolean | undefined) => void
    autoOffline: boolean | undefined
    onAutoOfflineChange: (autoOffline: boolean | undefined) => void
    future: boolean
    onFutureChange: (future: boolean) => void
    ruleName: string
    onRuleNameChange: (name: string) => void
    onSaveOnly: () => void
    busy: boolean
}> = ({
    kind,
    onKindChange,
    folderId,
    onFolderChange,
    suggestion,
    hide,
    onHideChange,
    highlight,
    onHighlightChange,
    notify,
    onNotifyChange,
    autoOffline,
    onAutoOfflineChange,
    future,
    onFutureChange,
    ruleName,
    onRuleNameChange,
    onSaveOnly,
    busy,
}) => {
    const c = useStyles()

    return (
        <>
            <Dropdown
                label="处理方式"
                selectedKey={kind}
                disabled={busy}
                options={[
                    { key: "folder", text: "归入文件夹" },
                    { key: "view", text: "只看匹配文章" },
                    { key: "highlight", text: "仅高亮颜色" },
                    { key: "notify", text: "发送系统通知" },
                    { key: "offline", text: "自动保存离线网页" },
                    { key: "hide", text: "隐藏匹配文章" },
                    { key: "restore", text: "恢复到订阅流" },
                    { key: "read", text: "标为已读" },
                    { key: "unread", text: "标为未读" },
                    { key: "star", text: "加入收藏" },
                    { key: "unstar", text: "取消收藏" },
                    { key: "later", text: "加入稍后读" },
                    { key: "unlater", text: "移出稍后读" },
                ]}
                onChange={(_, o) => o && onKindChange(String(o.key))}
            />
            {(kind === "notify" || kind === "offline") && (
                <Dropdown
                    label={kind === "notify" ? "系统通知" : "自动离线"}
                    disabled={busy}
                    selectedKey={
                        (kind === "notify" ? notify : autoOffline) === false
                            ? "off"
                            : "on"
                    }
                    options={[
                        { key: "on", text: "启用" },
                        {
                            key: "off",
                            text:
                                kind === "notify"
                                    ? "禁止系统通知"
                                    : "禁止自动离线",
                        },
                    ]}
                    onChange={(_, o) => {
                        if (o)
                            (kind === "notify"
                                ? onNotifyChange
                                : onAutoOfflineChange)(o.key === "on")
                    }}
                />
            )}
            {kind === "folder" && (
                <>
                    <FolderPicker
                        value={folderId}
                        onChange={onFolderChange}
                        suggestion={suggestion}
                        disabled={busy}
                    />
                    <Checkbox
                        label="归档后从订阅流隐藏"
                        checked={hide}
                        disabled={busy}
                        onChange={(_, v) => onHideChange(!!v)}
                    />
                    <small style={{ color: "var(--neutralSecondary)" }}>
                        在「全部文章」和订阅源列表中隐藏，但仍可在所选文件夹、收藏和稍后读中查看，未读状态不变。
                    </small>
                </>
            )}
            {kind === "highlight" && (
                <HighlightSwatchPicker
                    value={highlight || "#e3a008"}
                    onChange={onHighlightChange}
                    disabled={busy}
                />
            )}
            {kind !== "view" && (
                <Checkbox
                    label="以后自动执行此规则"
                    checked={future}
                    disabled={busy}
                    onChange={(_, v) => onFutureChange(!!v)}
                />
            )}
            {future && kind !== "view" && (
                <div className={c.extraRulesBox}>
                    {kind !== "highlight" && (
                        <>
                            <Checkbox
                                label="同时高亮颜色"
                                checked={Boolean(highlight)}
                                disabled={busy}
                                onChange={(_, v) =>
                                    onHighlightChange(
                                        v ? highlight || "#e3a008" : ""
                                    )
                                }
                            />
                            {Boolean(highlight) && (
                                <HighlightSwatchPicker
                                    value={highlight}
                                    onChange={onHighlightChange}
                                    disabled={busy}
                                />
                            )}
                        </>
                    )}
                    {kind !== "notify" && (
                        <Dropdown
                            label="新文章系统通知"
                            selectedKey={
                                notify === undefined
                                    ? "keep"
                                    : notify
                                    ? "on"
                                    : "off"
                            }
                            options={[
                                { key: "keep", text: "不修改" },
                                { key: "on", text: "发送系统通知" },
                                { key: "off", text: "禁止系统通知" },
                            ]}
                            disabled={busy}
                            onChange={(_, o) =>
                                o &&
                                onNotifyChange(
                                    o.key === "keep"
                                        ? undefined
                                        : o.key === "on"
                                )
                            }
                        />
                    )}
                    {kind !== "offline" && (
                        <Dropdown
                            label="新文章自动离线"
                            selectedKey={
                                autoOffline === undefined
                                    ? "keep"
                                    : autoOffline
                                    ? "on"
                                    : "off"
                            }
                            options={[
                                { key: "keep", text: "不修改" },
                                { key: "on", text: "自动保存离线网页" },
                                { key: "off", text: "禁止自动离线" },
                            ]}
                            disabled={busy}
                            onChange={(_, o) =>
                                o &&
                                onAutoOfflineChange(
                                    o.key === "keep"
                                        ? undefined
                                        : o.key === "on"
                                )
                            }
                        />
                    )}
                    <TextField
                        disabled={busy}
                        label="规则名称"
                        value={ruleName}
                        placeholder={suggestion || "文章整理"}
                        onChange={(_, v) => onRuleNameChange(v || "")}
                    />
                    <small style={{ color: "var(--neutralSecondary)" }}>
                        保存后，新收到的文章会自动按上述条件和范围处理；本次临时指定的起止日期与单篇取消勾选不会写入规则。
                    </small>
                    <div>
                        <DefaultButton
                            disabled={busy || (kind === "folder" && !folderId)}
                            onClick={onSaveOnly}>
                            只保存规则
                        </DefaultButton>
                    </div>
                </div>
            )}
        </>
    )
}
