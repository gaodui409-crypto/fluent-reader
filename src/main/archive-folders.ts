import type Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import type { ArchiveRule, ArticleFolder } from "../archive-types"

function safeParseStringArray(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw || "[]")
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : []
    } catch {
        return []
    }
}

export class ArchiveFolders {
    constructor(
        private db: Database.Database,
        private getRules: () => ArchiveRule[],
        private changed: () => void
    ) {}

    folders(): ArticleFolder[] {
        return this.db
            .prepare(
                `SELECT f.id,f.parentId,f.name,f.position,
            (SELECT count(DISTINCT CASE WHEN coalesce(n.text,'')<>'' THEN 'note:'||i._id ELSE coalesce(CASE WHEN i.link LIKE '%linux.do/t/%' THEN forum_key(i.link) ELSE NULL END,'item:'||i._id) END) FROM folder_articles a
             JOIN items i ON i._id=a.itemId LEFT JOIN article_notes n ON n.itemId=i._id
             JOIN article_folders d ON d.id=a.folderId
             WHERE d.deleted=0 AND (d.id=f.id OR d.parentId=f.id)) AS count
            FROM article_folders f WHERE f.deleted=0 ORDER BY f.position,f.id`
            )
            .all() as ArticleFolder[]
    }

    memberships(itemId: number): number[] {
        if (!Number.isSafeInteger(itemId)) return []
        return (
            this.db
                .prepare(
                    "SELECT fa.folderId FROM folder_articles fa JOIN article_folders f ON f.id=fa.folderId WHERE fa.itemId=? AND f.deleted=0 ORDER BY f.position,f.id"
                )
                .all(itemId) as { folderId: number }[]
        ).map(r => r.folderId)
    }

    requireFolder(id: number): ArticleFolder {
        if (!Number.isSafeInteger(id))
            throw new Error("请选择有效的目标文件夹。")
        const row = this.db
            .prepare("SELECT * FROM article_folders WHERE id=? AND deleted=0")
            .get(id) as ArticleFolder
        if (!row) throw new Error("所选文件夹已不存在，请重新选择。")
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
            throw new Error("文件夹名称需为 1～100 个字符。")
        const parentId = input.parentId ?? null
        if (
            parentId !== null &&
            (parentId === input.id ||
                this.requireFolder(parentId).parentId !== null)
        )
            throw new Error("最多支持两级目录，请选择一级文件夹作为上级。")
        if (input.id !== undefined) {
            this.requireFolder(input.id)
            if (
                parentId !== null &&
                this.db
                    .prepare(
                        "SELECT 1 FROM article_folders WHERE parentId=? AND deleted=0"
                    )
                    .get(input.id)
            )
                throw new Error("包含子目录的文件夹不能再移入其他文件夹。")
        }
        const duplicate = this.db
            .prepare(
                "SELECT id FROM article_folders WHERE deleted=0 AND parentId IS ? AND name=? COLLATE NOCASE AND id<>?"
            )
            .get(parentId, name, input.id ?? -1)
        if (duplicate) throw new Error("同一层级下已有同名文件夹。")
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
        this.requireFolder(id)
        const ids = [
            id,
            ...this.folders()
                .filter(f => f.parentId === id)
                .map(f => f.id),
        ]
        if (moveTo !== null) {
            this.requireFolder(moveTo)
            if (ids.includes(moveTo))
                throw new Error("不能移动到即将删除的文件夹中。")
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
            for (const rule of this.getRules())
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
                        ? "WHERE _id IN (SELECT value FROM json_each(?)) AND tags LIKE '%主题/%'"
                        : "WHERE tags <> '[]' AND tags LIKE '%主题/%'"
                }`
            )
            .all(...(ids ? [JSON.stringify(ids)] : [])) as {
            _id: number
            tags: string
        }[]
        if (!rows.length) return
        this.db.transaction(() => {
            for (const row of rows) {
                const tags = safeParseStringArray(row.tags)
                for (const tag of tags) {
                    if (!tag.startsWith("主题/")) continue
                    const name = tag.slice(3).trim()
                    if (!name) continue
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
}
