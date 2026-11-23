import type Database from "better-sqlite3"
import * as fs from "node:fs"
import * as path from "node:path"
import { Worker } from "node:worker_threads"
import {
    ArchiveQuery,
    ArchiveRow,
    archiveExcerpt,
    archiveMatches,
} from "../archive-types"

export function isArchiveQueryConstrained(query: ArchiveQuery): boolean {
    return Boolean(
        query.include?.trim() ||
            query.exclude?.trim() ||
            (query.regex !== undefined && query.regex !== "") ||
            (query.sids && query.sids.length > 0) ||
            query.gid !== undefined ||
            query.start !== undefined ||
            query.end !== undefined ||
            (query.readState !== undefined && query.readState !== "all") ||
            query.unfolderedOnly ||
            query.starredOnly
    )
}

export function isUnconstrainedArchiveQuery(query: ArchiveQuery): boolean {
    return !isArchiveQueryConstrained(query)
}

export function validateArchiveQuery(query: ArchiveQuery) {
    if (
        !query ||
        typeof query.include !== "string" ||
        typeof query.exclude !== "string" ||
        query.include.length > 5000 ||
        query.exclude.length > 5000 ||
        !["full", "title", "body", "author", "link"].includes(query.field)
    )
        throw new Error("筛选条件格式无效。")
    if (query.regex !== undefined) {
        if (typeof query.regex !== "string" || query.regex.length > 2000)
            throw new Error("正则表达式长度不能超过 2000 个字符。")
        try {
            new RegExp(query.regex, "u")
        } catch {
            throw new Error("正则表达式写法有误，请检查括号或转义符号。")
        }
    }
    if (
        query.sids &&
        (!Array.isArray(query.sids) ||
            query.sids.some(n => !Number.isSafeInteger(n)))
    )
        throw new Error("所选订阅源范围无效。")
    if (
        [query.start, query.end, query.gid].some(
            n => n !== undefined && !Number.isSafeInteger(n)
        )
    )
        throw new Error("日期或分组范围无效。")
    if (
        query.start !== undefined &&
        query.end !== undefined &&
        query.start >= query.end
    )
        throw new Error("结束日期需要晚于开始日期。")
    if (
        query.readState !== undefined &&
        !["all", "unread", "read"].includes(query.readState)
    )
        throw new Error("阅读状态筛选条件无效。")
    if (
        query.unfolderedOnly !== undefined &&
        typeof query.unfolderedOnly !== "boolean"
    )
        throw new Error("未归档筛选条件无效。")
    if (
        query.starredOnly !== undefined &&
        typeof query.starredOnly !== "boolean"
    )
        throw new Error("星标筛选条件无效。")
}

function hasFtsTable(db: Database.Database): boolean {
    return Boolean(
        db
            .prepare(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='article_fts'"
            )
            .get()
    )
}

export function queryArchiveRows(
    db: Database.Database,
    groupSources: (gid: number) => number[],
    query: ArchiveQuery,
    ids?: number[]
): ArchiveRow[] {
    const sids = query.gid !== undefined ? groupSources(query.gid) : query.sids
    const conditions: string[] = []
    const params: (string | number)[] = []
    if (sids) {
        conditions.push("i.source IN (SELECT value FROM json_each(?))")
        params.push(JSON.stringify(sids))
    }
    if (ids) {
        conditions.push("i._id IN (SELECT value FROM json_each(?))")
        params.push(JSON.stringify(ids))
    }
    if (query.start !== undefined) {
        conditions.push("i.date >= ?")
        params.push(query.start)
    }
    if (query.end !== undefined) {
        conditions.push("i.date < ?")
        params.push(query.end)
    }
    if (query.readState === "unread") {
        conditions.push("i.hasRead = 0")
    } else if (query.readState === "read") {
        conditions.push("i.hasRead = 1")
    }
    if (query.starredOnly) {
        conditions.push("i.starred = 1")
    }
    if (query.unfolderedOnly) {
        conditions.push(
            "NOT EXISTS (SELECT 1 FROM folder_articles fa WHERE fa.itemId=i._id)"
        )
    }

    const ftsAvailable = hasFtsTable(db)
    const needsBody = query.field === "full" || query.field === "body"

    // Pre-filter via trigram FTS5 when doing plain keyword search with >=3-codepoint terms
    // and all rows have been indexed into article_fts.
    if (
        ftsAvailable &&
        !ids &&
        query.regex === undefined &&
        ["full", "title", "body"].includes(query.field)
    ) {
        const words = query.include
            .split(/[,，;；\n]/u)
            .map(s => s.trim())
            .filter(Boolean)
        const ftsTerms = words.filter(w => [...w].length >= 3)
        const canUseFts =
            words.length > 0 &&
            (query.all ? ftsTerms.length > 0 : ftsTerms.length === words.length)
        if (canUseFts) {
            const unindexed = db
                .prepare(
                    "SELECT 1 FROM items i LEFT JOIN article_fts f ON f.rowid=i._id WHERE f.rowid IS NULL LIMIT 1"
                )
                .get()
            if (!unindexed) {
                const matchExpr = ftsTerms
                    .map(t => '"' + t.replace(/"/g, '""') + '"')
                    .join(query.all ? " AND " : " OR ")
                conditions.push(
                    "i._id IN (SELECT rowid FROM article_fts WHERE article_fts MATCH ?)"
                )
                params.push(matchExpr)
            }
        }
    }

    const whereClause = conditions.length
        ? "WHERE " + conditions.join(" AND ")
        : ""
    const metaColumns =
        "i.hasRead,i.starred,EXISTS(SELECT 1 FROM folder_articles fa WHERE fa.itemId=i._id) AS inFolder"

    if (!needsBody) {
        return db
            .prepare(
                `SELECT i._id AS id,i.title,i.link,i.date,coalesce(i.creator,'') AS author,coalesce(s.name,'已退订来源') AS source,
                ${metaColumns},
                '' AS body
                FROM items i LEFT JOIN sources s ON s.sid=i.source
                ${whereClause} ORDER BY i.date DESC,i._id DESC`
            )
            .all(...params) as ArchiveRow[]
    }

    if (ftsAvailable) {
        return db
            .prepare(
                `SELECT i._id AS id,i.title,i.link,i.date,coalesce(i.creator,'') AS author,coalesce(s.name,'已退订来源') AS source,
                ${metaColumns},
                coalesce(f.body, html_text(i.content))||char(10)||coalesce(c.fullText,'')||char(10)||coalesce(c.offlineText,'') AS body
                FROM items i
                LEFT JOIN sources s ON s.sid=i.source
                LEFT JOIN article_content c ON c.itemId=i._id
                LEFT JOIN article_fts f ON f.rowid=i._id
                ${whereClause} ORDER BY i.date DESC,i._id DESC`
            )
            .all(...params) as ArchiveRow[]
    }

    return db
        .prepare(
            `SELECT i._id AS id,i.title,i.link,i.date,coalesce(i.creator,'') AS author,coalesce(s.name,'已退订来源') AS source,
            ${metaColumns},
            html_text(i.content)||char(10)||coalesce(c.fullText,'')||char(10)||coalesce(c.offlineText,'') AS body
            FROM items i LEFT JOIN sources s ON s.sid=i.source LEFT JOIN article_content c ON c.itemId=i._id
            ${whereClause} ORDER BY i.date DESC,i._id DESC`
        )
        .all(...params) as ArchiveRow[]
}

export const loadCandidateRows = queryArchiveRows

function resolveWorkerScriptPath(): string {
    const sibling = path.join(__dirname, "archive-worker.js")
    if (sibling.includes("app.asar")) {
        const unpacked = sibling.replace("app.asar", "app.asar.unpacked")
        if (fs.existsSync(unpacked)) return unpacked
    }
    if (fs.existsSync(sibling)) return sibling
    const built = path.resolve(__dirname, "../../dist/archive-worker.js")
    if (fs.existsSync(built)) return built
    return sibling
}

export class ArchiveMatcher {
    private worker: Worker | null = null
    private nextJobId = 0
    private latestPreviewTicket = 0
    private queue: Promise<unknown> = Promise.resolve()

    private ensureWorker(): Worker {
        if (this.worker) return this.worker
        const script = resolveWorkerScriptPath()
        const worker = new Worker(script)
        worker.unref()
        worker.on("exit", () => {
            if (this.worker === worker) this.worker = null
        })
        this.worker = worker
        return worker
    }

    terminate() {
        if (this.worker) {
            const w = this.worker
            this.worker = null
            void w.terminate()
        }
    }

    async match(
        query: ArchiveQuery,
        rows: ArchiveRow[],
        preview = false
    ): Promise<ArchiveRow[]> {
        validateArchiveQuery(query)
        if (!rows.length) return []
        if (query.regex === undefined) {
            return rows
                .filter(row => archiveMatches(query, row))
                .map(row =>
                    preview
                        ? { ...row, excerpt: archiveExcerpt(query, row) }
                        : row
                )
        }
        const previewTicket = preview ? ++this.latestPreviewTicket : 0
        const runJob = () =>
            new Promise<ArchiveRow[]>((resolve, reject) => {
                if (preview && previewTicket !== this.latestPreviewTicket) {
                    resolve([])
                    return
                }
                let worker: Worker
                try {
                    worker = this.ensureWorker()
                } catch (err) {
                    reject(err)
                    return
                }
                const jobId = ++this.nextJobId
                const cleanup = () => {
                    clearTimeout(timer)
                    worker.removeListener("message", onMessage)
                    worker.removeListener("error", onError)
                    worker.removeListener("exit", onExit)
                }
                const timer = setTimeout(() => {
                    cleanup()
                    if (this.worker === worker) this.worker = null
                    void worker.terminate()
                    reject(new Error("正则匹配超时，请简化匹配表达式。"))
                }, 1500)
                const onError = (err: Error) => {
                    cleanup()
                    if (this.worker === worker) this.worker = null
                    void worker.terminate()
                    reject(err)
                }
                const onExit = (code: number) => {
                    cleanup()
                    if (this.worker === worker) this.worker = null
                    reject(
                        new Error(`筛选引擎意外中断（代码 ${code}），请重试。`)
                    )
                }
                const onMessage = (result: {
                    jobId: number
                    error?: string
                    matches?: { id: number; excerpt?: ArchiveRow["excerpt"] }[]
                }) => {
                    if (result?.jobId !== jobId) return
                    cleanup()
                    if (result.error) {
                        reject(new Error(result.error))
                        return
                    }
                    const found = new Map<number, ArchiveRow["excerpt"]>(
                        (result.matches || []).map(r => [r.id, r.excerpt])
                    )
                    resolve(
                        rows
                            .filter(r => found.has(r.id))
                            .map(r => ({ ...r, excerpt: found.get(r.id) }))
                    )
                }
                worker.on("message", onMessage)
                worker.once("error", onError)
                worker.once("exit", onExit)
                worker.postMessage({ jobId, query, rows, preview })
            })

        const task = this.queue.then(runJob, runJob)
        this.queue = task.then(
            () => undefined,
            () => undefined
        )
        return task
    }
}
