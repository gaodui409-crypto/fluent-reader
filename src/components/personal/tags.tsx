import * as React from "react"
import { useEffect, useRef, useState } from "react"
import intl from "react-intl-universal"
import {
    Dialog,
    DialogFooter,
    PrimaryButton,
    DefaultButton,
    TextField,
    MessageBar,
    MessageBarType,
} from "@fluentui/react"
import { eq } from "drizzle-orm"
import { database, itemsTable } from "../../scripts/db"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { RSSItem, updateItemMeta } from "../../scripts/models/item"

export const editTags = (id: number) =>
    window.dispatchEvent(new CustomEvent("edit-tags", { detail: id }))

export default function TagsEditor() {
    const dispatch = useAppDispatch()
    const items = useAppSelector(state => state.items)
    const itemsRef = useRef(items)
    itemsRef.current = items

    const [targetItem, setTargetItem] = useState<RSSItem | null>(null)
    const [value, setValue] = useState("")
    const [allTags, setAllTags] = useState<string[]>([])
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        const edit = (event: CustomEvent<number>) => {
            const itemId = event.detail
            setError("")
            void window.personal
                .tags()
                .then(t => setAllTags(t.filter(x => !x.startsWith("主题/"))))
                .catch(() => {})

            const inStore = itemsRef.current[itemId]
            if (inStore) {
                setTargetItem(inStore)
                setValue((inStore.tags || []).join(", "))
                return
            }
            void database
                .select()
                .from(itemsTable)
                .where(eq(itemsTable._id, itemId))
                .then(([row]) => {
                    if (row) {
                        const loaded = row as unknown as RSSItem
                        setTargetItem(loaded)
                        setValue((loaded.tags || []).join(", "))
                    }
                })
                .catch(err => setError(String(err)))
        }
        window.addEventListener("edit-tags", edit)
        return () => window.removeEventListener("edit-tags", edit)
    }, [])

    function toggleChip(tag: string) {
        const parts = value
            .split(/[,，;；\n]/u)
            .map(s => s.trim())
            .filter(Boolean)
        const next = parts.includes(tag)
            ? parts.filter(t => t !== tag)
            : [...parts, tag]
        setValue(next.join(", "))
    }

    async function save() {
        if (!targetItem) return
        setBusy(true)
        try {
            const latest = itemsRef.current[targetItem._id] || targetItem
            await dispatch(
                updateItemMeta(latest, { tags: value.split(/[,，;；\n]/u) })
            )
            setTargetItem(null)
        } catch (err) {
            setError(String(err))
        } finally {
            setBusy(false)
        }
    }

    const currentSet = new Set(
        value
            .split(/[,，;；\n]/u)
            .map(s => s.trim())
            .filter(Boolean)
    )

    return (
        <Dialog
            hidden={targetItem === null}
            onDismiss={() => !busy && setTargetItem(null)}
            minWidth={420}
            modalProps={{
                styles: {
                    main: {
                        minWidth: "min(420px, calc(100vw - 24px))",
                        maxWidth: "min(520px, calc(100vw - 24px))",
                    },
                },
            }}
            dialogContentProps={{
                title: intl.get("personal.editTags"),
                closeButtonAriaLabel: intl.get("close"),
            }}>
            {error && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {intl.get("personal.failed")} {error}
                </MessageBar>
            )}
            <TextField
                label={intl.get("personal.tagsInput")}
                placeholder="例如：深度长文, 架构, 周末读"
                value={value}
                onChange={(_, v) => setValue(v || "")}
                multiline
                rows={2}
            />
            {allTags.length > 0 && (
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                        marginTop: "10px",
                    }}>
                    {allTags.slice(0, 20).map(tag => (
                        <DefaultButton
                            key={tag}
                            checked={currentSet.has(tag)}
                            onClick={() => toggleChip(tag)}>
                            #{tag}
                        </DefaultButton>
                    ))}
                </div>
            )}
            <DialogFooter>
                <PrimaryButton disabled={busy} onClick={() => void save()}>
                    {intl.get("personal.saveSettings")}
                </PrimaryButton>
                <DefaultButton
                    disabled={busy}
                    onClick={() => setTargetItem(null)}>
                    {intl.get("cancel")}
                </DefaultButton>
            </DialogFooter>
        </Dialog>
    )
}
