import { getRulesForTarget } from "./rule"
import { eq, and, lte, gte, inArray } from "drizzle-orm"
import { database, itemsTable, itemsInSources } from "../db"
import { getValidDate } from "../date"
import { findCoverImage, resolveHTTPURL } from "../cover"
import { isLinuxDo } from "../../linuxdo"
import { resolveSourcePreferences } from "../../source-preferences"
import intl from "react-intl-universal"
import type { MyParserItem } from "../utils"
import { htmlDecode, ActionStatus, AppThunk, platformCtrl } from "../utils"
import { RSSSource, updateSource, updateUnreadCounts } from "./source"
import {
    FeedActionTypes,
    INIT_FEED,
    LOAD_MORE,
    dismissItems,
    RSSFeed,
} from "./feed"
import {
    pushNotification,
    setupAutoFetch,
    SettingsActionTypes,
    FREE_MEMORY,
    REFRESH_STATUS,
} from "./app"
import { initFeeds } from "./feed"
import {
    getServiceHooks,
    syncWithService,
    ServiceActionTypes,
    SYNC_LOCAL_ITEMS,
} from "./service"

export class RSSItem {
    _id: number
    source: number
    guid?: string
    title: string
    link: string
    date: Date
    fetchedDate: Date
    thumb?: string
    content: string
    snippet: string
    creator?: string
    hasRead: boolean
    starred: boolean
    hidden: boolean
    feedHidden?: boolean
    kept?: boolean
    notify: boolean
    serviceRef?: string
    readLater?: boolean
    highlight?: string
    tags?: string[]
    saveRequested?: boolean

    static normalize(item: RSSItem) {
        item.title =
            typeof item.title === "string" && item.title
                ? item.title
                : intl.get("article.untitled")
        for (const field of ["link", "content", "snippet"] as const) {
            if (typeof item[field] !== "string") item[field] = ""
        }
        for (const field of ["thumb", "creator", "guid"] as const) {
            if (typeof item[field] !== "string") delete item[field]
        }
        item.fetchedDate = getValidDate(item.fetchedDate, item.date)
        item.date = getValidDate(item.date, item.fetchedDate)
    }

    constructor(item: MyParserItem, source: RSSSource) {
        for (let field of ["title", "link", "creator", "author"]) {
            const content = item[field]
            if (content && typeof content !== "string") delete item[field]
        }
        this.source = source.sid
        if (!source.serviceRef) {
            this.guid = [item.guid, item.id].find(
                value => typeof value === "string" && value.trim().length > 0
            )
        }
        this.title = item.title || intl.get("article.untitled")
        this.link = resolveHTTPURL(item.link, source.url) || ""
        this.fetchedDate = new Date()
        this.date = getValidDate(item.isoDate, item.pubDate, this.fetchedDate)
        this.creator = item.creator || item.author
        if (false && isLinuxDo(source.url) && Array.isArray(item.categories))
            this.tags = [
                ...new Set(
                    item.categories
                        .filter(t => typeof t === "string" && t.trim())
                        .map(t => t.trim())
                ),
            ].slice(0, 30)
        this.hasRead = false
        this.starred = false
        this.hidden = false
        this.notify = false
    }

    static parseContent(item: RSSItem, parsed: MyParserItem, feedURL?: string) {
        for (let field of ["thumb", "content", "fullContent"]) {
            const content = parsed[field]
            if (content && typeof content !== "string") delete parsed[field]
        }
        if (parsed.fullContent) {
            item.content = parsed.fullContent
            item.snippet = htmlDecode(parsed.fullContent)
        } else {
            item.content = parsed.content || ""
            item.snippet = htmlDecode(parsed.contentSnippet || "")
        }
        item.thumb = findCoverImage(parsed, item.content, item.link, feedURL)
    }
}

export type ItemState = {
    [_id: number]: RSSItem
}

export const FETCH_ITEMS = "FETCH_ITEMS"
export const MARK_READ = "MARK_READ"
export const MARK_ALL_READ = "MARK_ALL_READ"
export const MARK_UNREAD = "MARK_UNREAD"
export const TOGGLE_STARRED = "TOGGLE_STARRED"
export const TOGGLE_HIDDEN = "TOGGLE_HIDDEN"
export const UPDATE_ITEM_META = "UPDATE_ITEM_META"
export const BATCH_UPDATE_ITEMS = "BATCH_UPDATE_ITEMS"

interface FetchItemsAction {
    type: typeof FETCH_ITEMS
    status: ActionStatus
    fetchCount?: number
    items?: RSSItem[]
    itemState?: ItemState
    errSource?: RSSSource
    err?
}

interface MarkReadAction {
    type: typeof MARK_READ
    item: RSSItem
}

interface MarkAllReadAction {
    type: typeof MARK_ALL_READ
    sids: number[]
    time?: number
    before?: boolean
    itemIds?: number[]
}

interface MarkUnreadAction {
    type: typeof MARK_UNREAD
    item: RSSItem
}

interface ToggleStarredAction {
    type: typeof TOGGLE_STARRED
    item: RSSItem
}

interface ToggleHiddenAction {
    type: typeof TOGGLE_HIDDEN
    item: RSSItem
}

interface BatchUpdateItemsAction {
    type: typeof BATCH_UPDATE_ITEMS
    itemIds: number[]
    changes: Partial<RSSItem>
}

export type ItemActionTypes =
    | { type: typeof UPDATE_ITEM_META; item: RSSItem }
    | BatchUpdateItemsAction
    | FetchItemsAction
    | MarkReadAction
    | MarkAllReadAction
    | MarkUnreadAction
    | ToggleStarredAction
    | ToggleHiddenAction

export function updateItemMeta(
    item: RSSItem,
    changes: { tags?: string[]; readLater?: boolean }
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        if (changes.readLater !== undefined)
            pendingReadLaterEvictions.delete(item._id)
        if (changes.tags)
            changes.tags = [
                ...new Set(changes.tags.map(tag => tag.trim()).filter(Boolean)),
            ].slice(0, 50)
        await database
            .update(itemsTable)
            .set(changes)
            .where(eq(itemsTable._id, item._id))
        dispatch({
            type: UPDATE_ITEM_META,
            item: { ...(getState().items[item._id] || item), ...changes },
        })
    }
}

export function fetchItemsRequest(fetchCount = 0): ItemActionTypes {
    return {
        type: FETCH_ITEMS,
        status: ActionStatus.Request,
        fetchCount: fetchCount,
    }
}

export function fetchItemsSuccess(
    items: RSSItem[],
    itemState: ItemState
): ItemActionTypes {
    return {
        type: FETCH_ITEMS,
        status: ActionStatus.Success,
        items: items,
        itemState: itemState,
    }
}

export function fetchItemsFailure(source: RSSSource, err): ItemActionTypes {
    return {
        type: FETCH_ITEMS,
        status: ActionStatus.Failure,
        errSource: source,
        err: err,
    }
}

export function fetchItemsIntermediate(): ItemActionTypes {
    return {
        type: FETCH_ITEMS,
        status: ActionStatus.Intermediate,
    }
}

export async function insertItems(items: RSSItem[]): Promise<RSSItem[]> {
    if (items.length === 0) return []
    // Service integrations construct articles without going through RSSItem.
    for (const item of items) {
        RSSItem.normalize(item)
    }
    items.sort((a, b) => a.date.getTime() - b.date.getTime())
    const values = items.map(item => ({
        source: item.source,
        guid: item.guid || null,
        title: item.title,
        link: item.link,
        date: item.date,
        fetchedDate: item.fetchedDate,
        thumb: item.thumb || null,
        content: item.content,
        snippet: item.snippet,
        creator: item.creator || null,
        hasRead: item.hasRead,
        starred: item.starred,
        hidden: item.hidden,
        feedHidden: item.feedHidden || false,
        kept: item.kept || false,
        notify: item.notify,
        serviceRef: item.serviceRef || null,
        readLater: item.readLater || false,
        highlight: item.highlight || "",
        tags: item.tags || [],
        saveRequested: item.saveRequested || false,
    }))
    // Bound SQL parameters and query construction even for large refreshes.
    const queries = []
    for (let i = 0; i < values.length; i += 50) {
        queries.push(
            database
                .insert(itemsTable)
                .values(values.slice(i, i + 50))
                .returning()
        )
    }
    const [first, ...rest] = queries
    const results = await database.batch([first, ...rest])
    const inserted = results.flat() as unknown as RSSItem[]
    // Background work is queued only after persistence succeeds. Its failures
    // must not turn a committed feed refresh into an import failure.
    await window.personal
        .afterInsert(inserted.map(item => item._id))
        .catch(console.error)
    for (let offset = 0; offset < inserted.length; offset += 300) {
        const batch = inserted.slice(offset, offset + 300)
        const rows = await database
            .select()
            .from(itemsTable)
            .where(
                inArray(
                    itemsTable._id,
                    batch.map(item => item._id)
                )
            )
        const byId = new Map(rows.map(row => [row._id, row]))
        for (const item of batch)
            if (byId.has(item._id)) Object.assign(item, byId.get(item._id))
    }
    return inserted
}

let refreshInFlight = false
export function fetchItems(
    background = false,
    sids: number[] = null
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        const initState = getState()
        if (
            refreshInFlight ||
            initState.app.fetchingItems ||
            initState.app.syncing
        )
            return
        refreshInFlight = true
        dispatch({ type: REFRESH_STATUS, phase: "start" })
        try {
            if (
                sids === null ||
                sids.filter(sid => !!initState.sources[sid]?.serviceRef)
                    .length > 0
            )
                await dispatch(syncWithService(background))
            let timenow = new Date().getTime()
            const sourcesState = getState().sources
            let sources =
                sids === null
                    ? Object.values(sourcesState).filter(s => {
                          let last = s.lastFetched ? s.lastFetched.getTime() : 0
                          const frequency = resolveSourcePreferences(
                              s,
                              initState.groups,
                              initState.preferences
                          ).fetchFrequency
                          return (
                              !s.serviceRef &&
                              !s.archived &&
                              (!background ||
                                  last > timenow ||
                                  last + frequency * 60000 <= timenow)
                          )
                      })
                    : sids
                          .map(sid => sourcesState[sid])
                          .filter(s => s && !s.serviceRef && !s.archived)
            dispatch(fetchItemsRequest(sources.length))
            const promises = sources.map(source => {
                const state = getState()
                let promise = RSSSource.fetchItems(
                    source,
                    getRulesForTarget(state.rules, state.groups, {
                        type: "source",
                        sid: source.sid,
                    })
                )
                return promise.finally(() => dispatch(fetchItemsIntermediate()))
            })
            const results = await Promise.allSettled(promises)
            const items: RSSItem[] = []
            results.forEach((result, i) => {
                if (result.status === "fulfilled") items.push(...result.value)
                else dispatch(fetchItemsFailure(sources[i], result.reason))
            })
            const inserted = await insertItems(items)
            for (let i = 0; i < results.length; i++) {
                if (results[i].status !== "fulfilled") continue
                const source = getState().sources[sources[i].sid]
                if (source) {
                    try {
                        await dispatch(
                            updateSource({ ...source, lastFetched: new Date() })
                        )
                    } catch (error) {
                        dispatch(fetchItemsFailure(source, error))
                    }
                }
            }
            dispatch(fetchItemsSuccess(inserted.reverse(), getState().items))
            await dispatch(initFeeds())
            for (const item of inserted) {
                if (item.notify) dispatch(pushNotification(item))
            }
            if (background) {
                // Taskbar flashing disabled; sidebar (+N) delta tracks newly arrived items.
            } else dispatch(dismissItems())
        } catch (error) {
            dispatch({ type: REFRESH_STATUS, phase: "error" })
            const cause =
                error instanceof Error && error.cause ? error.cause : error
            await window.utils.showErrorBox(
                intl.get("personal.failed"),
                String(cause).slice(0, 2000)
            )
            throw error
        } finally {
            refreshInFlight = false
            dispatch({ type: REFRESH_STATUS, phase: "finish" })
            dispatch(setupAutoFetch())
        }
    }
}

const markReadDone = (item: RSSItem): ItemActionTypes => ({
    type: MARK_READ,
    item: item,
})

const pendingReadLaterEvictions = new Set<number>()

if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
        if (!pendingReadLaterEvictions.size) return
        const ids = [...pendingReadLaterEvictions]
        pendingReadLaterEvictions.clear()
        void database
            .update(itemsTable)
            .set({ readLater: false })
            .where(inArray(itemsTable._id, ids))
            .catch(() => {})
    })
}

export function flushPendingReadLaterEviction(
    keepItemId: number | null = null
): AppThunk {
    return (dispatch, getState) => {
        if (!pendingReadLaterEvictions.size) return
        const state = getState()
        for (const id of [...pendingReadLaterEvictions]) {
            if (keepItemId !== null && id === keepItemId) continue
            pendingReadLaterEvictions.delete(id)
            if (!state.library.removeLaterOnRead) continue
            const current = state.items[id]
            if (current && current.hasRead && current.readLater) {
                void dispatch(updateItemMeta(current, { readLater: false }))
            }
        }
    }
}

const markUnreadDone = (item: RSSItem): ItemActionTypes => ({
    type: MARK_UNREAD,
    item: item,
})

export function markRead(
    item: RSSItem,
    preserveLater = false
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        item = getState().items[item._id] || item
        if (!item.hasRead) {
            await database
                .update(itemsTable)
                .set({ hasRead: true })
                .where(eq(itemsTable._id, item._id))
            dispatch(markReadDone(item))
            if (
                !preserveLater &&
                item.readLater &&
                getState().library.removeLaterOnRead
            )
                if (getState().page.itemId === item._id) {
                    pendingReadLaterEvictions.add(item._id)
                } else {
                    await dispatch(updateItemMeta(item, { readLater: false }))
                }
            if (item.serviceRef) {
                dispatch(dispatch(getServiceHooks()).markRead?.(item))
            }
        }
    }
}

export function markAllRead(
    sids: number[] = null,
    date: Date = null,
    before = true
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        let state = getState()
        if (sids === null) {
            const feed = state.feeds[state.page.feedId]
            if (!feed) return
            const rows = await RSSFeed.loadFeed(feed, 0, -1)
            const targets = rows.filter(
                item =>
                    !item.hasRead &&
                    (!date || (before ? item.date <= date : item.date >= date))
            )
            if (targets.length === 0) return
            const targetIds = targets.map(i => i._id)
            for (let offset = 0; offset < targetIds.length; offset += 400) {
                await database
                    .update(itemsTable)
                    .set({ hasRead: true })
                    .where(
                        inArray(
                            itemsTable._id,
                            targetIds.slice(offset, offset + 400)
                        )
                    )
            }
            const hooks = dispatch(getServiceHooks())
            for (const item of targets) {
                if (item.serviceRef && hooks.markRead) {
                    dispatch(hooks.markRead(item))
                }
            }
            dispatch({
                type: MARK_ALL_READ,
                sids: [],
                itemIds: targetIds,
            })
            await dispatch(updateUnreadCounts())
            return
        }
        if (sids.length === 0) return
        const action = dispatch(getServiceHooks()).markAllRead?.(
            sids,
            date,
            before
        )
        if (action) await dispatch(action)
        const conditions = [itemsInSources(sids), eq(itemsTable.hasRead, false)]
        if (date) {
            conditions.push(
                before ? lte(itemsTable.date, date) : gte(itemsTable.date, date)
            )
        }
        await database
            .update(itemsTable)
            .set({ hasRead: true })
            .where(and(...conditions))
        if (date) {
            dispatch({
                type: MARK_ALL_READ,
                sids: sids,
                time: date.getTime(),
                before: before,
            })
            dispatch(updateUnreadCounts())
        } else {
            dispatch({
                type: MARK_ALL_READ,
                sids: sids,
            })
        }
    }
}

export function markUnread(item: RSSItem): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        item = getState().items[item._id] || item
        if (item.hasRead) {
            await database
                .update(itemsTable)
                .set({ hasRead: false })
                .where(eq(itemsTable._id, item._id))
            pendingReadLaterEvictions.delete(item._id)
            dispatch(markUnreadDone(item))
            if (item.serviceRef) {
                dispatch(dispatch(getServiceHooks()).markUnread?.(item))
            }
        }
    }
}

const toggleStarredDone = (item: RSSItem): ItemActionTypes => ({
    type: TOGGLE_STARRED,
    item: item,
})

export function toggleStarred(item: RSSItem): AppThunk<Promise<void>> {
    return async dispatch => {
        await database
            .update(itemsTable)
            .set({ starred: !item.starred })
            .where(eq(itemsTable._id, item._id))
        dispatch(toggleStarredDone(item))
        if (item.serviceRef) {
            const hooks = dispatch(getServiceHooks())
            if (item.starred) dispatch(hooks.unstar?.(item))
            else dispatch(hooks.star?.(item))
        }
    }
}

const toggleHiddenDone = (item: RSSItem): ItemActionTypes => ({
    type: TOGGLE_HIDDEN,
    item: item,
})

export function toggleHidden(item: RSSItem): AppThunk<Promise<void>> {
    return async dispatch => {
        await database
            .update(itemsTable)
            .set({ hidden: !item.hidden })
            .where(eq(itemsTable._id, item._id))
        dispatch(toggleHiddenDone(item))
    }
}

export function itemShortcuts(item: RSSItem, e: KeyboardEvent): AppThunk {
    return dispatch => {
        if (e.altKey) return
        if (e.key === "b" || e.key === "B") {
            if ((e.ctrlKey || e.metaKey) && !platformCtrl(e)) return
            if (!item.hasRead) dispatch(markRead(item))
            void window.personal.opened?.(item._id).catch(console.error)
            window.utils.openExternal(item.link, platformCtrl(e))
            return
        }
        if (e.metaKey || e.ctrlKey) return
        switch (e.key) {
            case "m":
            case "M":
                if (item.hasRead) dispatch(markUnread(item))
                else dispatch(markRead(item))
                break
            case "o":
            case "O":
                if (!item.hasRead) dispatch(markRead(item))
                void window.personal.opened?.(item._id).catch(console.error)
                window.utils.openExternal(item.link, false)
                break
            case "s":
            case "S":
                dispatch(toggleStarred(item))
                break
            case "r":
            case "R":
                void dispatch(
                    updateItemMeta(item, { readLater: !item.readLater })
                ).catch(error =>
                    window.utils.showErrorBox(
                        intl.get("personal.failed"),
                        String(error)
                    )
                )
                break
            case "h":
            case "H":
                if (!item.hasRead && !item.hidden) dispatch(markRead(item))
                dispatch(toggleHidden(item))
                break
        }
    }
}

export function applyItemReduction(item: RSSItem, type: string) {
    let nextItem = { ...item }
    switch (type) {
        case MARK_READ:
        case MARK_UNREAD: {
            nextItem.hasRead = type === MARK_READ
            break
        }
        case TOGGLE_STARRED: {
            nextItem.starred = !item.starred
            break
        }
        case TOGGLE_HIDDEN: {
            nextItem.hidden = !item.hidden
            break
        }
    }
    return nextItem
}

export function itemReducer(
    state: ItemState = {},
    action:
        | ItemActionTypes
        | FeedActionTypes
        | ServiceActionTypes
        | SettingsActionTypes
): ItemState {
    switch (action.type) {
        case UPDATE_ITEM_META:
            return {
                ...state,
                [action.item._id]: {
                    ...state[action.item._id],
                    ...action.item,
                },
            }
        case BATCH_UPDATE_ITEMS: {
            const idSet = new Set(action.itemIds)
            let mutated = false
            const nextState: ItemState = { ...state }
            for (const id of idSet) {
                if (nextState[id]) {
                    nextState[id] = { ...nextState[id], ...action.changes }
                    mutated = true
                }
            }
            return mutated ? nextState : state
        }
        case FETCH_ITEMS:
            switch (action.status) {
                case ActionStatus.Success: {
                    let newMap = {}
                    for (let i of action.items) {
                        newMap[i._id] = i
                    }
                    return { ...newMap, ...state }
                }
                default:
                    return state
            }
        case MARK_UNREAD:
        case MARK_READ:
        case TOGGLE_STARRED:
        case TOGGLE_HIDDEN: {
            return {
                ...state,
                [action.item._id]: applyItemReduction(
                    state[action.item._id] || action.item,
                    action.type
                ),
            }
        }
        case MARK_ALL_READ: {
            let nextState = { ...state }
            if (action.itemIds) {
                for (const id of action.itemIds) {
                    if (nextState[id] && !nextState[id].hasRead) {
                        nextState[id] = { ...nextState[id], hasRead: true }
                    }
                }
                return nextState
            }
            let sids = new Set(action.sids)
            for (let item of Object.values(state)) {
                if (sids.has(item.source) && !item.hasRead) {
                    if (
                        !action.time ||
                        (action.before
                            ? item.date.getTime() <= action.time
                            : item.date.getTime() >= action.time)
                    ) {
                        nextState[item._id] = {
                            ...item,
                            hasRead: true,
                        }
                    }
                }
            }
            return nextState
        }
        case LOAD_MORE:
        case INIT_FEED: {
            switch (action.status) {
                case ActionStatus.Success: {
                    let nextState = { ...state }
                    for (let i of action.items) {
                        nextState[i._id] = i
                    }
                    return nextState
                }
                default:
                    return state
            }
        }
        case SYNC_LOCAL_ITEMS: {
            let nextState = { ...state }
            for (let item of Object.values(state)) {
                // Local SQLite rows also have serviceRef, with a null value.
                if (item.serviceRef) {
                    const nextItem = { ...item }
                    nextItem.hasRead = !action.unreadIds.has(item.serviceRef)
                    nextItem.starred = action.starredIds.has(item.serviceRef)
                    nextState[item._id] = nextItem
                }
            }
            return nextState
        }
        case FREE_MEMORY: {
            const nextState: ItemState = {}
            for (let item of Object.values(state)) {
                if (action.iids.has(item._id)) nextState[item._id] = item
            }
            return nextState
        }
        default:
            return state
    }
}
