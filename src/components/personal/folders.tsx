import * as React from "react"
import { useEffect, useState } from "react"
import {
    DefaultButton,
    Dialog,
    DialogFooter,
    Dropdown,
    MessageBar,
    PrimaryButton,
    TextField,
} from "@fluentui/react"
import type { ArticleFolder } from "../../archive-types"
import { useAppDispatch } from "../../scripts/reducer"
import { refreshArchive } from "../../scripts/models/archive"

export function useFolders() {
    const [folders, setFolders] = useState<ArticleFolder[]>([])
    const [error, setError] = useState("")
    useEffect(() => {
        let active = true
        const load = () =>
            window.personal
                .archiveFolders()
                .then(rows => {
                    if (active) {
                        setFolders(rows)
                        setError("")
                    }
                })
                .catch(e => {
                    if (active) setError(String(e))
                })
        void load()
        const off = window.personal.onChanged(() => void load())
        return () => {
            active = false
            off()
        }
    }, [])
    return { folders, error }
}
export function folderLabel(folder: ArticleFolder, folders: ArticleFolder[]) {
    const parent = folders.find(f => f.id === folder.parentId)
    return parent ? parent.name + " / " + folder.name : folder.name
}
export function FolderPicker({
    value,
    onChange,
    suggestion = "",
    disabled = false,
}: {
    value?: number
    onChange: (id: number) => void
    suggestion?: string
    disabled?: boolean
}) {
    const { folders, error } = useFolders()
    const [search, setSearch] = useState("")
    const [creating, setCreating] = useState(false)
    const [name, setName] = useState("")
    const [parent, setParent] = useState<number>(0)
    const [message, setMessage] = useState("")
    const [busy, setBusy] = useState(false)
    const suggested = suggestion
        .split(/[,，;；\n]/)[0]
        .trim()
        .slice(0, 100)
    async function create(name: string) {
        setBusy(true)
        setMessage("")
        try {
            const id = await window.personal.archiveSaveFolder({
                name,
                parentId: parent || null,
            })
            onChange(id)
            setCreating(false)
            setSearch("")
        } catch (e) {
            setMessage(String(e))
        } finally {
            setBusy(false)
        }
    }
    return (
        <div style={{ display: "grid", gap: 8, minWidth: 200 }}>
            <TextField
                ariaLabel="查找文件夹"
                placeholder="查找文件夹"
                value={search}
                onChange={(_, v) => setSearch(v)}
                disabled={disabled}
            />
            <Dropdown
                label="目标文件夹"
                selectedKey={value ?? null}
                disabled={disabled || busy}
                placeholder="选择文件夹"
                options={folders
                    .filter(
                        f =>
                            f.id === value ||
                            folderLabel(f, folders)
                                .toLocaleLowerCase()
                                .includes(search.toLocaleLowerCase())
                    )
                    .map(f => ({ key: f.id, text: folderLabel(f, folders) }))}
                onChange={(_, o) => onChange(Number(o.key))}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <DefaultButton
                    disabled={disabled || busy}
                    onClick={() => {
                        setName(suggested)
                        setCreating(!creating)
                    }}>
                    ＋新建文件夹
                </DefaultButton>
                {!!suggested && !creating && (
                    <DefaultButton
                        disabled={disabled || busy}
                        onClick={() => void create(suggested)}>
                        新建「{suggested}」
                    </DefaultButton>
                )}
            </div>
            {creating && (
                <>
                    <TextField
                        label="文件夹名称"
                        value={name}
                        onChange={(_, v) => setName(v)}
                        disabled={busy}
                    />
                    <Dropdown
                        label="上级文件夹"
                        selectedKey={parent}
                        options={[
                            { key: 0, text: "一级文件夹" },
                            ...folders
                                .filter(f => f.parentId === null)
                                .map(f => ({ key: f.id, text: f.name })),
                        ]}
                        onChange={(_, o) => setParent(Number(o.key))}
                    />
                    <PrimaryButton
                        disabled={busy || !name.trim()}
                        onClick={() => void create(name)}>
                        创建并选用
                    </PrimaryButton>
                </>
            )}
            {(error || message) && (
                <MessageBar messageBarType={1}>{message || error}</MessageBar>
            )}
        </div>
    )
}

export function openFolders(id?: number) {
    window.dispatchEvent(
        new CustomEvent("manage-article-folders", { detail: id })
    )
}

export function FolderManager() {
    const { folders, error } = useFolders(),
        dispatch = useAppDispatch()
    const [open, setOpen] = useState(false),
        [id, setId] = useState<number>(0)
    const [name, setName] = useState(""),
        [parent, setParent] = useState(0),
        [moveTo, setMoveTo] = useState(0)
    const [message, setMessage] = useState(""),
        [removing, setRemoving] = useState(false),
        [busy, setBusy] = useState(false)
    const choose = (id: number) => {
        const f = folders.find(f => f.id === id)
        setId(id)
        setName(f?.name || "")
        setParent(f?.parentId || 0)
        setRemoving(false)
        setMessage("")
    }
    useEffect(() => {
        const show = (e: CustomEvent<number>) => {
            choose(e.detail || 0)
            setOpen(true)
        }
        window.addEventListener("manage-article-folders", show)
        return () => window.removeEventListener("manage-article-folders", show)
    }, [folders])
    async function save() {
        setBusy(true)
        try {
            const saved = await window.personal.archiveSaveFolder({
                id: id || undefined,
                name,
                parentId: parent || null,
            })
            setId(saved)
            setMessage("文件夹已保存")
            await dispatch(refreshArchive())
        } catch (e) {
            setMessage(String(e))
        } finally {
            setBusy(false)
        }
    }
    async function remove() {
        setBusy(true)
        try {
            await window.personal.archiveDeleteFolder(id, moveTo || null)
            choose(0)
            setMessage("已移除文件夹，文章已保留")
            await dispatch(refreshArchive())
        } catch (e) {
            setMessage(String(e))
        } finally {
            setBusy(false)
        }
    }
    return (
        <Dialog
            hidden={!open}
            onDismiss={() => !busy && setOpen(false)}
            minWidth={480}
            modalProps={{
                styles: {
                    main: {
                        minWidth: "min(480px, calc(100vw - 24px))",
                        maxWidth: "calc(100vw - 24px)",
                        maxHeight: "90vh",
                    },
                },
            }}
            dialogContentProps={{ title: "文章文件夹" }}>
            <div style={{ display: "grid", gap: 12 }}>
                <Dropdown
                    label="管理文件夹"
                    selectedKey={id}
                    options={[
                        { key: 0, text: "＋新建文件夹" },
                        ...folders.map(f => ({
                            key: f.id,
                            text: folderLabel(f, folders),
                        })),
                    ]}
                    onChange={(_, o) => choose(Number(o.key))}
                />
                <TextField
                    label="文件夹名称"
                    value={name}
                    onChange={(_, v) => setName(v)}
                />
                <Dropdown
                    label="上级文件夹"
                    selectedKey={parent}
                    options={[
                        { key: 0, text: "一级文件夹" },
                        ...folders
                            .filter(f => f.parentId === null && f.id !== id)
                            .map(f => ({ key: f.id, text: f.name })),
                    ]}
                    onChange={(_, o) => setParent(Number(o.key))}
                />
                {removing && (
                    <>
                        <MessageBar>
                            将移除这个文件夹及其子文件夹。文章会保留；没有其他归属的文章可在“未分类”找到。
                        </MessageBar>
                        <Dropdown
                            label="将文章归入"
                            selectedKey={moveTo}
                            options={[
                                { key: 0, text: "保留现有其他分类" },
                                ...folders
                                    .filter(
                                        f => f.id !== id && f.parentId !== id
                                    )
                                    .map(f => ({
                                        key: f.id,
                                        text: folderLabel(f, folders),
                                    })),
                            ]}
                            onChange={(_, o) => setMoveTo(Number(o.key))}
                        />
                        <PrimaryButton
                            disabled={busy}
                            onClick={() => void remove()}>
                            移除文件夹并保留文章
                        </PrimaryButton>
                    </>
                )}
                {(message || error) && (
                    <MessageBar>{message || error}</MessageBar>
                )}
            </div>
            <DialogFooter>
                <PrimaryButton
                    disabled={busy || !name.trim()}
                    onClick={() => void save()}>
                    保存
                </PrimaryButton>
                {!!id && (
                    <DefaultButton
                        disabled={busy}
                        onClick={() => setRemoving(!removing)}>
                        删除文件夹
                    </DefaultButton>
                )}
                <DefaultButton disabled={busy} onClick={() => setOpen(false)}>
                    关闭
                </DefaultButton>
            </DialogFooter>
        </Dialog>
    )
}
