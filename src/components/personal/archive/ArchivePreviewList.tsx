import * as React from "react"
import { Checkbox, DefaultButton } from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { ArchivePreview } from "../../../archive-types"

const useStyles = makeStyles({
    row: {
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "center",
    },
    results: {
        maxHeight: "230px",
        overflowY: "auto",
        border: "1px solid var(--neutralQuaternaryAlt)",
        borderRadius: "6px",
        padding: "8px 10px",
        backgroundColor: "var(--neutralLighterAlt)",
    },
    itemRow: {
        padding: "6px 0",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
    },
    excerpt: {
        display: "block",
        marginTop: "2px",
        color: "var(--neutralSecondary)",
        lineHeight: "1.5",
    },
    mark: {
        backgroundColor: "rgba(252, 225, 0, 0.35)",
        color: "inherit",
        borderRadius: "2px",
        padding: "0 2px",
    },
})

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
}) => {
    const c = useStyles()

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
                    {preview.rows.slice(page * 20, page * 20 + 20).map(row => (
                        <div key={row.id} className={c.itemRow}>
                            <Checkbox
                                disabled={busy}
                                checked={!excluded.includes(row.id)}
                                label={row.title}
                                onChange={(_, checked) =>
                                    onChangeExcluded(v =>
                                        checked
                                            ? v.filter(id => id !== row.id)
                                            : [...v, row.id]
                                    )
                                }
                            />
                            <small className={c.excerpt}>
                                {row.source} ·{" "}
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
                        </div>
                    ))}
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
