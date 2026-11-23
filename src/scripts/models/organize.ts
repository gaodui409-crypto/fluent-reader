import { AppThunk } from "../utils"
import { FeedFilter } from "./feed"

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
        if (!feed) return
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

export function selectAllLoaded(): AppThunk {
    return (dispatch, getState) => {
        const state = getState()
        const feed = state.feeds[state.page.feedId]
        if (!feed) return
        const visibleIds = feed.iids.filter(
            iid =>
                state.items[iid] &&
                FeedFilter.testItem(feed.filter, state.items[iid])
        )
        if (!visibleIds.length) return
        const allSelected = visibleIds.every(id =>
            state.organize.selected.includes(id)
        )
        dispatch({
            type: "SELECT_ARTICLES",
            selected: allSelected ? [] : visibleIds,
            anchor: allSelected ? null : visibleIds[0],
        })
    }
}
