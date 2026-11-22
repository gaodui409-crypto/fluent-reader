import { database, itemsTable, itemsInSources } from "../db"
import { and, or, not, eq, desc, sql } from "drizzle-orm"
import { keywordPattern } from "../keywords"
import {
    SourceActionTypes,
    INIT_SOURCES,
    ADD_SOURCE,
    DELETE_SOURCE,
    UNHIDE_SOURCE,
    HIDE_SOURCE,
} from "./source"
import {
    ItemActionTypes,
    FETCH_ITEMS,
    RSSItem,
    TOGGLE_HIDDEN,
    UPDATE_ITEM_META,
    BATCH_UPDATE_ITEMS,
    applyItemReduction,
} from "./item"
import { ActionStatus, AppThunk, mergeSortedArrays } from "../utils"
import { PageActionTypes, SELECT_PAGE, PageType, APPLY_FILTER } from "./page"

export enum FilterType {
    None,
    ShowRead = 1 << 0,
    ShowNotStarred = 1 << 1,
    ShowHidden = 1 << 2,
    FullSearch = 1 << 3,
    CaseInsensitive = 1 << 4,
    CreatorSearch = 1 << 5,
    KeywordSearch = 1 << 6,
    MatchAll = 1 << 7,
    ExcludeSearch = 1 << 8,
    BodySearch = 1 << 9,

    Default = ShowRead | ShowNotStarred,
    UnreadOnly = ShowNotStarred,
    StarredOnly = ShowRead,
    Toggles = ShowHidden |
        FullSearch |
        CaseInsensitive |
        KeywordSearch |
        MatchAll |
        ExcludeSearch |
        BodySearch |
        CreatorSearch,
}
export class FeedFilter {
    type: FilterType
    search: string
    tag?: string
    laterOnly?: boolean
    library?: boolean
    folderId?: number
    ids?: number[]
    unfiled?: boolean

    constructor(type: FilterType = null, search = "") {
        if (
            type === null &&
            (type = window.settings.getFilterType()) === null
        ) {
            type =
                FilterType.Default |
                FilterType.CaseInsensitive |
                FilterType.KeywordSearch
        }
        this.type = type
        this.search = search
    }

    static pattern(filter: FeedFilter, highlight = false): string {
        return filter.type & FilterType.KeywordSearch
            ? keywordPattern(
                  filter.search,
                  !highlight && !!(filter.type & FilterType.MatchAll)
              )
            : filter.search
    }

    static testItem(filter: FeedFilter, item: RSSItem) {
        if (!item) return false
        let type = filter.type
        let flag = true
        if (filter.tag) flag = flag && (item.tags || []).includes(filter.tag)
        if (filter.laterOnly) flag = flag && !!item.readLater
        if (!(type & FilterType.ShowRead)) flag = flag && !item.hasRead
        if (!(type & FilterType.ShowNotStarred)) flag = flag && item.starred
        if (!(type & FilterType.ShowHidden) && !filter.library)
            flag = flag && !item.hidden && !item.feedHidden
        if (filter.ids) flag = flag && filter.ids.includes(item._id)
        const pattern = FeedFilter.pattern(filter)
        if (pattern !== "") {
            const flags = type & FilterType.CaseInsensitive ? "i" : ""
            let regex: RegExp
            try {
                regex = RegExp(pattern, flags)
            } catch {
                return false
            }
            let matches: boolean
            if (type & FilterType.FullSearch) {
                matches =
                    type & FilterType.KeywordSearch
                        ? regex.test(
                              `${item.title || ""}\n${item.snippet || ""}`
                          )
                        : regex.test(item.title || "") ||
                          regex.test(item.snippet || "")
            } else if (type & FilterType.CreatorSearch) {
                matches = regex.test(item.creator || "")
            } else if (type & FilterType.BodySearch) {
                matches = regex.test(item.snippet || "")
            } else {
                matches = regex.test(item.title || "")
            }
            flag =
                flag && (type & FilterType.ExcludeSearch ? !matches : matches)
        }
        return Boolean(flag)
    }
}

export const ALL = "ALL"
export const SOURCE = "SOURCE"

const LOAD_QUANTITY = 50
const requestVersions = new Map<string, number>()
function beginRequest(id: string) {
    const version = (requestVersions.get(id) || 0) + 1
    requestVersions.set(id, version)
    return version
}

export class RSSFeed {
    _id: string
    loaded: boolean
    loading: boolean
    allLoaded: boolean
    sids: number[]
    iids: number[]
    filter: FeedFilter

    constructor(id: string = null, sids = [], filter = null) {
        this._id = id
        this.sids = sids
        this.iids = []
        this.loaded = false
        this.allLoaded = false
        this.filter = filter === null ? new FeedFilter() : filter
    }

    static async loadFeed(
        feed: RSSFeed,
        skip = 0,
        limit = LOAD_QUANTITY
    ): Promise<RSSItem[]> {
        if (feed.sids.length === 0) return []
        const filter = feed.filter
        const type = filter.type
        const conditions = [itemsInSources(feed.sids)]
        if (filter.folderId !== undefined)
            conditions.push(
                sql`${itemsTable._id} IN (SELECT min(fi._id) FROM items fi JOIN folder_articles fa ON fa.itemId=fi._id JOIN article_folders f ON f.id=fa.folderId LEFT JOIN article_notes n ON n.itemId=fi._id WHERE f.deleted=0 AND (f.id=${filter.folderId} OR f.parentId=${filter.folderId}) GROUP BY CASE WHEN coalesce(n.text,'')<>'' THEN 'note:'||fi._id ELSE coalesce(CASE WHEN fi.link LIKE '%linux.do/t/%' THEN forum_key(fi.link) ELSE NULL END,'item:'||fi._id) END)`
            )
        if (filter.unfiled)
            conditions.push(
                sql`${itemsTable.kept}=1 AND NOT EXISTS(SELECT 1 FROM folder_articles fa WHERE fa.itemId=${itemsTable._id})`
            )
        if (filter.ids)
            conditions.push(
                sql`${
                    itemsTable._id
                } IN (SELECT value FROM json_each(${JSON.stringify(
                    filter.ids
                )}))`
            )
        if (filter.tag)
            conditions.push(
                sql`${itemsTable.tags} <> '[]' AND EXISTS (SELECT 1 FROM json_each(${itemsTable.tags}) WHERE value=${filter.tag})`
            )
        if (filter.laterOnly) conditions.push(eq(itemsTable.readLater, true))
        if (!(type & FilterType.ShowRead))
            conditions.push(eq(itemsTable.hasRead, false))
        if (!(type & FilterType.ShowNotStarred))
            conditions.push(eq(itemsTable.starred, true))
        if (!(type & FilterType.ShowHidden) && !filter.library)
            conditions.push(
                and(
                    eq(itemsTable.hidden, false),
                    eq(itemsTable.feedHidden, false)
                )
            )
        const pattern = FeedFilter.pattern(filter)
        if (pattern !== "") {
            const fields =
                type & FilterType.FullSearch
                    ? type & FilterType.KeywordSearch
                        ? [
                              sql`coalesce(${itemsTable.title}, '') || char(10) || coalesce(${itemsTable.snippet}, '')`,
                          ]
                        : [itemsTable.title, itemsTable.snippet]
                    : [
                          type & FilterType.CreatorSearch
                              ? itemsTable.creator
                              : type & FilterType.BodySearch
                              ? itemsTable.snippet
                              : itemsTable.title,
                      ]
            const match = or(
                ...fields.map(field =>
                    type & FilterType.CaseInsensitive
                        ? sql`regexpi(${pattern}, ${field})`
                        : sql`regexp(${pattern}, ${field})`
                )
            )
            conditions.push(
                type & FilterType.ExcludeSearch ? not(match) : match
            )
        }
        return (await database
            .select()
            .from(itemsTable)
            .where(and(...conditions))
            .orderBy(desc(itemsTable.date), desc(itemsTable._id))
            .offset(skip)
            .limit(limit)) as unknown as RSSItem[]
    }
}

export type FeedState = {
    [_id: string]: RSSFeed
}

export const INIT_FEEDS = "INIT_FEEDS"
export const INIT_FEED = "INIT_FEED"
export const LOAD_MORE = "LOAD_MORE"
export const DISMISS_ITEMS = "DISMISS_ITEMS"

interface initFeedsAction {
    type: typeof INIT_FEEDS
    status: ActionStatus
}

interface initFeedAction {
    type: typeof INIT_FEED
    status: ActionStatus
    feed?: RSSFeed
    items?: RSSItem[]
    err?
}

interface loadMoreAction {
    type: typeof LOAD_MORE
    status: ActionStatus
    feed: RSSFeed
    items?: RSSItem[]
    err?
}

interface dismissItemsAction {
    type: typeof DISMISS_ITEMS
    fid: string
    iids: Set<number>
}

export type FeedActionTypes =
    | initFeedAction
    | initFeedsAction
    | loadMoreAction
    | dismissItemsAction

export function dismissItems(): AppThunk {
    return (dispatch, getState) => {
        const state = getState()
        let fid = state.page.feedId
        const currentFeed = state.feeds[fid]
        if (!currentFeed) return
        let filter = currentFeed.filter
        let iids = new Set<number>()
        for (let iid of currentFeed.iids) {
            let item = state.items[iid]
            if (!item || !FeedFilter.testItem(filter, item)) {
                iids.add(iid)
            }
        }
        dispatch({
            type: DISMISS_ITEMS,
            fid: fid,
            iids: iids,
        })
    }
}

export function initFeedsRequest(): FeedActionTypes {
    return {
        type: INIT_FEEDS,
        status: ActionStatus.Request,
    }
}
export function initFeedsSuccess(): FeedActionTypes {
    return {
        type: INIT_FEEDS,
        status: ActionStatus.Success,
    }
}

export function initFeedSuccess(
    feed: RSSFeed,
    items: RSSItem[]
): FeedActionTypes {
    return {
        type: INIT_FEED,
        status: ActionStatus.Success,
        items: items,
        feed: feed,
    }
}

export function initFeedFailure(err): FeedActionTypes {
    return {
        type: INIT_FEED,
        status: ActionStatus.Failure,
        err: err,
    }
}

export function initFeeds(force = false): AppThunk<Promise<void>> {
    return (dispatch, getState) => {
        dispatch(initFeedsRequest())
        let promises = new Array<Promise<void>>()
        for (let feed of Object.values(getState().feeds)) {
            if (
                !feed.loaded ||
                (force && feed._id === getState().page.feedId)
            ) {
                const version = beginRequest(feed._id)
                const isCurrent = () =>
                    requestVersions.get(feed._id) === version &&
                    getState().feeds[feed._id]?.filter === feed.filter &&
                    getState().feeds[feed._id]?.sids === feed.sids
                let p = RSSFeed.loadFeed(
                    feed,
                    0,
                    Math.max(LOAD_QUANTITY, feed.iids.length)
                )
                    .then(items => {
                        if (isCurrent()) dispatch(initFeedSuccess(feed, items))
                    })
                    .catch(err => {
                        console.error(err)
                        if (isCurrent()) dispatch(initFeedFailure(err))
                    })
                promises.push(p)
            }
        }
        return Promise.allSettled(promises).then(() => {
            dispatch(initFeedsSuccess())
        })
    }
}

export function loadMoreRequest(feed: RSSFeed): FeedActionTypes {
    return {
        type: LOAD_MORE,
        status: ActionStatus.Request,
        feed: feed,
    }
}

export function loadMoreSuccess(
    feed: RSSFeed,
    items: RSSItem[]
): FeedActionTypes {
    return {
        type: LOAD_MORE,
        status: ActionStatus.Success,
        feed: feed,
        items: items,
    }
}

export function loadMoreFailure(feed: RSSFeed, err): FeedActionTypes {
    return {
        type: LOAD_MORE,
        status: ActionStatus.Failure,
        feed: feed,
        err: err,
    }
}

export function loadMore(feed: RSSFeed): AppThunk<Promise<void>> {
    return (dispatch, getState) => {
        if (feed && feed.loaded && !feed.loading && !feed.allLoaded) {
            const version = beginRequest(feed._id)
            const isCurrent = () =>
                requestVersions.get(feed._id) === version &&
                getState().feeds[feed._id]?.filter === feed.filter &&
                getState().feeds[feed._id]?.sids === feed.sids
            dispatch(loadMoreRequest(feed))
            const state = getState()
            const skipNum = feed.iids.filter(i =>
                FeedFilter.testItem(feed.filter, state.items[i])
            ).length
            return RSSFeed.loadFeed(feed, skipNum)
                .then(items => {
                    if (isCurrent())
                        dispatch(
                            loadMoreSuccess(getState().feeds[feed._id], items)
                        )
                })
                .catch(e => {
                    console.error(e)
                    if (isCurrent())
                        dispatch(loadMoreFailure(getState().feeds[feed._id], e))
                })
        }
        return Promise.resolve()
    }
}

export function feedReducer(
    state: FeedState = { [ALL]: new RSSFeed(ALL) },
    action:
        | SourceActionTypes
        | ItemActionTypes
        | FeedActionTypes
        | PageActionTypes
): FeedState {
    switch (action.type) {
        case INIT_SOURCES:
            switch (action.status) {
                case ActionStatus.Success:
                    return {
                        ...state,
                        [ALL]: new RSSFeed(
                            ALL,
                            Object.values(action.sources)
                                .filter(s => !s.hidden)
                                .map(s => s.sid)
                        ),
                    }
                default:
                    return state
            }
        case ADD_SOURCE:
        case UNHIDE_SOURCE:
            switch (action.status) {
                case ActionStatus.Success:
                    return {
                        ...state,
                        [ALL]: new RSSFeed(
                            ALL,
                            [...state[ALL].sids, action.source.sid],
                            state[ALL].filter
                        ),
                    }
                default:
                    return state
            }
        case DELETE_SOURCE:
        case HIDE_SOURCE: {
            let nextState = {}
            for (let [id, feed] of Object.entries(state)) {
                nextState[id] = new RSSFeed(
                    id,
                    feed.filter.library
                        ? feed.sids
                        : feed.sids.filter(sid => sid != action.source.sid),
                    feed.filter
                )
            }
            return nextState
        }
        case APPLY_FILTER: {
            const targetFeed = state[action.feedId]
            if (!targetFeed) return state
            return {
                ...state,
                [action.feedId]: new RSSFeed(
                    action.feedId,
                    targetFeed.sids,
                    action.filter
                ),
            }
        }
        case FETCH_ITEMS:
            switch (action.status) {
                case ActionStatus.Success: {
                    let nextState = { ...state }
                    for (let feed of Object.values(state)) {
                        if (feed.loaded) {
                            if (
                                feed.filter.folderId !== undefined ||
                                feed.filter.unfiled
                            ) {
                                nextState[feed._id] = { ...feed, loaded: false }
                                continue
                            }
                            let items = action.items.filter(
                                i =>
                                    feed.sids.includes(i.source) &&
                                    FeedFilter.testItem(feed.filter, i)
                            )
                            if (items.length > 0) {
                                let oldItems = feed.iids
                                    .map(id => action.itemState[id])
                                    .filter(Boolean)
                                let nextItems = mergeSortedArrays(
                                    oldItems,
                                    items,
                                    (a, b) =>
                                        b.date.getTime() - a.date.getTime() ||
                                        b._id - a._id
                                )
                                nextState[feed._id] = {
                                    ...feed,
                                    iids: nextItems.map(i => i._id),
                                }
                            }
                        }
                    }
                    return nextState
                }
                default:
                    return state
            }
        case DISMISS_ITEMS: {
            let feed = state[action.fid]
            if (!feed) return state
            return {
                ...state,
                [action.fid]: {
                    ...feed,
                    iids: feed.iids.filter(iid => !action.iids.has(iid)),
                },
            }
        }
        case INIT_FEED:
            switch (action.status) {
                case ActionStatus.Success:
                    return {
                        ...state,
                        [action.feed._id]: {
                            ...action.feed,
                            loaded: true,
                            loading: false,
                            allLoaded: action.items.length < LOAD_QUANTITY,
                            iids: action.items.map(i => i._id),
                        },
                    }
                default:
                    return state
            }
        case LOAD_MORE:
            switch (action.status) {
                case ActionStatus.Request:
                    return {
                        ...state,
                        [action.feed._id]: {
                            ...action.feed,
                            loading: true,
                        },
                    }
                case ActionStatus.Success:
                    return {
                        ...state,
                        [action.feed._id]: {
                            ...action.feed,
                            loading: false,
                            allLoaded: action.items.length < LOAD_QUANTITY,
                            iids: [
                                ...new Set([
                                    ...action.feed.iids,
                                    ...action.items.map(i => i._id),
                                ]),
                            ],
                        },
                    }
                case ActionStatus.Failure:
                    return {
                        ...state,
                        [action.feed._id]: {
                            ...action.feed,
                            loading: false,
                        },
                    }
                default:
                    return state
            }
        case BATCH_UPDATE_ITEMS: {
            if (action.changes.readLater === false) {
                const removedSet = new Set(action.itemIds)
                let changed = false
                const nextState = { ...state }
                for (const feed of Object.values(state)) {
                    if (feed.loaded && feed.filter.laterOnly) {
                        const filtered = feed.iids.filter(
                            id => !removedSet.has(id)
                        )
                        if (filtered.length !== feed.iids.length) {
                            nextState[feed._id] = { ...feed, iids: filtered }
                            changed = true
                        }
                    }
                }
                return changed ? nextState : state
            }
            return state
        }
        case UPDATE_ITEM_META:
        case TOGGLE_HIDDEN: {
            let nextItem =
                action.type === UPDATE_ITEM_META
                    ? action.item
                    : applyItemReduction(action.item, action.type)
            let filteredFeeds = Object.values(state).filter(
                feed =>
                    feed.loaded && !FeedFilter.testItem(feed.filter, nextItem)
            )
            if (filteredFeeds.length > 0) {
                let nextState = { ...state }
                for (let feed of filteredFeeds) {
                    nextState[feed._id] = {
                        ...feed,
                        iids: feed.iids.filter(id => id != nextItem._id),
                    }
                }
                return nextState
            } else {
                return state
            }
        }
        case SELECT_PAGE:
            switch (action.pageType) {
                case PageType.Sources:
                    return {
                        ...state,
                        [action.menuKey || SOURCE]: (() => {
                            const id = action.menuKey || SOURCE
                            const previous = state[id]
                            return previous &&
                                JSON.stringify(previous.sids) ===
                                    JSON.stringify(action.sids) &&
                                JSON.stringify(previous.filter) ===
                                    JSON.stringify(action.filter)
                                ? { ...previous, loaded: false }
                                : new RSSFeed(id, action.sids, action.filter)
                        })(),
                    }
                case PageType.AllArticles:
                    if (
                        !action.init &&
                        JSON.stringify(state[ALL].filter) ===
                            JSON.stringify(action.filter)
                    )
                        return state
                    return {
                        ...state,
                        [ALL]: {
                            ...state[ALL],
                            loaded: false,
                            filter: action.filter,
                        },
                    }
                default:
                    return state
            }
        default:
            return state
    }
}
