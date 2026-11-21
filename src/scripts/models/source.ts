import { SourceGroup } from "../../schema-types"
import intl from "react-intl-universal"
import { eq, and, or, isNull, max, count } from "drizzle-orm"
import { database, sourcesTable, itemsTable, init } from "../db"
import { findValidDate } from "../date"
import {
    fetchFavicon,
    ActionStatus,
    AppThunk,
    parseRSS,
    MyParserItem,
} from "../utils"
import {
    RSSItem,
    insertItems,
    ItemActionTypes,
    FETCH_ITEMS,
    MARK_READ,
    MARK_UNREAD,
    MARK_ALL_READ,
} from "./item"
import { saveSettings } from "./app"
import {
    ArticleRule,
    getRulesForTarget,
    initRules,
    updateRulesForTarget,
} from "./rule"
import { fixBrokenGroups } from "./group"
import { loadPreferences } from "./preferences"

export const enum SourceOpenTarget {
    Local,
    Webpage,
    External,
    FullContent,
}

export const enum SourceTextDirection {
    LTR,
    RTL,
    Vertical,
}

export class RSSSource {
    sid: number
    url: string
    iconurl?: string
    name: string
    openTarget: SourceOpenTarget
    unreadCount: number
    lastFetched: Date
    serviceRef?: string
    fetchFrequency: number // in minutes
    textDir: SourceTextDirection
    hidden: boolean
    archived?: boolean

    constructor(url: string, name: string = null) {
        this.url = url
        this.name = name
        this.openTarget = SourceOpenTarget.Local
        this.lastFetched = new Date()
        this.fetchFrequency = 0
        this.textDir = SourceTextDirection.LTR
        this.hidden = false
    }

    static async fetchMetaData(source: RSSSource) {
        let feed = await parseRSS(source.url)
        if (!source.name) {
            if (feed.title) source.name = feed.title.trim()
            source.name = source.name || intl.get("sources.untitled")
        }
        return feed
    }

    private static async checkItem(
        i: RSSItem,
        item: MyParserItem,
        rules: ArticleRule[],
        hasPublicationDate: boolean,
        feedURL: string
    ): Promise<RSSItem> {
        const legacyMatch = and(
            eq(itemsTable.title, i.title),
            eq(itemsTable.link, i.link),
            hasPublicationDate ? eq(itemsTable.date, i.date) : undefined
        )
        // Migrated articles have no GUID. Use the fallback match when either side
        // lacks an identifier, but distinguish different known GUIDs.
        const identityMatch = i.guid
            ? or(
                  eq(itemsTable.guid, i.guid),
                  and(isNull(itemsTable.guid), legacyMatch)
              )
            : legacyMatch
        const existing = await database
            .select({ _id: itemsTable._id, thumb: itemsTable.thumb })
            .from(itemsTable)
            .where(
                and(
                    eq(itemsTable.source, i.source),
                    isNull(itemsTable.serviceRef),
                    identityMatch
                )
            )
            .limit(1)
        if (existing.length === 0) {
            RSSItem.parseContent(i, item, feedURL)
            ArticleRule.applyAll(rules, i)
            return i
        } else {
            if (!existing[0].thumb) {
                RSSItem.parseContent(i, item, feedURL)
                if (i.thumb) {
                    await database
                        .update(itemsTable)
                        .set({ thumb: i.thumb })
                        .where(eq(itemsTable._id, existing[0]._id))
                }
            }
            return null
        }
    }

    static async checkItems(
        source: RSSSource,
        items: MyParserItem[],
        rules: ArticleRule[]
    ): Promise<RSSItem[]> {
        const seenGuids = new Set<string>()
        const seenFallbacks = new Map<string, Set<number>>()
        const pending: Promise<RSSItem>[] = []
        for (const item of items) {
            // A display date synthesized from fetch time is not a stable identity.
            const hasPublicationDate =
                findValidDate(item.isoDate, item.pubDate) !== undefined
            const parsed = new RSSItem(item, source)
            // Database checks cannot see other pending inserts in this batch.
            if (parsed.guid) {
                if (seenGuids.has(parsed.guid)) continue
                seenGuids.add(parsed.guid)
            } else {
                const identity = JSON.stringify([parsed.title, parsed.link])
                const dates = seenFallbacks.get(identity)
                if (dates) {
                    if (!hasPublicationDate || dates.has(parsed.date.getTime()))
                        continue
                    dates.add(parsed.date.getTime())
                } else {
                    seenFallbacks.set(
                        identity,
                        new Set([parsed.date.getTime()])
                    )
                }
            }
            pending.push(
                this.checkItem(
                    parsed,
                    item,
                    rules,
                    hasPublicationDate,
                    source.url
                )
            )
        }
        return (await Promise.all(pending)).filter(item => item != null)
    }

    static async fetchItems(source: RSSSource, rules: ArticleRule[]) {
        try {
            const feed = await parseRSS(source.url)
            const items = await this.checkItems(source, feed.items, rules)
            await window.personal.reportFetch?.(source.sid).catch(console.error)
            return items
        } catch (error) {
            await window.personal
                .reportFetch?.(source.sid, String(error))
                .catch(console.error)
            throw error
        }
    }
}

export type SourceState = {
    [sid: number]: RSSSource
}

export const INIT_SOURCES = "INIT_SOURCES"
export const ADD_SOURCE = "ADD_SOURCE"
export const UPDATE_SOURCE = "UPDATE_SOURCE"
export const UPDATE_UNREAD_COUNTS = "UPDATE_UNREAD_COUNTS"
export const DELETE_SOURCE = "DELETE_SOURCE"
export const HIDE_SOURCE = "HIDE_SOURCE"
export const UNHIDE_SOURCE = "UNHIDE_SOURCE"

interface InitSourcesAction {
    type: typeof INIT_SOURCES
    status: ActionStatus
    sources?: SourceState
    err?
}

interface AddSourceAction {
    type: typeof ADD_SOURCE
    status: ActionStatus
    batch: boolean
    source?: RSSSource
    group?: SourceGroup
    err?
}

interface UpdateSourceAction {
    type: typeof UPDATE_SOURCE
    source: RSSSource
}

interface UpdateUnreadCountsAction {
    type: typeof UPDATE_UNREAD_COUNTS
    sources: SourceState
}

interface DeleteSourceAction {
    type: typeof DELETE_SOURCE
    source: RSSSource
}

interface ToggleSourceHiddenAction {
    type: typeof HIDE_SOURCE | typeof UNHIDE_SOURCE
    status: ActionStatus
    source: RSSSource
}

export type SourceActionTypes =
    | InitSourcesAction
    | AddSourceAction
    | UpdateSourceAction
    | UpdateUnreadCountsAction
    | DeleteSourceAction
    | ToggleSourceHiddenAction

export function initSourcesRequest(): SourceActionTypes {
    return {
        type: INIT_SOURCES,
        status: ActionStatus.Request,
    }
}

export function initSourcesSuccess(sources: SourceState): SourceActionTypes {
    return {
        type: INIT_SOURCES,
        status: ActionStatus.Success,
        sources: sources,
    }
}

export function initSourcesFailure(err): SourceActionTypes {
    return {
        type: INIT_SOURCES,
        status: ActionStatus.Failure,
        err: err,
    }
}

async function unreadCount(sources: SourceState): Promise<SourceState> {
    const rows = await database
        .select({
            source: itemsTable.source,
            count: count(itemsTable._id),
        })
        .from(itemsTable)
        .where(
            and(
                eq(itemsTable.hasRead, false),
                eq(itemsTable.hidden, false),
                eq(itemsTable.feedHidden, false)
            )
        )
        .groupBy(itemsTable.source)
    for (const row of rows) {
        if (sources[row.source]) {
            sources[row.source].unreadCount = row.count
        }
    }
    return sources
}

export function updateUnreadCounts(): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        const sources: SourceState = {}
        for (let source of Object.values(getState().sources)) {
            sources[source.sid] = {
                ...source,
                unreadCount: 0,
            }
        }
        dispatch({
            type: UPDATE_UNREAD_COUNTS,
            sources: await unreadCount(sources),
        })
    }
}

export function initSources(): AppThunk<Promise<void>> {
    return async dispatch => {
        dispatch(initSourcesRequest())
        await init()
        await dispatch(loadPreferences())
        const sourcesData = await database.select().from(sourcesTable)
        dispatch(initRules())
        const state: SourceState = {}
        for (const source of sourcesData) {
            const rssSource = source as unknown as RSSSource
            rssSource.unreadCount = 0
            state[source.sid] = rssSource
        }
        await unreadCount(state)
        dispatch(
            fixBrokenGroups(
                Object.fromEntries(
                    Object.entries(state).filter(
                        ([, source]) => !source.archived
                    )
                )
            )
        )
        dispatch(initSourcesSuccess(state))
    }
}

export function addSourceRequest(batch: boolean): SourceActionTypes {
    return {
        type: ADD_SOURCE,
        batch: batch,
        status: ActionStatus.Request,
    }
}

export function addSourceSuccess(
    source: RSSSource,
    batch: boolean
): SourceActionTypes {
    return {
        type: ADD_SOURCE,
        batch: batch,
        status: ActionStatus.Success,
        source: source,
        group: new SourceGroup(window.settings.allocateGroupId(), [source.sid]),
    }
}

export function addSourceFailure(err, batch: boolean): SourceActionTypes {
    return {
        type: ADD_SOURCE,
        batch: batch,
        status: ActionStatus.Failure,
        err: err,
    }
}

let insertPromises = Promise.resolve()
export function insertSource(source: RSSSource): AppThunk<Promise<RSSSource>> {
    return () => {
        return new Promise((resolve, reject) => {
            insertPromises = insertPromises.then(async () => {
                try {
                    const [existing] = await database
                        .select()
                        .from(sourcesTable)
                        .where(eq(sourcesTable.url, source.url))
                    if (existing?.archived) {
                        source.sid = existing.sid
                        source.archived = false
                        source.hidden = false
                        source.openTarget = existing.openTarget
                        source.textDir = existing.textDir
                        source.fetchFrequency = existing.fetchFrequency
                        await database
                            .update(sourcesTable)
                            .set({
                                archived: false,
                                hidden: false,
                                name: source.name,
                                serviceRef: source.serviceRef || null,
                            })
                            .where(eq(sourcesTable.sid, source.sid))
                        resolve(source)
                        return
                    }
                    const result = await database
                        .select({ maxSid: max(sourcesTable.sid) })
                        .from(sourcesTable)
                    source.sid = (result[0]?.maxSid ?? -1) + 1
                    await database.insert(sourcesTable).values({
                        sid: source.sid,
                        url: source.url,
                        iconurl: source.iconurl || null,
                        name: source.name,
                        openTarget: source.openTarget,
                        lastFetched: source.lastFetched,
                        serviceRef: source.serviceRef || null,
                        fetchFrequency: source.fetchFrequency || 0,
                        textDir: source.textDir || 0,
                        hidden: source.hidden || false,
                    })
                    resolve(source)
                } catch (err) {
                    // Drizzle wraps the original IPC rejection in its cause.
                    let cause = err
                    while (
                        cause instanceof Error &&
                        cause.cause instanceof Error
                    )
                        cause = cause.cause
                    if (
                        cause instanceof Error &&
                        cause.message.includes(
                            "UNIQUE constraint failed: sources.url"
                        )
                    ) {
                        reject(intl.get("sources.exist"))
                    } else {
                        reject(err)
                    }
                }
            })
        })
    }
}

export function addSource(
    url: string,
    name: string = null,
    batch = false,
    quiet = false
): AppThunk<Promise<number>> {
    return async (dispatch, getState) => {
        const app = getState().app
        if (app.sourceInit) {
            dispatch(addSourceRequest(batch))
            const source = new RSSSource(url, name)
            try {
                const feed = await RSSSource.fetchMetaData(source)
                const inserted = await dispatch(insertSource(source))
                const state = getState()
                const items = await RSSSource.checkItems(
                    inserted,
                    feed.items,
                    getRulesForTarget(state.rules, state.groups, {
                        type: "source",
                        sid: inserted.sid,
                    })
                )
                await insertItems(items)
                inserted.unreadCount = 0
                await unreadCount({ [inserted.sid]: inserted })
                dispatch(addSourceSuccess(inserted, batch))
                window.settings.saveGroups(getState().groups)
                dispatch(updateFavicon([inserted.sid]))
                return inserted.sid
            } catch (e) {
                dispatch(addSourceFailure(e, batch))
                if (!batch && !quiet) {
                    window.utils.showErrorBox(
                        intl.get("sources.errorAdd"),
                        String(e),
                        intl.get("context.copy")
                    )
                }
                throw e
            }
        }
        throw new Error("Sources not initialized.")
    }
}

export function updateSourceDone(source: RSSSource): SourceActionTypes {
    return {
        type: UPDATE_SOURCE,
        source: source,
    }
}

export function updateSource(source: RSSSource): AppThunk<Promise<void>> {
    return async dispatch => {
        const dbValues = {
            sid: source.sid,
            url: source.url,
            iconurl: source.iconurl || null,
            name: source.name,
            openTarget: source.openTarget,
            lastFetched: source.lastFetched,
            serviceRef: source.serviceRef || null,
            fetchFrequency: source.fetchFrequency || 0,
            textDir: source.textDir || 0,
            hidden: source.hidden || false,
            archived: source.archived || false,
        }
        await database
            .insert(sourcesTable)
            .values(dbValues)
            .onConflictDoUpdate({
                target: sourcesTable.sid,
                set: dbValues,
            })
        dispatch(updateSourceDone(source))
    }
}

export function deleteSourceDone(source: RSSSource): SourceActionTypes {
    return {
        type: DELETE_SOURCE,
        source: source,
    }
}

export function deleteSource(
    source: RSSSource,
    batch = false
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        if (!batch) dispatch(saveSettings())
        try {
            await dispatch(
                updateRulesForTarget({ type: "source", sid: source.sid }, [])
            )
            await window.personal.archiveRetireSource(source.sid)
            dispatch(deleteSourceDone(source))
            const [retained] = await database
                .select()
                .from(sourcesTable)
                .where(eq(sourcesTable.sid, source.sid))
            if (retained)
                dispatch({
                    type: UPDATE_SOURCE,
                    source: { ...retained, unreadCount: 0 } as RSSSource,
                })
            window.settings.saveGroups(getState().groups)
        } catch (err) {
            console.log(err)
        } finally {
            if (!batch) dispatch(saveSettings())
        }
    }
}

export function deleteSources(sources: RSSSource[]): AppThunk<Promise<void>> {
    return async dispatch => {
        dispatch(saveSettings())
        for (let source of sources) {
            await dispatch(deleteSource(source, true))
        }
        dispatch(saveSettings())
    }
}

export function toggleSourceHidden(source: RSSSource): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        const sourceCopy: RSSSource = { ...getState().sources[source.sid] }
        sourceCopy.hidden = !sourceCopy.hidden
        dispatch({
            type: sourceCopy.hidden ? HIDE_SOURCE : UNHIDE_SOURCE,
            status: ActionStatus.Success,
            source: sourceCopy,
        })
        await dispatch(updateSource(sourceCopy))
    }
}

export function updateFavicon(
    sids?: number[],
    force = false
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        const initSources = getState().sources
        if (!sids) {
            sids = Object.values(initSources)
                .filter(s => s.iconurl === undefined)
                .map(s => s.sid)
        } else {
            sids = sids.filter(sid => sid in initSources)
        }
        const promises = sids.map(async sid => {
            const url = initSources[sid].url
            let favicon = (await fetchFavicon(url)) || ""
            const source = getState().sources[sid]
            if (
                source &&
                source.url === url &&
                (force || source.iconurl === undefined)
            ) {
                source.iconurl = favicon
                await dispatch(updateSource(source))
            }
        })
        await Promise.all(promises)
    }
}

export function sourceReducer(
    state: SourceState = {},
    action: SourceActionTypes | ItemActionTypes
): SourceState {
    switch (action.type) {
        case INIT_SOURCES:
            switch (action.status) {
                case ActionStatus.Success:
                    return action.sources
                default:
                    return state
            }
        case UPDATE_UNREAD_COUNTS:
            return action.sources
        case ADD_SOURCE:
            switch (action.status) {
                case ActionStatus.Success:
                    return {
                        ...state,
                        [action.source.sid]: action.source,
                    }
                default:
                    return state
            }
        case UPDATE_SOURCE:
            return {
                ...state,
                [action.source.sid]: action.source,
            }
        case DELETE_SOURCE: {
            delete state[action.source.sid]
            return { ...state }
        }
        case FETCH_ITEMS: {
            switch (action.status) {
                case ActionStatus.Success: {
                    let updateMap = new Map<number, number>()
                    for (let item of action.items) {
                        if (!item.hasRead && !item.hidden && !item.feedHidden) {
                            updateMap.set(
                                item.source,
                                updateMap.has(item.source)
                                    ? updateMap.get(item.source) + 1
                                    : 1
                            )
                        }
                    }
                    let nextState = {} as SourceState
                    for (let [s, source] of Object.entries(state)) {
                        let sid = parseInt(s)
                        if (updateMap.has(sid)) {
                            nextState[sid] = {
                                ...source,
                                unreadCount:
                                    source.unreadCount + updateMap.get(sid),
                            } as RSSSource
                        } else {
                            nextState[sid] = source
                        }
                    }
                    return nextState
                }
                default:
                    return state
            }
        }
        case MARK_UNREAD:
        case MARK_READ:
            return {
                ...state,
                [action.item.source]: {
                    ...state[action.item.source],
                    unreadCount:
                        state[action.item.source].unreadCount +
                        (action.item.hidden || action.item.feedHidden
                            ? 0
                            : action.type === MARK_UNREAD
                            ? 1
                            : -1),
                } as RSSSource,
            }
        case MARK_ALL_READ: {
            let nextState = { ...state }
            action.sids.forEach(sid => {
                nextState[sid] = {
                    ...state[sid],
                    unreadCount: action.time ? state[sid].unreadCount : 0,
                }
            })
            return nextState
        }
        default:
            return state
    }
}
