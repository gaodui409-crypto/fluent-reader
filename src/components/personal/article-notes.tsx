import * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
    DefaultButton,
    ITextField,
    MessageBar,
    MessageBarType,
    TextField,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { FolderPicker, folderLabel, useFolders } from "./folders"
import { useAppDispatch } from "../../scripts/reducer"
import { refreshArchive } from "../../scripts/models/archive"

type Draft = {
    text: string
    version: number
    dirty: boolean
    error: string
    pending?: Promise<void>
}

const MAX_CLEAN_DRAFTS = 300
const drafts = new Map<number, Draft>()
const listeners = new Map<number, Set<() => void>>()
const notify = (id: number) => listeners.get(id)?.forEach(fn => fn())

function pruneDrafts(keepId: number) {
    if (drafts.size <= MAX_CLEAN_DRAFTS) return
    for (const [key, entry] of drafts) {
        if (key !== keepId && !entry.dirty && !entry.pending && !entry.error) {
            drafts.delete(key)
        }
        if (drafts.size <= MAX_CLEAN_DRAFTS) break
    }
}

async function ensureDraft(id: number): Promise<Draft> {
    const existing = drafts.get(id)
    if (existing) return existing
    const note = await window.personal.archiveNote(id)
    const afterAwait = drafts.get(id)
    if (afterAwait) return afterAwait
    const created: Draft = {
        text: note.text,
        version: note.version,
        dirty: false,
        error: "",
    }
    drafts.set(id, created)
    pruneDrafts(id)
    notify(id)
    return created
}

async function saveDraft(id: number) {
    const draft = drafts.get(id)
    if (!draft || !draft.dirty) return
    if (draft.pending) return draft.pending
    draft.pending = (async () => {
        try {
            draft.error = ""
            while (draft.dirty) {
                const text = draft.text
                const saved = await window.personal.archiveSaveNote(
                    id,
                    text,
                    draft.version
                )
                draft.version = saved.version
                if (draft.text === text) draft.dirty = false
                notify(id)
            }
        } catch (e) {
            draft.error = String(e)
        } finally {
            draft.pending = undefined
            notify(id)
        }
    })()
    notify(id)
    return draft.pending
}

let closing = false
let promptingClose = false
window.addEventListener("beforeunload", event => {
    const dirty = [...drafts].filter(([, d]) => d.dirty || d.pending)
    if (closing || !dirty.length) return
    event.preventDefault()
    event.returnValue = false as unknown as string
    if (promptingClose) return
    promptingClose = true
    void Promise.all(dirty.map(([id]) => saveDraft(id)))
        .then(async () => {
            const remaining = [...drafts].filter(
                ([, d]) => d.dirty || d.pending
            )
            if (remaining.length === 0) {
                closing = true
                window.utils.closeWindow()
                return
            }
            const [failedId, failedDraft] = remaining[0]
            const exitAnyway = await window.utils.showMessageBox(
                "有文章备注未能自动保存",
                `当前有 ${remaining.length} 篇备注尚未保存成功（${
                    failedDraft.error || "版本冲突或写入异常"
                }）。选择「仍要退出」将放弃未保存修改直接关闭应用，选择「返回处理」可留在软件中重试。`,
                "仍要退出",
                "返回处理",
                true,
                "warning"
            )
            if (exitAnyway) {
                closing = true
                window.utils.closeWindow()
            } else {
                window.dispatchEvent(
                    new CustomEvent("open-article-notes", {
                        detail: { id: failedId },
                    })
                )
            }
        })
        .finally(() => {
            promptingClose = false
        })
})

const useStyles = makeStyles({
    drawer: {
        flexShrink: 0,
        borderBottom: "1px solid var(--neutralQuaternaryAlt)",
        backgroundColor: "var(--neutralLighterAlt)",
        padding: "10px 16px",
        boxSizing: "border-box",
    },
    inner: {
        maxHeight: "280px",
        overflowY: "auto",
        display: "grid",
        gap: "8px",
    },
    headerRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        flexWrap: "wrap",
    },
    status: {
        color: "var(--neutralSecondary)",
        fontSize: "12px",
    },
    chipsSection: {
        display: "grid",
        gap: "6px",
        paddingTop: "4px",
        borderTop: "1px solid var(--neutralQuaternaryAlt)",
    },
    chipsLabel: {
        fontSize: "12px",
        color: "var(--neutralSecondary)",
    },
    chips: {
        display: "flex",
        gap: "6px",
        flexWrap: "wrap",
    },
    chipBtn: {
        height: "28px",
        padding: "0 10px",
        fontSize: "12px",
        borderRadius: "999px",
    },
    pickerWrap: {
        display: "grid",
        gap: "8px",
        paddingTop: "4px",
    },
    actionsRow: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
    },
})

export function useArticleNotesState(id: number) {
    const dispatch = useAppDispatch()
    const [, update] = useState(0)
    const [error, setError] = useState("")
    const [members, setMembers] = useState<number[]>([])
    const [membersLoaded, setMembersLoaded] = useState(false)
    const [busy, setBusy] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    const latestIdRef = useRef(id)
    latestIdRef.current = id

    // Synchronously reset article-scoped state during render when switching items
    const [trackedId, setTrackedId] = useState(id)
    if (trackedId !== id) {
        setTrackedId(id)
        setMembers([])
        setMembersLoaded(false)
        setError("")
        setBusy(false)
    }

    const draft = drafts.get(id)

    useEffect(() => {
        let active = true
        const change = () => {
            if (active) update(n => n + 1)
        }
        const list = listeners.get(id) || new Set()
        list.add(change)
        listeners.set(id, list)

        if (!drafts.has(id)) {
            void ensureDraft(id).catch(e => {
                if (active) setError(String(e))
            })
        }

        const loadMembers = () =>
            window.personal
                .archiveMemberships(id)
                .then(ids => {
                    if (active) {
                        setMembers(ids)
                        setMembersLoaded(true)
                    }
                })
                .catch(e => {
                    if (active) setError(String(e))
                })
        void loadMembers()
        const off = window.personal.onChanged(() => void loadMembers())

        return () => {
            active = false
            off()
            list.delete(change)
            if (list.size === 0) listeners.delete(id)
            clearTimeout(timer.current)
            void saveDraft(id)
        }
    }, [id])

    const updateText = useCallback(
        (text: string) => {
            const current = drafts.get(id)
            if (!current) return
            current.text = text
            current.dirty = true
            notify(id)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => void saveDraft(id), 650)
        },
        [id]
    )

    const appendQuote = useCallback(
        async (rawQuote: string) => {
            const targetId = id
            const trimmed = (rawQuote || "").trim()
            if (!trimmed) return
            try {
                const current = await ensureDraft(targetId)
                const quotedBlock =
                    trimmed
                        .split(/\r?\n/)
                        .map(line => `> ${line}`)
                        .join("\n") + "\n\n"
                const prefix = current.text.trim()
                    ? current.text.replace(/\s*$/, "\n\n")
                    : ""
                current.text = prefix + quotedBlock
                current.dirty = true
                notify(targetId)
                clearTimeout(timer.current)
                await saveDraft(targetId)
            } catch (e) {
                if (latestIdRef.current === targetId) {
                    setError(String(e))
                }
            }
        },
        [id]
    )

    const saveNow = useCallback(() => {
        clearTimeout(timer.current)
        void saveDraft(id)
    }, [id])

    const retryConflict = useCallback(() => {
        const current = drafts.get(id)
        if (!current) return
        void window.personal
            .archiveNote(id)
            .then(note => {
                current.version = note.version
                current.dirty = true
                return saveDraft(id)
            })
            .catch(err => {
                current.error = String(err)
                notify(id)
            })
    }, [id])

    const toggleFolder = useCallback(
        async (targetFolderId: number) => {
            const targetId = id
            if (!targetFolderId || !membersLoaded) return
            const isMember = members.includes(targetFolderId)
            setBusy(true)
            try {
                const result = await window.personal.archiveApply([targetId], {
                    kind: isMember ? "remove" : "folder",
                    folderId: targetFolderId,
                })
                await dispatch(refreshArchive(result))
                if (latestIdRef.current === targetId) setError("")
            } catch (e) {
                if (latestIdRef.current === targetId) setError(String(e))
            } finally {
                if (latestIdRef.current === targetId) setBusy(false)
            }
        },
        [dispatch, id, members, membersLoaded]
    )

    return {
        draft,
        members,
        membersLoaded,
        error,
        busy,
        updateText,
        appendQuote,
        saveNow,
        retryConflict,
        toggleFolder,
    }
}

export function ArticleNotesDrawer({
    open,
    onOpen,
    onClose,
    state,
}: {
    open: boolean
    onOpen?: () => void
    onClose: () => void
    state: ReturnType<typeof useArticleNotesState>
}) {
    const classes = useStyles()
    const { folders } = useFolders()
    const noteFieldRef = useRef<ITextField>(null)
    const wasOpenRef = useRef(false)
    const {
        draft,
        members,
        membersLoaded,
        error,
        busy,
        updateText,
        saveNow,
        retryConflict,
        toggleFolder,
    } = state

    useEffect(() => {
        if (open && !wasOpenRef.current && draft) {
            wasOpenRef.current = true
            requestAnimationFrame(() => {
                noteFieldRef.current?.focus()
            })
        } else if (!open) {
            wasOpenRef.current = false
        }
    }, [open, draft])

    if (!open && !draft?.error) return null

    return (
        <div
            data-reader-drawer="true"
            className={classes.drawer}
            onKeyDown={e => {
                if (
                    e.key === "Escape" &&
                    open &&
                    !e.ctrlKey &&
                    !e.altKey &&
                    !e.metaKey
                ) {
                    e.preventDefault()
                    e.stopPropagation()
                    onClose()
                }
            }}>
            {open ? (
                <div className={classes.inner}>
                    <div className={classes.headerRow}>
                        <strong>备注与归类</strong>
                        <span className={classes.status} role="status">
                            {draft?.error ||
                                error ||
                                (draft?.pending
                                    ? "正在自动保存…"
                                    : draft?.dirty
                                    ? "待自动保存"
                                    : draft
                                    ? "已自动保存"
                                    : "正在载入…")}
                        </span>
                    </div>
                    <TextField
                        componentRef={noteFieldRef}
                        label="文章备注"
                        placeholder="记下读后感、摘录或待办事项，支持全文检索…"
                        multiline
                        autoAdjustHeight
                        rows={2}
                        value={draft?.text || ""}
                        disabled={!draft}
                        onChange={(_, text) => updateText(text || "")}
                        onBlur={saveNow}
                    />
                    {!!draft?.error && (
                        <div className={classes.actionsRow}>
                            <MessageBar messageBarType={MessageBarType.warning}>
                                {draft.error}
                            </MessageBar>
                            <DefaultButton onClick={retryConflict}>
                                保留当前输入并重试保存
                            </DefaultButton>
                        </div>
                    )}
                    {folders.length > 0 && folders.length <= 12 && (
                        <div className={classes.chipsSection}>
                            <span className={classes.chipsLabel}>
                                点击直接归入或移出文件夹：
                            </span>
                            <div
                                className={classes.chips}
                                role="group"
                                aria-label="归类文件夹">
                                {folders.map(folder => {
                                    const inFolder = members.includes(folder.id)
                                    const label = folderLabel(folder, folders)
                                    return (
                                        <DefaultButton
                                            key={folder.id}
                                            className={classes.chipBtn}
                                            disabled={busy || !membersLoaded}
                                            checked={inFolder}
                                            aria-pressed={inFolder}
                                            title={
                                                inFolder
                                                    ? `点击将文章移出「${label}」`
                                                    : `点击将文章归入「${label}」`
                                            }
                                            onClick={() =>
                                                void toggleFolder(folder.id)
                                            }>
                                            {inFolder ? "✓ " : "＋ "}
                                            {label}
                                        </DefaultButton>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                    <div className={classes.pickerWrap}>
                        <FolderPicker
                            compact
                            memberIds={members}
                            onChange={selectedId =>
                                void toggleFolder(selectedId)
                            }
                            disabled={busy || !membersLoaded}
                            trailingActions={
                                <DefaultButton onClick={onClose}>
                                    收起面板
                                </DefaultButton>
                            }
                        />
                    </div>
                </div>
            ) : (
                <div className={classes.actionsRow}>
                    <MessageBar messageBarType={MessageBarType.warning}>
                        {draft.error}
                    </MessageBar>
                    {onOpen && (
                        <DefaultButton onClick={onOpen}>展开处理</DefaultButton>
                    )}
                    <DefaultButton onClick={retryConflict}>
                        重试保存
                    </DefaultButton>
                </div>
            )}
        </div>
    )
}

export function ArticleNotes({ id }: { id: number }) {
    const [open, setOpen] = useState(false)
    const state = useArticleNotesState(id)
    return (
        <>
            <DefaultButton onClick={() => setOpen(v => !v)}>
                {open ? "收起备注与归类" : "备注与归类"}
            </DefaultButton>
            <ArticleNotesDrawer
                open={open}
                onOpen={() => setOpen(true)}
                onClose={() => setOpen(false)}
                state={state}
            />
        </>
    )
}
