import * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
    DefaultButton,
    ITextField,
    MessageBar,
    MessageBarType,
    PrimaryButton,
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
window.addEventListener("beforeunload", event => {
    const dirty = [...drafts].filter(([, d]) => d.dirty || d.pending)
    if (closing || !dirty.length) return
    event.preventDefault()
    event.returnValue = false as unknown as string
    void Promise.all(dirty.map(([id]) => saveDraft(id))).then(() => {
        if ([...drafts.values()].every(d => !d.dirty && !d.pending)) {
            closing = true
            window.utils.closeWindow()
        }
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
        maxHeight: "240px",
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
    chips: {
        display: "flex",
        gap: "6px",
        flexWrap: "wrap",
    },
    pickerWrap: {
        display: "grid",
        gap: "8px",
        paddingTop: "4px",
        borderTop: "1px solid var(--neutralQuaternaryAlt)",
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
    const [folderId, setFolderId] = useState<number>()
    const [busy, setBusy] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
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
            void window.personal
                .archiveNote(id)
                .then(note => {
                    if (!drafts.has(id)) {
                        drafts.set(id, {
                            text: note.text,
                            version: note.version,
                            dirty: false,
                            error: "",
                        })
                        pruneDrafts(id)
                    }
                    change()
                })
                .catch(e => {
                    if (active) setError(String(e))
                })
        }

        const loadMembers = () =>
            window.personal
                .archiveMemberships(id)
                .then(ids => {
                    if (active) setMembers(ids)
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

    const applyFolder = useCallback(
        async (remove = false, member?: number) => {
            setBusy(true)
            try {
                const result = await window.personal.archiveApply([id], {
                    kind: remove ? "remove" : "folder",
                    folderId: remove ? member : folderId,
                })
                await dispatch(refreshArchive(result))
                setError("")
            } catch (e) {
                setError(String(e))
            } finally {
                setBusy(false)
            }
        },
        [dispatch, folderId, id]
    )

    return {
        draft,
        members,
        error,
        busy,
        folderId,
        setFolderId,
        updateText,
        saveNow,
        retryConflict,
        applyFolder,
    }
}

export function ArticleNotesDrawer({
    open,
    onClose,
    state,
}: {
    open: boolean
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
        error,
        busy,
        folderId,
        setFolderId,
        updateText,
        saveNow,
        retryConflict,
        applyFolder,
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
                    {members.length > 0 && (
                        <div className={classes.chips}>
                            {members.map(member => {
                                const folder = folders.find(
                                    f => f.id === member
                                )
                                return (
                                    <DefaultButton
                                        key={member}
                                        disabled={busy}
                                        title="移出此文件夹"
                                        onClick={() =>
                                            void applyFolder(true, member)
                                        }>
                                        {folder
                                            ? folderLabel(folder, folders)
                                            : "文件夹"}{" "}
                                        ×
                                    </DefaultButton>
                                )
                            })}
                        </div>
                    )}
                    <div className={classes.pickerWrap}>
                        <FolderPicker
                            compact
                            value={folderId}
                            onChange={setFolderId}
                            disabled={busy}
                            trailingActions={
                                <>
                                    <PrimaryButton
                                        disabled={busy || !folderId}
                                        onClick={() => void applyFolder()}>
                                        加入文件夹
                                    </PrimaryButton>
                                    <DefaultButton onClick={onClose}>
                                        收起面板
                                    </DefaultButton>
                                </>
                            }
                        />
                    </div>
                </div>
            ) : (
                <MessageBar messageBarType={MessageBarType.warning}>
                    {draft.error}
                </MessageBar>
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
                onClose={() => setOpen(false)}
                state={state}
            />
        </>
    )
}
