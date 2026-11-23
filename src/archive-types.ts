import type { RuleCondition } from "./schema-types"
import { matchesConditions } from "./rule-conditions"
import { keywordPattern } from "./scripts/keywords"

export interface ArticleFolder {
    id: number
    parentId: number | null
    name: string
    position: number
    count: number
}

export interface ArchiveQuery {
    include: string
    exclude: string
    all: boolean
    field: "full" | "title" | "body" | "author" | "link"
    caseSensitive?: boolean
    regex?: string
    sids?: number[]
    gid?: number
    start?: number
    end?: number
    readState?: "all" | "unread" | "read"
    unfolderedOnly?: boolean
    starredOnly?: boolean
    conditions?: RuleCondition[]
    logic?: "all" | "any"
    negate?: boolean
    // Older bitmask rules also combine visibility flags with whole-filter negation.
    legacyFilter?: { type: number; search: string; match: boolean }
}

export type ArchiveActionKind =
    | "folder"
    | "remove"
    | "hide"
    | "restore"
    | "read"
    | "unread"
    | "star"
    | "unstar"
    | "later"
    | "unlater"
    | "highlight"
    | "notify"
    | "offline"

export interface ArchiveAction {
    kind: ArchiveActionKind
    folderId?: number
    fromFolderId?: number
    feedHidden?: boolean
    highlight?: string
    notify?: boolean
    autoOffline?: boolean
}

export interface ArchiveRule {
    id: string
    name: string
    enabled: boolean
    query: ArchiveQuery
    action: ArchiveAction
    error?: string
    // Split actions from one legacy rule share a single matching decision.
    migrationGroup?: string
}

export interface ArchiveRow {
    id: number
    title: string
    source: string
    link: string
    body: string
    author: string
    date: number
    hasRead?: number
    starred?: number
    inFolder?: number
    snippet?: string
    hidden?: number
    feedHidden?: number
    sourceId?: number
    excerpt?: { text: string; start: number; length: number }
}

export interface ArchivePreview {
    token: string
    rows: ArchiveRow[]
}

export interface ArticleNote {
    text: string
    version: number
    updatedAt: number
}

export interface ArchiveChange {
    id: number
    serviceRef?: string
    fields: Record<
        string,
        { before: number | string | null; after: number | string | null }
    >
}

export interface ArchiveResult {
    batchId: string
    count: number
    skipped: number
    changes: ArchiveChange[]
}

export const emptyArchiveQuery: ArchiveQuery = {
    include: "",
    exclude: "",
    all: false,
    field: "full",
}

export function archiveNeedsBody(query: ArchiveQuery): boolean {
    return (
        query.field === "full" ||
        query.field === "body" ||
        query.conditions?.some(c => c.field === "body") ||
        Boolean(query.legacyFilter?.type & ((1 << 3) | (1 << 9)))
    )
}

export function archiveUsesRegex(query: ArchiveQuery): boolean {
    return (
        query.regex !== undefined ||
        query.conditions?.some(c => c.operator === "regex") ||
        Boolean(
            query.legacyFilter?.search && !(query.legacyFilter.type & (1 << 6))
        )
    )
}

export function summarizeArchiveConditions(query: ArchiveQuery): string {
    const names = { title: "标题", body: "正文", author: "作者", link: "链接" }
    if (query.legacyFilter) {
        const f = query.legacyFilter
        const parts: string[] = []
        if (!(f.type & 1)) parts.push("仅未读")
        if (!(f.type & 2)) parts.push("仅收藏")
        if (!(f.type & 4)) parts.push("排除隐藏文章")
        if (f.search) {
            const field =
                f.type & 8
                    ? "标题及摘要"
                    : f.type & 32
                    ? "作者"
                    : f.type & 512
                    ? "摘要"
                    : "标题"
            const mode =
                f.type & 64
                    ? f.type & 128
                        ? "包含全部词"
                        : "包含任意词"
                    : "匹配正则"
            const text = `${field}${mode}「${f.search}」（${
                f.type & 16 ? "不区分" : "区分"
            }大小写）`
            parts.push(f.type & 256 ? `不满足（${text}）` : text)
        }
        const text = parts.join(" 且 ") || "任意文章"
        return f.match ? text : `不满足（${text}）`
    }
    const text = (query.conditions || [])
        .map(
            c =>
                `${names[c.field]}${
                    c.operator === "regex"
                        ? "匹配正则"
                        : c.operator === "notContains"
                        ? "不包含"
                        : "包含"
                }「${c.value}」（${c.caseSensitive ? "区分" : "不区分"}大小写）`
        )
        .join(query.logic === "any" ? " 或 " : " 且 ")
    return query.negate ? `不满足（${text}）` : text
}

function matchesLegacyFilter(query: ArchiveQuery, row: ArchiveRow): boolean {
    const { type, search, match } = query.legacyFilter
    let result = Boolean(
        (type & 1 || !row.hasRead) &&
            (type & 2 || row.starred) &&
            (type & 4 || (!row.hidden && !row.feedHidden))
    )
    const pattern =
        type & (1 << 6)
            ? keywordPattern(search, Boolean(type & (1 << 7)))
            : search
    if (pattern) {
        const regex = new RegExp(pattern, type & (1 << 4) ? "i" : "")
        const body = row.snippet || ""
        const found =
            type & (1 << 3)
                ? type & (1 << 6)
                    ? regex.test(row.title + "\n" + body)
                    : regex.test(row.title) || regex.test(body)
                : regex.test(
                      type & (1 << 5)
                          ? row.author
                          : type & (1 << 9)
                          ? body
                          : row.title
                  )
        result = result && (type & (1 << 8) ? !found : found)
    }
    return result === match
}

// Self-contained: user expressions are evaluated only in the bounded worker.
export function archiveExcerpt(query: ArchiveQuery, row: ArchiveRow) {
    const condition =
        query.conditions?.find(c => c.operator !== "notContains") ||
        query.conditions?.[0]
    if (condition) {
        query = {
            ...query,
            regex: condition.operator === "regex" ? condition.value : undefined,
            field: condition.field,
            include: condition.operator === "contains" ? condition.value : "",
            exclude: "",
            caseSensitive: condition.caseSensitive,
        }
    }
    const value =
        query.field === "full"
            ? row.title + "\n" + row.body
            : query.field === "title"
            ? row.title
            : query.field === "body"
            ? row.body
            : query.field === "author"
            ? row.author
            : row.link
    let index = 0,
        length = 0
    if (query.regex !== undefined) {
        const match = new RegExp(
            query.regex,
            condition
                ? query.caseSensitive
                    ? ""
                    : "i"
                : query.caseSensitive
                ? "u"
                : "iu"
        ).exec(value)
        if (match) {
            index = match.index
            length = match[0].length
        }
    } else {
        const text = query.caseSensitive ? value : value.toLocaleLowerCase()
        let first = Infinity
        const words = condition
            ? [query.include].filter(Boolean)
            : query.include
                  .split(/[,，;；\n]/u)
                  .map(s => s.trim())
                  .filter(Boolean)
        for (const word of words) {
            const at = text.indexOf(
                query.caseSensitive ? word : word.toLocaleLowerCase()
            )
            if (at >= 0 && at < first) {
                first = at
                index = at
                length = word.length
            }
        }
    }
    const offset = Math.max(0, index - 55)
    const prefix = offset ? "…" : ""
    return {
        text:
            prefix +
            value.slice(offset, offset + 200) +
            (value.length > offset + 200 ? "…" : ""),
        start: index - offset + prefix.length,
        length: Math.min(length, 200 - (index - offset)),
    }
}

// Kept self-contained so the same matcher runs in a terminable worker.
export function archiveMatches(query: ArchiveQuery, row: ArchiveRow): boolean {
    if (
        query.sids &&
        row.sourceId !== undefined &&
        !query.sids.includes(row.sourceId)
    )
        return false
    if (query.readState === "unread" && row.hasRead) return false
    if (query.readState === "read" && row.hasRead === 0) return false
    if (query.unfolderedOnly && row.inFolder) return false
    if (query.starredOnly && row.starred === 0) return false
    const value =
        query.field === "full"
            ? row.title + "\n" + row.body
            : query.field === "title"
            ? row.title
            : query.field === "body"
            ? row.body
            : query.field === "author"
            ? row.author
            : row.link
    const text = query.caseSensitive ? value : value.toLocaleLowerCase()
    const words = (input: string) =>
        input
            .split(/[,，;；\n]/u)
            .map(s => s.trim())
            .filter(Boolean)
    const contains = (word: string) =>
        text.includes(query.caseSensitive ? word : word.toLocaleLowerCase())
    const includes = words(query.include)
    let matches = query.legacyFilter
        ? matchesLegacyFilter(query, row)
        : query.conditions
        ? matchesConditions(query.conditions, query.logic || "all", {
              title: row.title,
              snippet: row.body,
              creator: row.author,
              link: row.link,
          })
        : query.regex !== undefined
        ? new RegExp(query.regex, query.caseSensitive ? "u" : "iu").test(value)
        : !includes.length ||
          (query.all ? includes.every(contains) : includes.some(contains))
    if (query.negate) matches = !matches
    return (
        matches &&
        (query.conditions ||
            query.legacyFilter ||
            !words(query.exclude).some(contains)) &&
        (query.start === undefined || row.date >= query.start) &&
        (query.end === undefined || row.date < query.end)
    )
}

export function archivePattern(query: ArchiveQuery) {
    const words = (value: string) =>
        value
            .split(/[,，;；\n]/u)
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    const includes = words(query.include),
        excludes = words(query.exclude)
    const reject = excludes.map(s => "(?![\\s\\S]*" + s + ")").join("")
    const accept = query.all
        ? includes.map(s => "(?=[\\s\\S]*" + s + ")").join("")
        : includes.length
        ? "(?=[\\s\\S]*(?:" + includes.join("|") + "))"
        : ""
    return "^" + reject + accept + "[\\s\\S]*$"
}
