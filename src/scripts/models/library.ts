import { and, eq, inArray, lt, sql } from "drizzle-orm"
import { database, itemsTable } from "../db"
import type { AppThunk } from "../utils"
import { BATCH_UPDATE_ITEMS, MARK_ALL_READ, RSSItem } from "./item"
import { resolveSourcePreferences } from "../../source-preferences"
import intl from "react-intl-universal"
import { updateUnreadCounts } from "./source"
import { getServiceHooks } from "./service"
import type { OfflineTask } from "../../personal-types"

export type LibraryState = {
    saved: number[]
    offlineTasks?: Record<number, OfflineTask>
    removeLaterOnRead: boolean
    aiConfigured: boolean
    titles: Record<number, string>
}

export function libraryReducer(
    state: LibraryState = {
        saved: [],
        offlineTasks: {},
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
            await dispatch(loadLibrary()).catch(() => {})
            window.utils.showErrorBox(
                intl.get("personal.offlineFailed"),
                String(error)
            )
        }
    }
}

export function deleteOffline(id: number): AppThunk<Promise<void>> {
    return async dispatch => {
        try {
            await window.personal.deleteOffline?.(id)
            await dispatch(loadLibrary())
        } catch (error) {
            window.utils.showErrorBox(
                intl.get("personal.failed"),
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
            const allExpiredIds: number[] = []
            const serviceExpiredItems: RSSItem[] = []
            for (const source of Object.values(state.sources)) {
                const days = resolveSourcePreferences(
                    source,
                    state.groups,
                    state.preferences
                ).unreadExpiryDays
                if (!days) continue
                const rows = await database
                    .select({
                        _id: itemsTable._id,
                        source: itemsTable.source,
                        serviceRef: itemsTable.serviceRef,
                    })
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
                for (const row of rows) {
                    allExpiredIds.push(row._id)
                    if (row.serviceRef) {
                        serviceExpiredItems.push(row as unknown as RSSItem)
                    }
                }
            }
            if (allExpiredIds.length > 0) {
                for (
                    let offset = 0;
                    offset < allExpiredIds.length;
                    offset += 400
                ) {
                    await database
                        .update(itemsTable)
                        .set({ hasRead: true })
                        .where(
                            inArray(
                                itemsTable._id,
                                allExpiredIds.slice(offset, offset + 400)
                            )
                        )
                }
                const hooks = dispatch(getServiceHooks())
                for (const item of serviceExpiredItems) {
                    if (hooks.markRead) dispatch(hooks.markRead(item))
                }
                dispatch({
                    type: MARK_ALL_READ,
                    sids: [],
                    itemIds: allExpiredIds,
                })
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
            .select({ _id: itemsTable._id })
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
        const ids = rows.map(r => r._id)
        for (let offset = 0; offset < ids.length; offset += 400) {
            await database
                .update(itemsTable)
                .set({ readLater: false })
                .where(inArray(itemsTable._id, ids.slice(offset, offset + 400)))
        }
        dispatch({
            type: BATCH_UPDATE_ITEMS,
            itemIds: ids,
            changes: { readLater: false },
        })
    }
}
