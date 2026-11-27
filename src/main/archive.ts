import type Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import { forumKey } from "../forum"
import type {
    ArchiveAction,
    ArchivePreview,
    ArchiveQuery,
    ArchiveResult,
    ArchiveRow,
    ArchiveRule,
    ArticleFolder,
    ArticleNote,
} from "../archive-types"
import {
    ArchiveMatcher,
    queryArchiveRows,
    validateArchiveQuery,
} from "./archive-matcher"
import { ArchiveFolders } from "./archive-folders"
import { ArchiveNotes } from "./archive-notes"
import { ArchiveBatches, protectedSQL } from "./archive-batches"
import { archiveNeedsBody } from "../archive-types"

export { protectedSQL }

export class ArticleArchive {
    private previews = new Map<string, number[]>()
    private matcher = new ArchiveMatcher()
    private folderStore: ArchiveFolders
    private noteStore: ArchiveNotes
    private batchStore: ArchiveBatches

    constructor(
        private db: Database.Database,
        private groupSources: (gid: number) => number[] = () => [],
        private changed: () => void = () => {}
    ) {
        db.function("forum_key", { deterministic: true }, forumKey)
        this.folderStore = new ArchiveFolders(db, () => this.rules(), changed)
        this.noteStore = new ArchiveNotes(db, changed)
        this.batchStore = new ArchiveBatches(db, this.folderStore, changed)
    }

    close() {
        this.matcher.terminate()
    }

    folders(): ArticleFolder[] {
        return this.folderStore.folders()
    }

    memberships(itemId: number): number[] {
        return this.folderStore.memberships(itemId)
    }

    saveFolder(input: {
        id?: number
        name: string
        parentId?: number | null
        position?: number
    }) {
        return this.folderStore.saveFolder(input)
    }

    deleteFolder(id: number, moveTo: number | null = null) {
        return this.folderStore.deleteFolder(id, moveTo)
    }

    syncLegacyTopics(ids?: number[]) {
        this.folderStore.syncLegacyTopics(ids)
    }

    note(id: number): ArticleNote {
        return this.noteStore.note(id)
    }

    saveNote(id: number, text: string, version: number): ArticleNote {
        return this.noteStore.saveNote(id, text, version)
    }

    private rows(query: ArchiveQuery, ids?: number[]): ArchiveRow[] {
        return queryArchiveRows(this.db, this.groupSources, query, ids)
    }

    async preview(query: ArchiveQuery): Promise<ArchivePreview> {
        validateArchiveQuery(query)
        const rows = await this.matcher.match(query, this.rows(query), true)
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

    applyPreview(
        token: string,
        excluded: number[],
        action: ArchiveAction
    ): ArchiveResult {
        const ids = this.previews.get(token)
        if (!ids) throw new Error("预览结果已过期，请重新预览后再执行。")
        const exclude = new Set(excluded)
        const result = this.batchStore.apply(
            ids.filter(id => !exclude.has(id)),
            action
        )
        this.previews.delete(token)
        return result
    }

    apply(
        ids: number[],
        action: ArchiveAction,
        keepHistory = true
    ): ArchiveResult {
        return this.batchStore.apply(ids, action, keepHistory)
    }

    undo(batchId: string): ArchiveResult {
        return this.batchStore.undo(batchId)
    }

    rules(): ArchiveRule[] {
        const rows = this.db
            .prepare("SELECT id,spec FROM archive_rules ORDER BY rowid")
            .all() as { id: string; spec: string }[]
        const out: ArchiveRule[] = []
        for (const row of rows) {
            try {
                const parsed = JSON.parse(row.spec) as ArchiveRule
                if (parsed && typeof parsed === "object") out.push(parsed)
            } catch {
                // Ignore malformed rule row rather than bricking all archive operations.
            }
        }
        return out
    }

    saveRule(rule: ArchiveRule) {
        validateArchiveQuery(rule.query)
        this.batchStore.validateAction(rule.action)
        if (
            !rule.name?.trim() ||
            rule.name.length > 120 ||
            typeof rule.enabled !== "boolean"
        )
            throw new Error("请填写 1～120 个字符的规则名称。")
        const previous = this.rules().find(r => r.id === rule.id)
        const next: ArchiveRule = {
            ...rule,
            migrationGroup:
                previous &&
                JSON.stringify(previous.query) === JSON.stringify(rule.query)
                    ? previous.migrationGroup
                    : undefined,
            name: rule.name.trim(),
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

    async afterInsert(
        ids: number[]
    ): Promise<{ notifyIds: number[]; offlineIds: number[] }> {
        if (!ids.length) return { notifyIds: [], offlineIds: [] }
        this.syncLegacyTopics(ids)
        const enabledRules = this.rules().filter(r => r.enabled)
        if (!enabledRules.length) {
            this.changed()
            return { notifyIds: [], offlineIds: [] }
        }
        // Fetch inserted rows once (including body if any enabled rule inspects full/body),
        // then filter by source scope in memory per rule instead of running N SQLite queries.
        const needsBody = enabledRules.some(r => archiveNeedsBody(r.query))
        const allInsertedRows = this.rows(
            {
                include: "",
                exclude: "",
                all: false,
                field: needsBody ? "full" : "title",
            },
            ids
        )
        const rowById = new Map(allInsertedRows.map(r => [r.id, r]))
        const itemSourceRows = this.db
            .prepare(
                "SELECT _id,source FROM items WHERE _id IN (SELECT value FROM json_each(?))"
            )
            .all(JSON.stringify(ids)) as { _id: number; source: number }[]
        const sourceById = new Map(itemSourceRows.map(r => [r._id, r.source]))
        const migratedMatches = new Map<string, ArchiveRow[]>()

        for (const rule of enabledRules) {
            try {
                const allowedSids =
                    rule.query.gid !== undefined
                        ? new Set(this.groupSources(rule.query.gid))
                        : rule.query.sids
                        ? new Set(rule.query.sids)
                        : null
                const candidates = allowedSids
                    ? allInsertedRows.filter(r =>
                          allowedSids.has(sourceById.get(r.id))
                      )
                    : allInsertedRows
                if (!candidates.length) continue
                const groupKey =
                    rule.migrationGroup &&
                    rule.migrationGroup + JSON.stringify(rule.query)
                const matches =
                    groupKey && migratedMatches.has(groupKey)
                        ? migratedMatches.get(groupKey)
                        : await this.matcher.match(rule.query, candidates)
                if (groupKey) migratedMatches.set(groupKey, matches)
                if (matches.length) {
                    const matchedIds = matches.map(r => r.id)
                    this.batchStore.apply(matchedIds, rule.action, false)
                    for (const matchedId of matchedIds) {
                        const row = rowById.get(matchedId)
                        if (row) {
                            if (rule.action.kind === "read") row.hasRead = 1
                            else if (rule.action.kind === "unread")
                                row.hasRead = 0
                            if (rule.action.kind === "star") row.starred = 1
                            else if (rule.action.kind === "unstar")
                                row.starred = 0
                            if (rule.action.kind === "folder") row.inFolder = 1
                            else if (rule.action.kind === "remove") {
                                row.inFolder = Number(
                                    Boolean(
                                        this.db
                                            .prepare(
                                                "SELECT 1 FROM folder_articles WHERE itemId=? LIMIT 1"
                                            )
                                            .get(matchedId)
                                    )
                                )
                            }
                            if (rule.action.kind === "hide") row.hidden = 1
                            if (rule.action.kind === "restore") {
                                row.hidden = 0
                                row.feedHidden = 0
                            }
                            if (
                                rule.action.kind === "folder" &&
                                rule.action.feedHidden
                            )
                                row.feedHidden = 1
                        }
                    }
                }
                if (rule.error) {
                    const { error: _cleared, ...cleanRule } = rule
                    this.db
                        .prepare("UPDATE archive_rules SET spec=? WHERE id=?")
                        .run(JSON.stringify(cleanRule), rule.id)
                }
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
        const final = this.db
            .prepare(
                "SELECT _id,notify,saveRequested FROM items WHERE _id IN (SELECT value FROM json_each(?))"
            )
            .all(JSON.stringify(ids)) as {
            _id: number
            notify: number
            saveRequested: number
        }[]
        return {
            notifyIds: final.filter(r => r.notify).map(r => r._id),
            offlineIds: final.filter(r => r.saveRequested).map(r => r._id),
        }
    }

    applyIncoming(
        ids: number[]
    ): Promise<{ notifyIds: number[]; offlineIds: number[] }> {
        return this.afterInsert(ids)
    }

    retireSource(sid: number) {
        return this.batchStore.retireSource(sid)
    }
}
