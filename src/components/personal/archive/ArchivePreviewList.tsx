import * as React from "react"
import { useState } from "react"
import { Checkbox, DefaultButton, Link } from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { ArchivePreview } from "../../../archive-types"
import { useAppDispatch, useAppSelector } from "../../../scripts/reducer"
import { showItemFromId } from "../../../scripts/models/page"
import { exitSettings } from "../../../scripts/models/app"

const useStyles = makeStyles({
    row: {
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "center",
    },
    results: {
        maxHeight: "250px",
        overflowY: "auto",
        border: "1px solid var(--neutralQuaternaryAlt)",
        borderRadius: "6px",
        padding: "8px 10px",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    itemRow: {
        "padding": "6px 0",
        "borderBottom": "1px solid var(--neutralQuaternaryAlt)",
        ":last-child": {
            borderBottom: "none",
        },
    },
    itemHeader: {
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
    },
    titleWrap: {
        flexGrow: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "8px",
        flexWrap: "wrap",
    },
    titleLink: {
        fontWeight: 600,
        fontSize: "13.5px",
        lineHeight: 1.4,
        textAlign: "left",
        overflowWrap: "anywhere",
    },
    dateText: {
        fontSize: "11.5px",
        color: "var(--neutralSecondary)",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
    },
    excerpt: {
        display: "block",
        marginTop: "3px",
        paddingInlineStart: "28px",
        color: "var(--neutralSecondary)",
        lineHeight: "1.5",
    },
    expandedPreview: {
        marginTop: "6px",
        marginInlineStart: "28px",
        padding: "8px 10px",
        borderRadius: "6px",
        backgroundColor: "var(--white)",
        border: "1px solid var(--neutralQuaternaryAlt)",
        fontSize: "12.5px",
        lineHeight: "1.6",
        color: "var(--black)",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        maxHeight: "150px",
        overflowY: "auto",
        userSelect: "text",
    },
    previewFooter: {
        marginTop: "6px",
        display: "flex",
        gap: "10px",
        alignItems: "center",
        fontSize: "12px",
    },
    mark: {
        backgroundColor: "rgba(252, 225, 0, 0.35)",
        color: "inherit",
        borderRadius: "2px",
        padding: "0 2px",
    },
})

function formatRowDate(ts: number): string {
    if (!ts) return ""
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    })
}

export const ArchivePreviewList: React.FC<{
    loading: boolean
    waitingForCriteria: boolean
    preview?: ArchivePreview
    excluded: number[]
    onChangeExcluded: React.Dispatch<React.SetStateAction<number[]>>
    page: number
    onPageChange: (page: number) => void
    total: number
    busy: boolean
    onRefreshPreview: () => void
    onCloseForRead?: () => void
}> = ({
    loading,
    waitingForCriteria,
    preview,
    excluded,
    onChangeExcluded,
    page,
    onPageChange,
    total,
    busy,
    onRefreshPreview,
    onCloseForRead,
}) => {
    const c = useStyles()
    const dispatch = useAppDispatch()
    const settingsOpen = useAppSelector(s => s.app.settings.display)
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null)

    return (
        <>
            <div className={c.row}>
                <div role="status" style={{ flexGrow: 1 }}>
                    {loading
                        ? "正在查找…"
                        : preview
                        ? `匹配 ${preview.rows.length} 篇，本次处理 ${total} 篇`
                        : waitingForCriteria
                        ? "输入关键词自动预览，或点击“重新预览”查看全部文章"
                        : "可重新预览当前条件"}
                </div>
                {preview && preview.rows.length > 1 && excluded.length > 0 && (
                    <DefaultButton
                        disabled={busy}
                        onClick={() => onChangeExcluded([])}>
                        全选匹配项
                    </DefaultButton>
                )}
                <DefaultButton
                    disabled={busy || loading}
                    onClick={onRefreshPreview}>
                    重新预览
                </DefaultButton>
            </div>
            {preview && preview.rows.length > 0 && (
                <div className={c.results}>
                    {preview.rows.slice(page * 20, page * 20 + 20).map(row => {
                        const dateStr = formatRowDate(row.date)
                        const isExpanded = expandedRowId === row.id
                        return (
                            <div key={row.id} className={c.itemRow}>
                                <div className={c.itemHeader}>
                                    <Checkbox
                                        disabled={busy}
                                        ariaLabel={`选择文章：${row.title}`}
                                        checked={!excluded.includes(row.id)}
                                        onChange={(_, checked) =>
                                            onChangeExcluded(v =>
                                                checked
                                                    ? v.filter(
                                                          id => id !== row.id
                                                      )
                                                    : [...v, row.id]
                                            )
                                        }
                                    />
                                    <div className={c.titleWrap}>
                                        <Link
                                            className={c.titleLink}
                                            title="点击展开正文摘录"
                                            onClick={() => {
                                                setExpandedRowId(prev =>
                                                    prev === row.id
                                                        ? null
                                                        : row.id
                                                )
                                            }}>
                                            {row.title || "（无标题）"}
                                        </Link>
                                        {dateStr && (
                                            <span className={c.dateText}>
                                                {dateStr}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <small className={c.excerpt}>
                                    {row.source}
                                    {dateStr ? ` · ${dateStr}` : ""} ·{" "}
                                    {row.excerpt ? (
                                        <>
                                            {row.excerpt.text.slice(
                                                0,
                                                row.excerpt.start
                                            )}
                                            <mark className={c.mark}>
                                                {row.excerpt.text.slice(
                                                    row.excerpt.start,
                                                    row.excerpt.start +
                                                        row.excerpt.length
                                                )}
                                            </mark>
                                            {row.excerpt.text.slice(
                                                row.excerpt.start +
                                                    row.excerpt.length
                                            )}
                                        </>
                                    ) : (
                                        row.body.slice(0, 90)
                                    )}
                                </small>
                                {isExpanded && (
                                    <div className={c.expandedPreview}>
                                        <div>
                                            {row.body.slice(0, 600)}
                                            {row.body.length > 600 ? "…" : ""}
                                        </div>
                                        <div className={c.previewFooter}>
                                            <Link
                                                onClick={() => {
                                                    void (async () => {
                                                        onCloseForRead?.()
                                                        if (settingsOpen)
                                                            await dispatch(
                                                                exitSettings()
                                                            )
                                                        await dispatch(
                                                            showItemFromId(
                                                                row.id
                                                            )
                                                        )
                                                    })()
                                                }}>
                                                在阅读器中查看全文 →
                                            </Link>
                                            {row.link && (
                                                <Link
                                                    onClick={() =>
                                                        window.utils.openExternal(
                                                            row.link,
                                                            false
                                                        )
                                                    }>
                                                    在浏览器打开原文
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {preview.rows.length > 20 && (
                        <div className={c.row} style={{ marginTop: "8px" }}>
                            <DefaultButton
                                disabled={!page}
                                onClick={() => onPageChange(page - 1)}>
                                上一页
                            </DefaultButton>
                            <span>
                                {page + 1} /{" "}
                                {Math.ceil(preview.rows.length / 20)}
                            </span>
                            <DefaultButton
                                disabled={
                                    (page + 1) * 20 >= preview.rows.length
                                }
                                onClick={() => onPageChange(page + 1)}>
                                下一页
                            </DefaultButton>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
