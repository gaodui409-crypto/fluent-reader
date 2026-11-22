import type Database from "better-sqlite3"
import type { ArticleNote } from "../archive-types"

export class ArchiveNotes {
    constructor(private db: Database.Database, private changed: () => void) {}

    note(id: number): ArticleNote {
        if (
            !Number.isSafeInteger(id) ||
            !this.db.prepare("SELECT 1 FROM items WHERE _id=?").get(id)
        )
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
            throw new Error("备注内容不能超过 20 万字，请精简后再保存。")
        const result = this.db.transaction(() => {
            const current = this.note(id)
            if (current.version !== version)
                throw new Error(
                    "这篇备注刚刚在另一处更新过；你当前输入的内容已保留，点击下方「保留当前输入并重试保存」即可覆盖保存。"
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
}
