import * as React from "react"
import { useEffect, useState } from "react"
import intl from "react-intl-universal"
import {
    Dialog,
    DialogFooter,
    PrimaryButton,
    DefaultButton,
    TextField,
    MessageBar,
} from "@fluentui/react"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { updateItemMeta } from "../../scripts/models/item"

export const editTags = (id: number) =>
    window.dispatchEvent(new CustomEvent("edit-tags", { detail: id }))

export default function TagsEditor() {
    const dispatch = useAppDispatch()
    const items = useAppSelector(state => state.items)
    const [id, setId] = useState<number>(null)
    const [value, setValue] = useState("")
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        const edit = (event: CustomEvent<number>) => {
            if (items[event.detail]) {
                setId(event.detail)
                setValue((items[event.detail].tags || []).join(", "))
                setError("")
            }
        }
        window.addEventListener("edit-tags", edit)
        return () => window.removeEventListener("edit-tags", edit)
    }, [items])
    async function save() {
        setBusy(true)
        try {
            await dispatch(
                updateItemMeta(items[id], { tags: value.split(/[,，;；\n]/u) })
            )
            setId(null)
        } catch (error) {
            setError(String(error))
        } finally {
            setBusy(false)
        }
    }
    return (
        <Dialog
            hidden={id === null}
            onDismiss={() => !busy && setId(null)}
            dialogContentProps={{
                title: intl.get("personal.editTags"),
                closeButtonAriaLabel: intl.get("close"),
            }}>
            {error && (
                <MessageBar>
                    {intl.get("personal.failed")} {error}
                </MessageBar>
            )}
            <TextField
                label={intl.get("personal.tagsInput")}
                value={value}
                onChange={(_, value) => setValue(value)}
                multiline
            />
            <DialogFooter>
                <PrimaryButton disabled={busy} onClick={() => void save()}>
                    {intl.get("personal.saveSettings")}
                </PrimaryButton>
                <DefaultButton disabled={busy} onClick={() => setId(null)}>
                    {intl.get("cancel")}
                </DefaultButton>
            </DialogFooter>
        </Dialog>
    )
}
