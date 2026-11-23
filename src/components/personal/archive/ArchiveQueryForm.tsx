import * as React from "react"
import { Checkbox, DefaultButton, Dropdown, TextField } from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import {
    ArchiveQuery,
    archivePattern,
    summarizeArchiveConditions,
} from "../../../archive-types"

const useStyles = makeStyles({
    row: {
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "end",
    },
    statusRow: {
        display: "flex",
        gap: "14px",
        flexWrap: "wrap",
        alignItems: "end",
    },
    checkboxGroup: {
        display: "flex",
        gap: "14px",
        flexWrap: "wrap",
        alignItems: "center",
        minHeight: "32px",
    },
    advancedBox: {
        display: "grid",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "6px",
        backgroundColor: "var(--neutralLighterAlt)",
        border: "1px solid var(--neutralQuaternaryAlt)",
    },
})

export const ArchiveQueryForm: React.FC<{
    title: string
    scope: string
    onScopeChange: (scope: string) => void
    query: ArchiveQuery
    onChange: (patch: Partial<ArchiveQuery>) => void
    advanced: boolean
    onToggleAdvanced: () => void
    busy: boolean
}> = ({
    title,
    scope,
    onScopeChange,
    query,
    onChange,
    advanced,
    onToggleAdvanced,
    busy,
}) => {
    const c = useStyles()
    const structured = Boolean(query.conditions || query.legacyFilter)

    return (
        <>
            <Dropdown
                label="查找范围"
                selectedKey={scope}
                disabled={busy}
                options={[
                    { key: "all", text: "全部本地文章" },
                    { key: "current", text: "当前订阅范围 · " + title },
                    ...(scope === "saved"
                        ? [{ key: "saved", text: "这条规则保存的订阅范围" }]
                        : []),
                ]}
                onChange={(_, o) => o && onScopeChange(String(o.key))}
            />
            {structured && (
                <div className={c.advancedBox}>
                    <span>{summarizeArchiveConditions(query)}</span>
                    <small>
                        已保留旧规则条件；可调整范围和状态，或主动改为普通条件。
                    </small>
                    <DefaultButton
                        disabled={busy}
                        onClick={() =>
                            onChange({
                                conditions: undefined,
                                logic: undefined,
                                negate: undefined,
                                legacyFilter: undefined,
                            })
                        }>
                        改为普通条件
                    </DefaultButton>
                </div>
            )}
            <TextField
                label="包含这些内容"
                placeholder="输入关键词或短语，多个词用逗号分隔"
                value={query.include}
                disabled={busy || structured || query.regex !== undefined}
                onChange={(_, v) => onChange({ include: v || "" })}
            />
            <TextField
                label="排除这些内容"
                placeholder="可留空；包含这些词的文章会跳过"
                value={query.exclude}
                disabled={busy || structured}
                onChange={(_, v) => onChange({ exclude: v || "" })}
            />
            <div className={c.statusRow}>
                <Dropdown
                    label="阅读状态"
                    selectedKey={query.readState || "all"}
                    disabled={busy}
                    styles={{ root: { minWidth: 132 } }}
                    options={[
                        { key: "all", text: "不限" },
                        { key: "unread", text: "仅未读" },
                        { key: "read", text: "仅已读" },
                    ]}
                    onChange={(_, o) =>
                        o &&
                        onChange({
                            readState:
                                o.key === "all"
                                    ? undefined
                                    : (o.key as ArchiveQuery["readState"]),
                        })
                    }
                />
                <div className={c.checkboxGroup}>
                    <Checkbox
                        disabled={busy}
                        label="仅未归入文件夹"
                        checked={!!query.unfolderedOnly}
                        onChange={(_, v) =>
                            onChange({ unfolderedOnly: v ? true : undefined })
                        }
                    />
                    <Checkbox
                        disabled={busy}
                        label="仅收藏"
                        checked={!!query.starredOnly}
                        onChange={(_, v) =>
                            onChange({ starredOnly: v ? true : undefined })
                        }
                    />
                </div>
            </div>
            <div className={c.row}>
                <Dropdown
                    label="匹配方式"
                    selectedKey={query.all ? "all" : "any"}
                    disabled={busy || structured}
                    options={[
                        { key: "any", text: "命中任意一个词" },
                        { key: "all", text: "同时命中所有词" },
                    ]}
                    onChange={(_, o) => o && onChange({ all: o.key === "all" })}
                />
                <Dropdown
                    label="搜索内容"
                    selectedKey={query.field}
                    disabled={busy || structured}
                    options={[
                        { key: "full", text: "标题及本地正文" },
                        { key: "title", text: "仅标题" },
                        { key: "body", text: "仅本地正文" },
                        { key: "author", text: "作者" },
                        { key: "link", text: "原文链接" },
                    ]}
                    onChange={(_, o) =>
                        o && onChange({ field: o.key as ArchiveQuery["field"] })
                    }
                />
                <DefaultButton
                    disabled={busy}
                    checked={advanced}
                    onClick={onToggleAdvanced}>
                    高级条件
                </DefaultButton>
            </div>
            {advanced && (
                <div className={c.advancedBox}>
                    <TextField
                        label="等效正则表达式（预览）"
                        readOnly
                        value={
                            structured
                                ? summarizeArchiveConditions(query)
                                : archivePattern(query)
                        }
                    />
                    <Checkbox
                        label="手动编写正则表达式"
                        disabled={busy || structured}
                        checked={query.regex !== undefined}
                        onChange={(_, v) =>
                            onChange({
                                regex: v ? archivePattern(query) : undefined,
                            })
                        }
                    />
                    {query.regex !== undefined && (
                        <TextField
                            disabled={busy}
                            label="正则条件"
                            value={query.regex}
                            onChange={(_, v) => onChange({ regex: v || "" })}
                        />
                    )}
                    <Checkbox
                        label="区分大小写"
                        disabled={busy || structured}
                        checked={!!query.caseSensitive}
                        onChange={(_, v) => onChange({ caseSensitive: !!v })}
                    />
                    <div className={c.row}>
                        <TextField
                            disabled={busy}
                            type="date"
                            label="开始日期（可留空）"
                            value={
                                query.start
                                    ? new Date(query.start).toLocaleDateString(
                                          "sv-SE"
                                      )
                                    : ""
                            }
                            onChange={(_, v) =>
                                onChange({
                                    start: v
                                        ? +new Date(v + "T00:00:00")
                                        : undefined,
                                })
                            }
                        />
                        <TextField
                            disabled={busy}
                            type="date"
                            label="结束日期（可留空）"
                            value={
                                query.end
                                    ? new Date(
                                          query.end - 1
                                      ).toLocaleDateString("sv-SE")
                                    : ""
                            }
                            onChange={(_, v) => {
                                const end = v ? new Date(v + "T00:00:00") : null
                                if (end) end.setDate(end.getDate() + 1)
                                onChange({ end: end ? +end : undefined })
                            }}
                        />
                    </div>
                </div>
            )}
        </>
    )
}
