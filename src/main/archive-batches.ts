import type Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import { forumKey } from "../forum"
import type {
    ArchiveAction,
    ArchiveChange,
    ArchiveResult,
} from "../archive-types"
import type { ArchiveFolders } from "./archive-folders"

type Membership = { folderId: number; stamp: string }
type Change = ArchiveChange & {
    added: Membership[]
    removed: Membership[]
    membershipsAfter?: Membership[]
}

export const protectedSQL = `(i.kept=1 OR i.starred=1 OR i.readLater=1
    OR EXISTS(SELECT 1 FROM folder_articles f WHERE f.itemId=i._id)
    OR EXISTS(SELECT 1 FROM article_notes n WHERE n.itemId=i._id AND length(n.text)>0)
    OR EXISTS(SELECT 1 FROM article_content c WHERE c.itemId=i._id AND length(c.offlinePath)>0))`

const ALLOWED_ITEM_FIELDS = new Set([
    "kept",
    "feedHidden",
    "hidden",
    "hasRead",
    "starred",
    "readLater",
])

export class ArchiveBatches {
    constructor(
        private db: Database.Database,
        private folders: ArchiveFolders,
        private changed: () => void
    ) {}

    validateAction(action: ArchiveAction) {
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
            throw new Error("不支持该整理动作。")
        if (action.kind === "folder" || action.kind === "remove")
            this.folders.requireFolder(action.folderId)
        if (action.fromFolderId !== undefined)
            this.folders.requireFolder(action.fromFolderId)
    }

    apply(
        ids: number[],
        action: ArchiveAction,
        keepHistory = true
    ): ArchiveResult {
        if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id)))
            throw new Error("所选文章列表无效。")
        this.validateAction(action)
        if (!ids.length) {
            return { batchId: randomUUID(), count: 0, skipped: 0, changes: [] }
        }
        if (action.kind === "remove" || action.fromFolderId !== undefined) {
            const expanded = new Set(ids)
            const getLink = this.db.prepare(
                "SELECT link FROM items WHERE _id=?"
            )
            const findForumCopies = this.db.prepare(
                "SELECT _id FROM items WHERE link LIKE '%linux.do/t/%' AND forum_key(link)=?"
            )
            for (const id of ids) {
                const row = getLink.get(id) as { link: string } | undefined
                const key = row && forumKey(row.link)
                if (key) {
                    for (const copy of findForumCopies.all(key) as {
                        _id: number
                    }[])
                        expanded.add(copy._id)
                }
            }
            ids = [...expanded]
        }

        const selectItem = this.db.prepare(
            "SELECT _id,serviceRef,kept,feedHidden,hidden,hasRead,starred,readLater FROM items WHERE _id=?"
        )
        const selectMembership = this.db.prepare(
            "SELECT folderId,stamp FROM folder_articles WHERE folderId=? AND itemId=?"
        )
        const deleteMembership = this.db.prepare(
            "DELETE FROM folder_articles WHERE folderId=? AND itemId=?"
        )
        const insertMembership = this.db.prepare(
            "INSERT OR IGNORE INTO folder_articles(folderId,itemId,stamp) VALUES(?,?,?)"
        )
        const selectAllMemberships = this.db.prepare(
            "SELECT folderId,stamp FROM folder_articles WHERE itemId=? ORDER BY folderId"
        )
        const fieldSetters = new Map<string, Database.Statement>()
        for (const field of ALLOWED_ITEM_FIELDS) {
            fieldSetters.set(
                field,
                this.db.prepare(`UPDATE items SET ${field}=? WHERE _id=?`)
            )
        }

        const batchId = randomUUID()
        const changes: Change[] = []
        this.db.transaction(() => {
            for (const id of new Set(ids)) {
                const item = selectItem.get(id) as Record<string, any>
                if (!item) continue
                const change: Change = {
                    id,
                    serviceRef: item.serviceRef,
                    fields: {},
                    added: [],
                    removed: [],
                }
                const set = (field: string, value: number) => {
                    if (!ALLOWED_ITEM_FIELDS.has(field)) return
                    if (item[field] !== value) {
                        change.fields[field] = {
                            before: item[field],
                            after: value,
                        }
                        fieldSetters.get(field).run(value, id)
                    }
                }
                const remove = (folderId: number) => {
                    const membership = selectMembership.get(
                        folderId,
                        id
                    ) as Membership
                    if (membership) {
                        change.removed.push(membership)
                        deleteMembership.run(folderId, id)
                    }
                }
                if (action.kind === "folder") {
                    if (
                        action.fromFolderId !== undefined &&
                        action.fromFolderId !== action.folderId
                    )
                        remove(action.fromFolderId)
                    const result = insertMembership.run(
                        action.folderId,
                        id,
                        batchId
                    )
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
                    change.membershipsAfter = selectAllMemberships.all(
                        id
                    ) as Membership[]
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
        if (!batch) throw new Error("该操作已撤销，或已超过可撤销范围。")
        let parsedChanges: Change[]
        try {
            parsedChanges = JSON.parse(batch.payload) as Change[]
            if (!Array.isArray(parsedChanges)) throw new Error("Invalid batch")
        } catch {
            throw new Error("撤销记录数据已损坏，无法回退。")
        }

        const selectItem = this.db.prepare(
            "SELECT _id,serviceRef,kept,feedHidden,hidden,hasRead,starred,readLater FROM items WHERE _id=?"
        )
        const selectAllMemberships = this.db.prepare(
            "SELECT folderId,stamp FROM folder_articles WHERE itemId=? ORDER BY folderId"
        )
        const deleteAddedMembership = this.db.prepare(
            "DELETE FROM folder_articles WHERE itemId=? AND folderId=? AND stamp=?"
        )
        const folderExists = this.db.prepare(
            "SELECT 1 FROM article_folders WHERE id=? AND deleted=0"
        )
        const restoreMembership = this.db.prepare(
            "INSERT OR IGNORE INTO folder_articles(folderId,itemId,stamp) VALUES(?,?,?)"
        )
        const fieldSetters = new Map<string, Database.Statement>()
        for (const field of ALLOWED_ITEM_FIELDS) {
            fieldSetters.set(
                field,
                this.db.prepare(`UPDATE items SET ${field}=? WHERE _id=?`)
            )
        }

        let skipped = 0
        const changes: ArchiveChange[] = []
        this.db.transaction(() => {
            for (const previous of parsedChanges) {
                const item = selectItem.get(previous.id) as Record<string, any>
                if (!item) {
                    skipped++
                    continue
                }
                const change: ArchiveChange = {
                    id: previous.id,
                    serviceRef: item.serviceRef,
                    fields: {},
                }
                for (const [key, value] of Object.entries(
                    previous.fields || {}
                )) {
                    if (key === "kept" || !ALLOWED_ITEM_FIELDS.has(key))
                        continue
                    if (item[key] === value.after) {
                        fieldSetters.get(key).run(value.before, previous.id)
                        change.fields[key] = {
                            before: value.after,
                            after: value.before,
                        }
                    } else skipped++
                }
                const memberships = selectAllMemberships.all(previous.id)
                if (
                    previous.membershipsAfter &&
                    JSON.stringify(memberships) !==
                        JSON.stringify(previous.membershipsAfter)
                )
                    skipped++
                else {
                    for (const m of previous.added || [])
                        deleteAddedMembership.run(
                            previous.id,
                            m.folderId,
                            m.stamp
                        )
                    for (const m of previous.removed || [])
                        if (folderExists.get(m.folderId))
                            restoreMembership.run(
                                m.folderId,
                                previous.id,
                                randomUUID()
                            )
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
