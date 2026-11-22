import type { ArchiveResult } from "../../archive-types"
import type { AppThunk } from "../utils"
import { database, itemsTable } from "../db"
import { inArray } from "drizzle-orm"
import { getServiceHooks } from "./service"
import { initFeedSuccess, initFeeds, RSSFeed } from "./feed"
import { RSSItem } from "./item"
import { updateUnreadCounts } from "./source"

export function refreshArchive(
    result?: ArchiveResult
): AppThunk<Promise<string>> {
    return async dispatch => {
        let syncFailures = 0
        if (result) {
            const ids = result.changes.map(c => c.id)
            const rows: RSSItem[] = []
            for (let i = 0; i < ids.length; i += 300)
                rows.push(
                    ...((await database
                        .select()
                        .from(itemsTable)
                        .where(
                            inArray(itemsTable._id, ids.slice(i, i + 300))
                        )) as RSSItem[])
                )
            dispatch(initFeedSuccess(new RSSFeed("ARCHIVE_UPDATE", []), rows))
            const hooks = dispatch(getServiceHooks())
            const byId = new Map(rows.map(row => [row._id, row]))
            for (const change of result.changes) {
                const item = byId.get(change.id)
                if (!item?.serviceRef) continue
                for (const [field, value] of Object.entries(change.fields)) {
                    const hook =
                        field === "hasRead"
                            ? value.after
                                ? hooks.markRead
                                : hooks.markUnread
                            : field === "starred"
                            ? value.after
                                ? hooks.star
                                : hooks.unstar
                            : undefined
                    if (hook)
                        try {
                            await dispatch(hook(item))
                        } catch (error) {
                            syncFailures++
                            console.error(error)
                        }
                }
            }
            dispatch({ type: "CLEAR_SELECTION" })
        }
        await dispatch(updateUnreadCounts())
        await dispatch(initFeeds(true))
        return syncFailures
            ? `（本地已生效，有 ${syncFailures} 篇未能同步至云端服务，稍后刷新会自动重试）`
            : ""
    }
}
