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

// Self-contained: user expressions are evaluated only in the bounded worker.
export function archiveExcerpt(query: ArchiveQuery, row: ArchiveRow) {
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
            query.caseSensitive ? "u" : "iu"
        ).exec(value)
        if (match) {
            index = match.index
            length = match[0].length
        }
    } else {
        const text = query.caseSensitive ? value : value.toLocaleLowerCase()
        let first = Infinity
        for (const word of query.include
            .split(/[,，;；\n]/u)
            .map(s => s.trim())
            .filter(Boolean)) {
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
    const matches =
        query.regex !== undefined
            ? new RegExp(query.regex, query.caseSensitive ? "u" : "iu").test(
                  value
              )
            : !includes.length ||
              (query.all ? includes.every(contains) : includes.some(contains))
    return (
        matches &&
        !words(query.exclude).some(contains) &&
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
