import * as React from "react"
import { useEffect, useRef, useState } from "react"
import {
    DefaultButton,
    MessageBar,
    PrimaryButton,
    TextField,
} from "@fluentui/react"
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
const drafts = new Map<number, Draft>(),
    listeners = new Map<number, Set<() => void>>()
const notify = (id: number) => listeners.get(id)?.forEach(fn => fn())
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

export function ArticleNotes({ id }: { id: number }) {
    const dispatch = useAppDispatch(),
        { folders } = useFolders()
    const [open, setOpen] = useState(false),
        [, update] = useState(0),
        [error, setError] = useState("")
    const [members, setMembers] = useState<number[]>([]),
        [folderId, setFolderId] = useState<number>(),
        [busy, setBusy] = useState(false)
    const ref = useRef<HTMLDivElement>(null),
        timer = useRef<ReturnType<typeof setTimeout>>(undefined)
    const draft = drafts.get(id)
    useEffect(() => {
        let active = true
        const change = () => {
            if (active) update(n => n + 1)
        }
        const list = listeners.get(id) || new Set()
        list.add(change)
        listeners.set(id, list)
        if (!drafts.has(id))
            void window.personal
                .archiveNote(id)
                .then(note => {
                    if (!drafts.has(id))
                        drafts.set(id, {
                            text: note.text,
                            version: note.version,
                            dirty: false,
                            error: "",
                        })
                    change()
                })
                .catch(e => {
                    if (active) setError(String(e))
                })
        const load = () =>
            window.personal
                .archiveMemberships(id)
                .then(ids => {
                    if (active) setMembers(ids)
                })
                .catch(e => {
                    if (active) setError(String(e))
                })
        void load()
        const off = window.personal.onChanged(() => void load())
        return () => {
            active = false
            off()
            list.delete(change)
            clearTimeout(timer.current)
            void saveDraft(id)
        }
    }, [id])
    useEffect(() => {
        const node = ref.current,
            article = node?.closest<HTMLElement>(".article")
        if (!node || !article) return
        const measure = () =>
            article.style.setProperty(
                "--notesHeight",
                node.getBoundingClientRect().height + "px"
            )
        measure()
        const o = new ResizeObserver(measure)
        o.observe(node)
        return () => {
            o.disconnect()
            article.style.setProperty("--notesHeight", "0px")
        }
    }, [])
    const apply = async (remove = false, member?: number) => {
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
    }
    return (
        <div
            ref={ref}
            style={{
                flexShrink: 0,
                borderBottom: "1px solid var(--neutralQuaternaryAlt)",
                padding: "4px 12px",
                boxSizing: "border-box",
            }}
            onKeyDown={e => e.stopPropagation()}>
            <DefaultButton onClick={() => setOpen(!open)}>
                {open ? "收起备注与归类" : "备注与归类"}
                {draft?.text ? " · 有备注" : ""}
                {members.length ? ` · ${members.length} 个文件夹` : ""}
            </DefaultButton>
            {open && (
                <div
                    style={{
                        maxHeight: 280,
                        overflowY: "auto",
                        padding: "8px 0",
                        display: "grid",
                        gap: 8,
                    }}>
                    <TextField
                        label="文章备注"
                        multiline
                        rows={3}
                        value={draft?.text || ""}
                        disabled={!draft}
                        onChange={(_, text) => {
                            draft.text = text
                            draft.dirty = true
                            notify(id)
                            clearTimeout(timer.current)
                            timer.current = setTimeout(
                                () => void saveDraft(id),
                                650
                            )
                        }}
                        onBlur={() => void saveDraft(id)}
                    />
                    <small role="status">
                        {draft?.error ||
                            error ||
                            (draft?.pending
                                ? "正在保存…"
                                : draft?.dirty
                                ? "待保存"
                                : draft
                                ? "已保存"
                                : "正在载入…")}
                    </small>
                    {!!draft?.error && (
                        <DefaultButton
                            onClick={() => {
                                void window.personal
                                    .archiveNote(id)
                                    .then(note => {
                                        draft.version = note.version
                                        return saveDraft(id)
                                    })
                                    .catch(error => {
                                        draft.error = String(error)
                                        notify(id)
                                    })
                            }}>
                            保留当前输入并重试保存
                        </DefaultButton>
                    )}
                    <div>
                        {members.map(member => (
                            <DefaultButton
                                key={member}
                                disabled={busy}
                                title="移出此文件夹"
                                onClick={() => void apply(true, member)}>
                                {folders.find(f => f.id === member)
                                    ? folderLabel(
                                          folders.find(f => f.id === member),
                                          folders
                                      )
                                    : "文件夹"}{" "}
                                ×
                            </DefaultButton>
                        ))}
                    </div>
                    <FolderPicker
                        value={folderId}
                        onChange={setFolderId}
                        disabled={busy}
                    />
                    <PrimaryButton
                        disabled={busy || !folderId}
                        onClick={() => void apply()}>
                        加入文件夹
                    </PrimaryButton>
                </div>
            )}
            {!open && draft?.error && (
                <MessageBar messageBarType={1}>{draft.error}</MessageBar>
            )}
        </div>
    )
}
