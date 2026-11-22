import * as React from "react"
import { Checkbox, DefaultButton, Dropdown, TextField } from "@fluentui/react"
import { FolderPicker } from "../folders"

export const ArchiveActionForm: React.FC<{
    kind: string
    onKindChange: (kind: string) => void
    folderId?: number
    onFolderChange: (id: number) => void
    suggestion: string
    hide: boolean
    onHideChange: (hide: boolean) => void
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
    future,
    onFutureChange,
    ruleName,
    onRuleNameChange,
    onSaveOnly,
    busy,
}) => {
    return (
        <>
            <Dropdown
                label="处理方式"
                selectedKey={kind}
                disabled={busy}
                options={[
                    { key: "folder", text: "归入文件夹" },
                    { key: "view", text: "只看匹配文章" },
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
            {kind !== "view" && (
                <Checkbox
                    label="以后自动执行此规则"
                    checked={future}
                    disabled={busy}
                    onChange={(_, v) => onFutureChange(!!v)}
                />
            )}
            {future && kind !== "view" && (
                <>
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
                </>
            )}
        </>
    )
}
