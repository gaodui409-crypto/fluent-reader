import { AppThunk } from "../utils"
import {
    RSSItem,
    markRead,
    markUnread,
    toggleStarred,
    updateItemMeta,
} from "./item"
import { RSSFeed, FeedFilter } from "./feed"
import { initFeedSuccess } from "./feed"
import { database, itemsTable } from "../db"
import { inArray } from "drizzle-orm"

export type OrganizeState = { selected: number[]; anchor: number | null }
export function organizeReducer(
    state: OrganizeState = { selected: [], anchor: null },
    action: { type: string; selected?: number[]; anchor?: number }
) {
    if (
        [
            "SELECT_PAGE",
            "APPLY_FILTER",
            "SWITCH_VIEW",
            "CLEAR_SELECTION",
        ].includes(action.type)
    )
        return { selected: [], anchor: null }
    return action.type === "SELECT_ARTICLES"
        ? { selected: action.selected, anchor: action.anchor }
        : state
}
export function selectArticle(id: number, range = false): AppThunk {
    return (dispatch, getState) => {
        const state = getState()
        const feed = state.feeds[state.page.feedId]
        const ids = feed.iids.filter(
            iid =>
                state.items[iid] &&
                FeedFilter.testItem(feed.filter, state.items[iid])
        )
        const selected = new Set(state.organize.selected)
        const start = ids.indexOf(state.organize.anchor)
        const end = ids.indexOf(id)
        if (range && start >= 0 && end >= 0) {
            for (const iid of ids.slice(
                Math.min(start, end),
                Math.max(start, end) + 1
            ))
                selected.add(iid)
        } else if (selected.has(id)) selected.delete(id)
        else selected.add(id)
        dispatch({
            type: "SELECT_ARTICLES",
            selected: [...selected],
            anchor: range ? state.organize.anchor ?? id : id,
        })
    }
}

export type BatchAction =
    | "read"
    | "unread"
    | "star"
    | "unstar"
    | "later"
    | "unlater"
    | "topic"
export async function matchingArticles(
    feed: RSSFeed,
    selected: number[] | null,
    start: string,
    end: string
) {
    if (selected !== null) {
        if (!selected.length) return []
        return (await database
            .select()
            .from(itemsTable)
            .where(inArray(itemsTable._id, selected))) as RSSItem[]
    }
    const from = start ? new Date(start + "T00:00:00") : null
    const until = end ? new Date(end + "T00:00:00") : null
    if (until) until.setDate(until.getDate() + 1)
    if (
        (from && !Number.isFinite(+from)) ||
        (until && !Number.isFinite(+until)) ||
        (from && until && +from >= +until)
    )
        throw new Error("Invalid date range")
    const rows = await RSSFeed.loadFeed(feed, 0, -1)
    const ids = selected ? new Set(selected) : null
    return rows.filter(
        item =>
            (!ids || ids.has(item._id)) &&
            (!from || item.date >= from) &&
            (!until || item.date < until)
    )
}

export function applyBatch(
    rows: RSSItem[],
    action: BatchAction,
    topic = ""
): AppThunk<Promise<number>> {
    return async (dispatch, getState) => {
        // Freeze membership at preview, but never overwrite newer article state with the preview.
        const current: RSSItem[] = []
        const ids = [...new Set(rows.map(row => row._id))]
        for (let offset = 0; offset < ids.length; offset += 400) {
            current.push(
                ...((await database
                    .select()
                    .from(itemsTable)
                    .where(
                        inArray(itemsTable._id, ids.slice(offset, offset + 400))
                    )) as unknown as RSSItem[])
            )
        }
        dispatch(initFeedSuccess(new RSSFeed("BATCH", []), current))
        let done = 0
        for (const row of current) {
            const item = getState().items[row._id]
            if (action === "read") await dispatch(markRead(item, true))
            if (action === "unread") await dispatch(markUnread(item))
            if (
                (action === "star" && !item.starred) ||
                (action === "unstar" && item.starred)
            )
                await dispatch(toggleStarred(item))
            if (action === "later" || action === "unlater")
                await dispatch(
                    updateItemMeta(item, { readLater: action === "later" })
                )
            if (action === "topic")
                await dispatch(
                    updateItemMeta(item, {
                        tags: [
                            ...(item.tags || []).filter(
                                tag => !tag.startsWith("主题/")
                            ),
                            "主题/" + topic.trim(),
                        ],
                    })
                )
            done++
        }
        dispatch({ type: "CLEAR_SELECTION" })
        return done
    }
}
