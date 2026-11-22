import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { DefaultButton, PrimaryButton } from "@fluentui/react"
import { makeStyles, mergeClasses } from "@griffel/react"
import { ArchiveAction, ArchiveResult } from "../../../archive-types"
import { useAppDispatch, useAppSelector } from "../../../scripts/reducer"
import { refreshArchive } from "../../../scripts/models/archive"
import { FolderPicker } from "../folders"

const useStyles = makeStyles({
    selection: {
        position: "relative",
        zIndex: 4,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        backgroundColor: "var(--neutralLighterAlt)",
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        boxSizing: "border-box",
    },
    inset: {
        "@media (min-width: 1280px)": {
            marginLeft: "var(--sidebarWidth, 276px)",
        },
    },
    row: {
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "center",
    },
    folderPanel: {
        width: "100%",
        maxWidth: "500px",
        paddingTop: "4px",
    },
    statusMessage: {
        color: "var(--neutralPrimary)",
        fontSize: "13px",
    },
})

export function ArticleSelectionBar() {
    const c = useStyles()
    const dispatch = useAppDispatch()
    const selected = useAppSelector(s => s.organize.selected)
    const settings = useAppSelector(s => s.app.settings.display)
    const menu = useAppSelector(s => s.app.menu)
    const feed = useAppSelector(s => s.feeds[s.page.feedId])
    const [folders, setFolders] = useState(false)
    const [folderId, setFolderId] = useState<number>()
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState("")
    const [result, setResult] = useState<ArchiveResult>()
    const ref = useRef<HTMLElement>(null)

    useEffect(() => {
        const receive = (
            e: CustomEvent<{ result?: ArchiveResult; message: string }>
        ) => {
            setResult(e.detail.result)
            setMessage(e.detail.message)
        }
        window.addEventListener("archive-result", receive)
        return () => window.removeEventListener("archive-result", receive)
    }, [])

    useEffect(() => {
        const n = ref.current
        const update = () =>
            document.documentElement.style.setProperty(
                "--selectionHeight",
                (!settings && n ? n.getBoundingClientRect().height : 0) + "px"
            )
        update()
        if (!n) return
        const o = new ResizeObserver(update)
        o.observe(n)
        return () => {
            o.disconnect()
            document.documentElement.style.setProperty(
                "--selectionHeight",
                "0px"
            )
        }
    }, [selected.length, settings, message, folders])

    async function run(action: ArchiveAction) {
        setBusy(true)
        setMessage("")
        try {
            const r = await window.personal.archiveApply(selected, action)
            setResult(r)
            setFolders(false)
            setMessage(
                `已处理 ${r.count} 篇${await dispatch(refreshArchive(r))}`
            )
        } catch (e) {
            setMessage(String(e))
        } finally {
            setBusy(false)
        }
    }

    async function undo() {
        if (!result) return
        setBusy(true)
        try {
            const r = await window.personal.archiveUndo(result.batchId)
            setResult(undefined)
            setMessage(
                `已撤销 ${r.count} 篇${
                    r.skipped ? `，保留 ${r.skipped} 项后续修改` : ""
                }`
            )
            await dispatch(refreshArchive(r))
        } catch (e) {
            setMessage(String(e))
        } finally {
            setBusy(false)
        }
    }

    if (settings || (!selected.length && !message)) return null

    return (
        <section
            ref={ref}
            role="toolbar"
            aria-label="文章选择"
            className={mergeClasses(c.selection, menu && c.inset)}>
            {!!selected.length && (
                <>
                    <strong>已选 {selected.length} 篇</strong>
                    <PrimaryButton
                        disabled={busy}
                        onClick={() => void run({ kind: "read" })}>
                        标为已读
                    </PrimaryButton>
                    <DefaultButton
                        disabled={busy}
                        onClick={() => void run({ kind: "star" })}>
                        收藏
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        onClick={() => void run({ kind: "later" })}>
                        稍后读
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        checked={folders}
                        onClick={() => setFolders(!folders)}>
                        加入文件夹
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        menuProps={{
                            items: [
                                ...[
                                    ["unread", "标为未读"],
                                    ["unstar", "取消收藏"],
                                    ["unlater", "移出稍后读"],
                                    ["hide", "隐藏"],
                                    ["restore", "恢复到订阅流"],
                                ].map(([kind, text]) => ({
                                    key: kind,
                                    text,
                                    onClick: () =>
                                        void run({
                                            kind: kind as ArchiveAction["kind"],
                                        }),
                                })),
                                ...(feed?.filter.folderId
                                    ? [
                                          {
                                              key: "remove",
                                              text: "移出当前文件夹",
                                              onClick: () =>
                                                  void run({
                                                      kind: "remove",
                                                      folderId:
                                                          feed.filter.folderId,
                                                  }),
                                          },
                                      ]
                                    : []),
                            ],
                        }}>
                        更多操作
                    </DefaultButton>
                    <DefaultButton
                        disabled={busy}
                        onClick={() => {
                            dispatch({ type: "CLEAR_SELECTION" })
                            setFolders(false)
                        }}>
                        取消选择
                    </DefaultButton>
                </>
            )}
            {folders && !!selected.length && (
                <div className={c.folderPanel}>
                    <FolderPicker
                        value={folderId}
                        onChange={setFolderId}
                        disabled={busy}
                    />
                    <div className={c.row} style={{ marginTop: 8 }}>
                        <PrimaryButton
                            disabled={busy || !folderId}
                            onClick={() =>
                                void run({ kind: "folder", folderId })
                            }>
                            加入所选文件夹
                        </PrimaryButton>
                        {!!feed?.filter.folderId && (
                            <DefaultButton
                                disabled={busy || !folderId}
                                onClick={() =>
                                    void run({
                                        kind: "folder",
                                        folderId,
                                        fromFolderId: feed.filter.folderId,
                                    })
                                }>
                                从当前文件夹移动
                            </DefaultButton>
                        )}
                    </div>
                </div>
            )}
            {!!message && (
                <>
                    <span className={c.statusMessage} role="status">
                        {message}
                    </span>
                    {result && result.count > 0 && (
                        <DefaultButton
                            disabled={busy}
                            onClick={() => void undo()}>
                            撤销
                        </DefaultButton>
                    )}
                    <DefaultButton
                        disabled={busy}
                        onClick={() => setMessage("")}>
                        收起提示
                    </DefaultButton>
                </>
            )}
        </section>
    )
}
