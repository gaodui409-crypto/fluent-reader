import { and, eq, lt, sql } from "drizzle-orm"
import { database, itemsTable } from "../db"
import type { AppThunk } from "../utils"
import { RSSItem, markRead, updateItemMeta } from "./item"
import { resolveSourcePreferences } from "../../source-preferences"
import intl from "react-intl-universal"
import { updateUnreadCounts } from "./source"

type LibraryState = {
    saved: number[]
    removeLaterOnRead: boolean
    aiConfigured: boolean
    titles: Record<number, string>
}
export function libraryReducer(
    state: LibraryState = {
        saved: [],
        removeLaterOnRead: false,
        aiConfigured: false,
        titles: {},
    },
    action: { type: string; library?: LibraryState }
) {
    return action.type === "LIBRARY_STATE" ? action.library : state
}
export function loadLibrary(): AppThunk<Promise<void>> {
    return async dispatch => {
        dispatch({
            type: "LIBRARY_STATE",
            library: await window.personal.library(),
        })
    }
}
export function saveOffline(id: number): AppThunk<Promise<void>> {
    return async dispatch => {
        try {
            await window.personal.saveOffline(id)
            await dispatch(loadLibrary())
        } catch (error) {
            window.utils.showErrorBox(
                intl.get("personal.offlineFailed"),
                String(error)
            )
        }
    }
}
export function openOffline(id: number, reveal = false) {
    void window.personal
        .openOffline(id, reveal)
        .catch(error =>
            window.utils.showErrorBox(
                intl.get("personal.failed"),
                String(error)
            )
        )
}
let expiring = false
export function expireUnread(): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        if (expiring) return
        expiring = true
        try {
            const state = getState()
            for (const source of Object.values(state.sources)) {
                const days = resolveSourcePreferences(
                    source,
                    state.groups,
                    state.preferences
                ).unreadExpiryDays
                if (!days) continue
                const rows = await database
                    .select()
                    .from(itemsTable)
                    .where(
                        and(
                            eq(itemsTable.source, source.sid),
                            eq(itemsTable.hasRead, false),
                            eq(itemsTable.starred, false),
                            eq(itemsTable.readLater, false),
                            sql`${itemsTable.kept}=0 AND NOT EXISTS(SELECT 1 FROM folder_articles f WHERE f.itemId=${itemsTable._id}) AND NOT EXISTS(SELECT 1 FROM article_notes n WHERE n.itemId=${itemsTable._id} AND length(n.text)>0)`,
                            lt(
                                itemsTable.date,
                                new Date(Date.now() - days * 86400000)
                            )
                        )
                    )
                for (const row of rows)
                    await dispatch(markRead(row as unknown as RSSItem))
            }
        } finally {
            expiring = false
            await dispatch(updateUnreadCounts())
        }
    }
}
export function clearReadLater(): AppThunk<Promise<void>> {
    return async dispatch => {
        const rows = await database
            .select()
            .from(itemsTable)
            .where(
                and(
                    eq(itemsTable.hasRead, true),
                    eq(itemsTable.readLater, true)
                )
            )
        if (!rows.length) return
        const confirmed = await window.utils.showMessageBox(
            intl.get("personal.clearReadLater"),
            intl.get("organize.clearLaterConfirm", { count: rows.length }),
            intl.get("organize.confirm"),
            intl.get("cancel"),
            true
        )
        if (!confirmed) return
        for (const row of rows)
            await dispatch(
                updateItemMeta(row as unknown as RSSItem, { readLater: false })
            )
    }
}
