import type Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import { Worker } from "node:worker_threads"
import { forumKey } from "../forum"
import {
    ArchiveAction,
    ArchiveChange,
    ArchivePreview,
    ArchiveQuery,
    ArchiveResult,
    ArchiveRow,
    ArchiveRule,
    ArticleFolder,
    ArticleNote,
    archiveMatches,
    archiveExcerpt,
} from "../archive-types"

type Membership = { folderId: number; stamp: string }
type Change = ArchiveChange & {
    added: Membership[]
    removed: Membership[]
    membershipsAfter?: Membership[]
}
const protectedSQL = `(i.kept=1 OR i.starred=1 OR i.readLater=1
    OR EXISTS(SELECT 1 FROM folder_articles f WHERE f.itemId=i._id)
    OR EXISTS(SELECT 1 FROM article_notes n WHERE n.itemId=i._id AND length(n.text)>0))`
export { protectedSQL }

export class ArticleArchive {
    private previews = new Map<string, number[]>()
    constructor(
        private db: Database.Database,
        private groupSources: (gid: number) => number[] = () => [],
        private changed: () => void = () => {}
    ) {
        db.function("forum_key", { deterministic: true }, forumKey)
    }

    folders(): ArticleFolder[] {
        return this.db
            .prepare(
                `SELECT f.id,f.parentId,f.name,f.position,
            (SELECT count(DISTINCT CASE WHEN coalesce(n.text,'')<>'' THEN 'note:'||i._id ELSE coalesce(forum_key(i.link),'item:'||i._id) END) FROM folder_articles a
             JOIN items i ON i._id=a.itemId LEFT JOIN article_notes n ON n.itemId=i._id
             JOIN article_folders d ON d.id=a.folderId
             WHERE d.deleted=0 AND (d.id=f.id OR d.parentId=f.id)) AS count
            FROM article_folders f WHERE f.deleted=0 ORDER BY f.position,f.id`
            )
            .all() as ArticleFolder[]
    }
    private folder(id: number) {
        const row = this.db
            .prepare("SELECT * FROM article_folders WHERE id=? AND deleted=0")
            .get(id) as ArticleFolder
        if (!row) throw new Error("文件夹已不存在，请重新选择。")
        return row
    }
    saveFolder(input: {
        id?: number
        name: string
        parentId?: number | null
        position?: number
    }) {
        const name = String(input.name || "").trim()
        if (!name || name.length > 100)
            throw new Error("文件夹名称应为 1～100 个字符。")
        const parentId = input.parentId ?? null
        if (
            parentId !== null &&
            (parentId === input.id || this.folder(parentId).parentId !== null)
        )
            throw new Error("目前支持两级文件夹，请选择一级文件夹作为上级。")
        if (input.id !== undefined) {
            this.folder(input.id)
            if (
                parentId !== null &&
                this.db
                    .prepare(
                        "SELECT 1 FROM article_folders WHERE parentId=? AND deleted=0"
                    )
                    .get(input.id)
            )
                throw new Error("包含子文件夹的目录不能再放入另一子目录。")
        }
        const duplicate = this.db
            .prepare(
                "SELECT id FROM article_folders WHERE deleted=0 AND parentId IS ? AND name=? COLLATE NOCASE AND id<>?"
            )
            .get(parentId, name, input.id ?? -1)
        if (duplicate) throw new Error("同一位置已有这个名称的文件夹。")
        const position = Number.isSafeInteger(input.position)
            ? input.position
            : Date.now()
        let id = input.id
        if (id !== undefined)
            this.db
                .prepare(
                    "UPDATE article_folders SET name=?,parentId=?,position=? WHERE id=?"
                )
                .run(name, parentId, position, id)
        else
            id = Number(
                this.db
                    .prepare(
                        "INSERT INTO article_folders(name,parentId,position) VALUES(?,?,?)"
                    )
                    .run(name, parentId, position).lastInsertRowid
            )
        this.changed()
        return id
    }
    deleteFolder(id: number, moveTo: number | null = null) {
        this.folder(id)
        const ids = [
            id,
            ...this.folders()
                .filter(f => f.parentId === id)
                .map(f => f.id),
        ]
        if (moveTo !== null) {
            this.folder(moveTo)
            if (ids.includes(moveTo))
                throw new Error("目标不能是即将删除的文件夹。")
        }
        this.db.transaction(() => {
            for (const folderId of ids) {
                if (moveTo !== null)
                    this.db
                        .prepare(
                            "INSERT OR IGNORE INTO folder_articles(folderId,itemId,stamp) SELECT ?,itemId,? FROM folder_articles WHERE folderId=?"
                        )
                        .run(moveTo, randomUUID(), folderId)
                this.db
                    .prepare(
                        "UPDATE items SET kept=1 WHERE _id IN (SELECT itemId FROM folder_articles WHERE folderId=?)"
                    )
                    .run(folderId)
                this.db
                    .prepare("DELETE FROM folder_articles WHERE folderId=?")
                    .run(folderId)
                this.db
                    .prepare("UPDATE article_folders SET deleted=1 WHERE id=?")
                    .run(folderId)
            }
            for (const rule of this.rules())
                if (ids.includes(rule.action.folderId)) {
                    rule.enabled = false
                    rule.error = "目标文件夹已删除"
                    this.db
                        .prepare("UPDATE archive_rules SET spec=? WHERE id=?")
                        .run(JSON.stringify(rule), rule.id)
                }
        })()
        this.changed()
        return true
    }
    syncLegacyTopics(ids?: number[]) {
        const rows = this.db
            .prepare(
                `SELECT _id,tags FROM items ${
                    ids
                        ? "WHERE _id IN (SELECT value FROM json_each(?))"
                        : "WHERE tags LIKE '%主题/%'"
                }`
            )
            .all(...(ids ? [JSON.stringify(ids)] : [])) as {
            _id: number
            tags: string
        }[]
        this.db.transaction(() => {
            for (const row of rows) {
                const tags = JSON.parse(row.tags || "[]") as string[]
                for (const tag of tags) {
                    if (!tag.startsWith("主题/")) continue
                    const name = tag.slice(3).trim()
                    if (!name) continue
                    // Keep this immutable mapping after rename or deletion, so old
                    // rules can neither recreate a deleted folder nor lose its ID.
                    let folder = this.db
                        .prepare(
                            "SELECT id,deleted FROM article_folders WHERE legacyName=?"
                        )
                        .get(name) as { id: number; deleted: number }
                    if (!folder) {
                        const existing = this.db
                            .prepare(
                                "SELECT id,deleted FROM article_folders WHERE parentId IS NULL AND name=? AND deleted=0"
                            )
                            .get(name) as typeof folder
                        if (existing) {
                            this.db
                                .prepare(
                                    "UPDATE article_folders SET legacyName=? WHERE id=?"
                                )
                                .run(name, existing.id)
                            folder = existing
                        } else
                            folder = {
                                id: Number(
                                    this.db
                                        .prepare(
                                            "INSERT INTO article_folders(name,legacyName) VALUES(?,?)"
                                        )
                                        .run(name, name).lastInsertRowid
                                ),
                                deleted: 0,
                            }
                    }
                    if (folder.deleted) continue
                    this.db
                        .prepare(
                            "INSERT OR IGNORE INTO folder_articles(folderId,itemId,stamp) VALUES(?,?,?)"
                        )
                        .run(folder.id, row._id, "legacy")
                    this.db
                        .prepare("UPDATE items SET kept=1 WHERE _id=?")
                        .run(row._id)
                }
                if (tags.some(tag => tag.startsWith("主题/")))
                    this.db
                        .prepare("UPDATE items SET tags=? WHERE _id=?")
                        .run(
                            JSON.stringify(
                                tags.filter(tag => !tag.startsWith("主题/"))
                            ),
                            row._id
                        )
            }
        })()
    }
    note(id: number): ArticleNote {
        if (!this.db.prepare("SELECT 1 FROM items WHERE _id=?").get(id))
            throw new Error("文章已不存在。")
        return (
            (this.db
                .prepare(
                    "SELECT text,version,updatedAt FROM article_notes WHERE itemId=?"
                )
                .get(id) as ArticleNote) || {
                text: "",
                version: 0,
                updatedAt: 0,
            }
        )
    }
    saveNote(id: number, text: string, version: number): ArticleNote {
        if (
            typeof text !== "string" ||
            text.length > 200000 ||
            !Number.isSafeInteger(version)
        )
            throw new Error("备注内容或版本无效。")
        const result = this.db.transaction(() => {
            const current = this.note(id)
            if (current.version !== version)
                throw new Error(
                    "备注已在另一处更新；已保留你的输入，请重新载入后合并。"
                )
            const next = { text, version: version + 1, updatedAt: Date.now() }
            this.db
                .prepare(
                    "INSERT INTO article_notes(itemId,text,version,updatedAt) VALUES(?,?,?,?) ON CONFLICT(itemId) DO UPDATE SET text=excluded.text,version=excluded.version,updatedAt=excluded.updatedAt"
                )
                .run(id, text, next.version, next.updatedAt)
            if (text.trim())
                this.db.prepare("UPDATE items SET kept=1 WHERE _id=?").run(id)
            return next
        })()
        this.changed()
        return result
    }
    private validate(query: ArchiveQuery) {
        if (
            !query ||
            typeof query.include !== "string" ||
            typeof query.exclude !== "string" ||
            query.include.length > 5000 ||
            query.exclude.length > 5000 ||
            !["full", "title", "body", "author", "link"].includes(query.field)
        )
            throw new Error("筛选条件无效。")
        if (query.regex !== undefined) {
            if (typeof query.regex !== "string" || query.regex.length > 2000)
                throw new Error("正则条件过长。")
            new RegExp(query.regex, "u")
        }
        if (
            query.sids &&
            (!Array.isArray(query.sids) ||
                query.sids.some(n => !Number.isSafeInteger(n)))
        )
            throw new Error("订阅范围无效。")
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
            throw new Error("结束日期必须晚于开始日期。")
    }
    private rows(query: ArchiveQuery, ids?: number[]): ArchiveRow[] {
        const sids =
            query.gid !== undefined ? this.groupSources(query.gid) : query.sids
        const conditions: string[] = [],
            params: string[] = []
        if (sids) {
            conditions.push("i.source IN (SELECT value FROM json_each(?))")
            params.push(JSON.stringify(sids))
        }
        if (ids) {
            conditions.push("i._id IN (SELECT value FROM json_each(?))")
            params.push(JSON.stringify(ids))
        }
        return this.db
            .prepare(
                `SELECT i._id AS id,i.title,i.link,i.date,coalesce(i.creator,'') AS author,coalesce(s.name,'历史来源') AS source,
            html_text(i.content)||char(10)||coalesce(c.fullText,'')||char(10)||coalesce(c.offlineText,'') AS body
            FROM items i LEFT JOIN sources s ON s.sid=i.source LEFT JOIN article_content c ON c.itemId=i._id
            ${
                conditions.length ? "WHERE " + conditions.join(" AND ") : ""
            } ORDER BY i.date DESC,i._id DESC`
            )
            .all(...params) as ArchiveRow[]
    }
    private async match(
        query: ArchiveQuery,
        rows: ArchiveRow[],
        preview = false
    ) {
        this.validate(query)
        if (query.regex === undefined)
            return rows
                .filter(row => archiveMatches(query, row))
                .map(row =>
                    preview
                        ? { ...row, excerpt: archiveExcerpt(query, row) }
                        : row
                )
        return new Promise<ArchiveRow[]>((resolve, reject) => {
            const worker = new Worker(
                `const {parentPort,workerData}=require('node:worker_threads'); const match=${archiveMatches.toString()},excerpt=${archiveExcerpt.toString()}; try{ parentPort.postMessage({matches:workerData.rows.filter(r=>match(workerData.query,r)).map(r=>({id:r.id,excerpt:workerData.preview?excerpt(workerData.query,r):undefined}))}) }catch(e){parentPort.postMessage({error:String(e)})}`,
                { eval: true, workerData: { query, rows, preview } }
            )
            const timer = setTimeout(() => {
                void worker.terminate()
                reject(new Error("正则执行超时，请简化条件。"))
            }, 1500)
            worker.once("error", e => {
                clearTimeout(timer)
                reject(e)
            })
            worker.once("message", result => {
                clearTimeout(timer)
                void worker.terminate()
                if (result.error) reject(new Error(result.error))
                else {
                    const found = new Map<number, ArchiveRow["excerpt"]>(
                        result.matches.map(r => [r.id, r.excerpt])
                    )
                    resolve(
                        rows
                            .filter(r => found.has(r.id))
                            .map(r => ({ ...r, excerpt: found.get(r.id) }))
                    )
                }
            })
        })
    }
    async preview(query: ArchiveQuery): Promise<ArchivePreview> {
        this.validate(query)
        const rows = await this.match(query, this.rows(query), true)
        const token = randomUUID()
        if (this.previews.size >= 12)
            this.previews.delete(this.previews.keys().next().value)
        this.previews.set(
            token,
            rows.map(r => r.id)
        )
        return {
            token,
            rows: rows.map(r => ({ ...r, body: r.body.slice(0, 240) })),
        }
    }
    applyPreview(token: string, excluded: number[], action: ArchiveAction) {
        const ids = this.previews.get(token)
        if (!ids) throw new Error("预览已过期，请重新预览。")
        const exclude = new Set(excluded)
        const result = this.apply(
            ids.filter(id => !exclude.has(id)),
            action
        )
        this.previews.delete(token)
        return result
    }
    private validateAction(action: ArchiveAction) {
        if (
            ![
                "folder",
                "remove",
                "hide",
                "restore",
                "read",
                "unread",
                "star",
                "unstar",
                "later",
                "unlater",
            ].includes(action?.kind)
        )
            throw new Error("操作无效。")
        if (action.kind === "folder" || action.kind === "remove")
            this.folder(action.folderId)
        if (action.fromFolderId !== undefined) this.folder(action.fromFolderId)
    }
    apply(
        ids: number[],
        action: ArchiveAction,
        keepHistory = true
    ): ArchiveResult {
        if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id)))
            throw new Error("文章选择无效。")
        this.validateAction(action)
        if (action.kind === "remove" || action.fromFolderId !== undefined) {
            const expanded = new Set(ids)
            for (const id of ids) {
                const row = this.db
                    .prepare("SELECT link FROM items WHERE _id=?")
                    .get(id) as { link: string } | undefined
                const key = row && forumKey(row.link)
                if (key)
                    for (const copy of this.db
                        .prepare(
                            "SELECT _id FROM items WHERE forum_key(link)=?"
                        )
                        .all(key) as { _id: number }[])
                        expanded.add(copy._id)
            }
            ids = [...expanded]
        }
        const batchId = randomUUID(),
            changes: Change[] = []
        this.db.transaction(() => {
            for (const id of new Set(ids)) {
                const item = this.db
                    .prepare("SELECT * FROM items WHERE _id=?")
                    .get(id) as Record<string, any>
                if (!item) continue
                const change: Change = {
                    id,
                    serviceRef: item.serviceRef,
                    fields: {},
                    added: [],
                    removed: [],
                }
                const set = (field: string, value: number) => {
                    if (item[field] !== value) {
                        change.fields[field] = {
                            before: item[field],
                            after: value,
                        }
                        this.db
                            .prepare(`UPDATE items SET ${field}=? WHERE _id=?`)
                            .run(value, id)
                    }
                }
                const remove = (folderId: number) => {
                    const membership = this.db
                        .prepare(
                            "SELECT folderId,stamp FROM folder_articles WHERE folderId=? AND itemId=?"
                        )
                        .get(folderId, id) as Membership
                    if (membership) {
                        change.removed.push(membership)
                        this.db
                            .prepare(
                                "DELETE FROM folder_articles WHERE folderId=? AND itemId=?"
                            )
                            .run(folderId, id)
                    }
                }
                if (action.kind === "folder") {
                    if (
                        action.fromFolderId !== undefined &&
                        action.fromFolderId !== action.folderId
                    )
                        remove(action.fromFolderId)
                    const result = this.db
                        .prepare(
                            "INSERT OR IGNORE INTO folder_articles(folderId,itemId,stamp) VALUES(?,?,?)"
                        )
                        .run(action.folderId, id, batchId)
                    if (result.changes)
                        change.added.push({
                            folderId: action.folderId,
                            stamp: batchId,
                        })
                    set("kept", 1)
                    if (action.feedHidden) set("feedHidden", 1)
                }
                if (action.kind === "remove") {
                    remove(action.folderId)
                    set("kept", 1)
                }
                if (action.kind === "hide") set("hidden", 1)
                if (action.kind === "restore") {
                    set("hidden", 0)
                    set("feedHidden", 0)
                }
                if (action.kind === "read" || action.kind === "unread")
                    set("hasRead", action.kind === "read" ? 1 : 0)
                if (action.kind === "star" || action.kind === "unstar")
                    set("starred", action.kind === "star" ? 1 : 0)
                if (action.kind === "later" || action.kind === "unlater")
                    set("readLater", action.kind === "later" ? 1 : 0)
                if (
                    change.added.length ||
                    change.removed.length ||
                    Object.keys(change.fields).length
                ) {
                    change.membershipsAfter = this.db
                        .prepare(
                            "SELECT folderId,stamp FROM folder_articles WHERE itemId=? ORDER BY folderId"
                        )
                        .all(id) as Membership[]
                    changes.push(change)
                }
            }
            if (keepHistory && changes.length)
                this.db
                    .prepare(
                        "INSERT INTO archive_batches(id,payload,createdAt) VALUES(?,?,?)"
                    )
                    .run(batchId, JSON.stringify(changes), Date.now())
            this.db
                .prepare(
                    "DELETE FROM archive_batches WHERE id NOT IN (SELECT id FROM archive_batches ORDER BY createdAt DESC,rowid DESC LIMIT 100)"
                )
                .run()
        })()
        this.changed()
        return { batchId, count: changes.length, skipped: 0, changes }
    }
    undo(batchId: string): ArchiveResult {
        const batch = this.db
            .prepare(
                "SELECT payload FROM archive_batches WHERE id=? AND undone=0"
            )
            .get(batchId) as { payload: string }
        if (!batch) throw new Error("这次操作已撤销或不可撤销。")
        let skipped = 0
        const changes: ArchiveChange[] = []
        this.db.transaction(() => {
            for (const previous of JSON.parse(batch.payload) as Change[]) {
                const item = this.db
                    .prepare("SELECT * FROM items WHERE _id=?")
                    .get(previous.id) as Record<string, any>
                if (!item) {
                    skipped++
                    continue
                }
                const change: ArchiveChange = {
                    id: previous.id,
                    serviceRef: item.serviceRef,
                    fields: {},
                }
                for (const [key, value] of Object.entries(previous.fields)) {
                    if (key === "kept") continue // Removing a classification must not make saved material eligible for deletion.
                    if (item[key] === value.after) {
                        this.db
                            .prepare(`UPDATE items SET ${key}=? WHERE _id=?`)
                            .run(value.before, previous.id)
                        change.fields[key] = {
                            before: value.after,
                            after: value.before,
                        }
                    } else skipped++
                }
                const memberships = this.db
                    .prepare(
                        "SELECT folderId,stamp FROM folder_articles WHERE itemId=? ORDER BY folderId"
                    )
                    .all(previous.id)
                if (
                    previous.membershipsAfter &&
                    JSON.stringify(memberships) !==
                        JSON.stringify(previous.membershipsAfter)
                )
                    skipped++
                else {
                    for (const m of previous.added)
                        this.db
                            .prepare(
                                "DELETE FROM folder_articles WHERE itemId=? AND folderId=? AND stamp=?"
                            )
                            .run(previous.id, m.folderId, m.stamp)
                    for (const m of previous.removed)
                        if (
                            this.db
                                .prepare(
                                    "SELECT 1 FROM article_folders WHERE id=? AND deleted=0"
                                )
                                .get(m.folderId)
                        )
                            this.db
                                .prepare(
                                    "INSERT OR IGNORE INTO folder_articles(folderId,itemId,stamp) VALUES(?,?,?)"
                                )
                                .run(m.folderId, previous.id, randomUUID())
                }
                changes.push(change)
            }
            this.db
                .prepare("UPDATE archive_batches SET undone=1 WHERE id=?")
                .run(batchId)
        })()
        this.changed()
        return { batchId, count: changes.length, skipped, changes }
    }
    rules(): ArchiveRule[] {
        return (
            this.db
                .prepare("SELECT spec FROM archive_rules ORDER BY rowid")
                .all() as { spec: string }[]
        ).map(r => JSON.parse(r.spec))
    }
    saveRule(rule: ArchiveRule) {
        this.validate(rule.query)
        this.validateAction(rule.action)
        if (
            !rule.name?.trim() ||
            rule.name.length > 120 ||
            typeof rule.enabled !== "boolean"
        )
            throw new Error("请填写有效规则名称。")
        const next = {
            ...rule,
            id: rule.id || randomUUID(),
            error: undefined,
            query: { ...rule.query, start: undefined, end: undefined },
        }
        this.db
            .prepare(
                "INSERT INTO archive_rules(id,spec) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET spec=excluded.spec"
            )
            .run(next.id, JSON.stringify(next))
        this.changed()
        return next
    }
    deleteRule(id: string) {
        this.db.prepare("DELETE FROM archive_rules WHERE id=?").run(id)
        this.changed()
        return true
    }
    async afterInsert(ids: number[]) {
        this.syncLegacyTopics(ids)
        for (const rule of this.rules().filter(r => r.enabled)) {
            try {
                const matches = await this.match(
                    rule.query,
                    this.rows(rule.query, ids)
                )
                this.apply(
                    matches.map(r => r.id),
                    rule.action,
                    false
                )
            } catch (error) {
                this.db
                    .prepare("UPDATE archive_rules SET spec=? WHERE id=?")
                    .run(
                        JSON.stringify({ ...rule, error: String(error) }),
                        rule.id
                    )
            }
        }
        this.changed()
    }
    retireSource(sid: number) {
        this.db.transaction(() => {
            this.db
                .prepare(
                    `DELETE FROM items WHERE _id IN (SELECT i._id FROM items i WHERE i.source=? AND NOT ${protectedSQL})`
                )
                .run(sid)
            this.db
                .prepare(
                    "UPDATE items SET serviceRef=NULL,kept=1 WHERE source=?"
                )
                .run(sid)
            if (this.db.prepare("SELECT 1 FROM items WHERE source=?").get(sid))
                this.db
                    .prepare(
                        "UPDATE sources SET archived=1,hidden=1,serviceRef=NULL WHERE sid=?"
                    )
                    .run(sid)
            else this.db.prepare("DELETE FROM sources WHERE sid=?").run(sid)
        })()
        this.changed()
        return true
    }
}
