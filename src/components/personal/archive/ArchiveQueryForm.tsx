import * as React from "react"
import { Checkbox, DefaultButton, Dropdown, TextField } from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { ArchiveQuery, archivePattern } from "../../../archive-types"

const useStyles = makeStyles({
    row: {
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "end",
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
            <TextField
                label="包含这些内容"
                placeholder="输入关键词或短语，多个词用逗号分隔"
                value={query.include}
                disabled={busy || query.regex !== undefined}
                onChange={(_, v) => onChange({ include: v || "" })}
            />
            <TextField
                label="排除这些内容"
                placeholder="可留空；包含这些词的文章会跳过"
                value={query.exclude}
                disabled={busy}
                onChange={(_, v) => onChange({ exclude: v || "" })}
            />
            <div className={c.row}>
                <Dropdown
                    label="匹配方式"
                    selectedKey={query.all ? "all" : "any"}
                    disabled={busy}
                    options={[
                        { key: "any", text: "命中任意一个词" },
                        { key: "all", text: "同时命中所有词" },
                    ]}
                    onChange={(_, o) => o && onChange({ all: o.key === "all" })}
                />
                <Dropdown
                    label="搜索内容"
                    selectedKey={query.field}
                    disabled={busy}
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
                        value={archivePattern(query)}
                    />
                    <Checkbox
                        disabled={busy}
                        label="手动编写正则表达式"
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
                        disabled={busy}
                        label="区分大小写"
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
