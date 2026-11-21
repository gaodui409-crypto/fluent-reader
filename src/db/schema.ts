import { desc, sql } from "drizzle-orm"
import {
    index,
    integer,
    sqliteTable,
    text,
    primaryKey,
    AnySQLiteColumn,
} from "drizzle-orm/sqlite-core"

export const articleFoldersTable = sqliteTable("article_folders", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parentId").references(
        (): AnySQLiteColumn => articleFoldersTable.id
    ),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    legacyName: text("legacyName").unique(),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
})

export const folderArticlesTable = sqliteTable(
    "folder_articles",
    {
        folderId: integer("folderId")
            .notNull()
            .references(() => articleFoldersTable.id),
        itemId: integer("itemId")
            .notNull()
            .references(() => itemsTable._id, { onDelete: "cascade" }),
        stamp: text("stamp").notNull(),
    },
    table => [
        primaryKey({ columns: [table.folderId, table.itemId] }),
        index("folder_articles_item").on(table.itemId),
    ]
)

export const articleNotesTable = sqliteTable("article_notes", {
    itemId: integer("itemId")
        .primaryKey()
        .references(() => itemsTable._id, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    version: integer("version").notNull().default(0),
    updatedAt: integer("updatedAt").notNull().default(0),
})

export const archiveRulesTable = sqliteTable("archive_rules", {
    id: text("id").primaryKey(),
    spec: text("spec").notNull(),
})

export const archiveBatchesTable = sqliteTable("archive_batches", {
    id: text("id").primaryKey(),
    payload: text("payload").notNull(),
    createdAt: integer("createdAt").notNull(),
    undone: integer("undone", { mode: "boolean" }).notNull().default(false),
})

export const sourceHealthTable = sqliteTable("source_health", {
    sid: integer("sid")
        .primaryKey()
        .references(() => sourcesTable.sid, { onDelete: "cascade" }),
    failures: integer("failures").notNull().default(0),
    lastError: text("lastError").notNull().default(""),
    checkedAt: integer("checkedAt").notNull().default(0),
    redirect: text("redirect").notNull().default(""),
})

export const articleActivityTable = sqliteTable("article_activity", {
    itemId: integer("itemId")
        .primaryKey()
        .references(() => itemsTable._id, { onDelete: "cascade" }),
    openedAt: integer("openedAt").notNull(),
})

export const aiCacheTable = sqliteTable("ai_cache", {
    key: text("key").primaryKey(),
    itemId: integer("itemId").references(() => itemsTable._id, {
        onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    result: text("result").notNull(),
    createdAt: integer("createdAt").notNull(),
    tokens: integer("tokens"),
})

export const aiUsageTable = sqliteTable("ai_usage", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: integer("createdAt").notNull(),
    kind: text("kind").notNull(),
    model: text("model").notNull(),
    input: integer("input"),
    output: integer("output"),
})

export const briefingsTable = sqliteTable("briefings", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: integer("createdAt").notNull(),
    content: text("content").notNull(),
    tokens: integer("tokens"),
})

export const sourcesTable = sqliteTable("sources", {
    sid: integer("sid").primaryKey(),
    url: text("url").notNull().unique(),
    iconurl: text("iconurl"),
    name: text("name").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    openTarget: integer("openTarget").notNull().default(0),
    lastFetched: integer("lastFetched", { mode: "timestamp_ms" }).notNull(),
    serviceRef: text("serviceRef"),
    fetchFrequency: integer("fetchFrequency").notNull().default(0),
    textDir: integer("textDir").notNull().default(0),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
})

// FTS5 virtual table `article_fts` and its triggers are maintained in the custom
// Drizzle migration. Virtual tables are not modeled by Drizzle's schema builder.
export const articleContentTable = sqliteTable("article_content", {
    itemId: integer("itemId")
        .primaryKey()
        .references(() => itemsTable._id, { onDelete: "cascade" }),
    fullHtml: text("fullHtml").notNull().default(""),
    fullText: text("fullText").notNull().default(""),
    fullFetchedAt: integer("fullFetchedAt").notNull().default(0),
    offlinePath: text("offlinePath").notNull().default(""),
    offlineText: text("offlineText").notNull().default(""),
})

export const itemsTable = sqliteTable(
    "items",
    {
        _id: integer("_id").primaryKey({ autoIncrement: true }),
        source: integer("source").notNull(),
        guid: text("guid"),
        title: text("title").notNull(),
        link: text("link").notNull(),
        date: integer("date", { mode: "timestamp_ms" }).notNull(),
        fetchedDate: integer("fetchedDate", { mode: "timestamp_ms" }).notNull(),
        thumb: text("thumb"),
        content: text("content").notNull(),
        snippet: text("snippet").notNull(),
        creator: text("creator"),
        hasRead: integer("hasRead", { mode: "boolean" })
            .notNull()
            .default(false),
        starred: integer("starred", { mode: "boolean" })
            .notNull()
            .default(false),
        hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
        feedHidden: integer("feedHidden", { mode: "boolean" })
            .notNull()
            .default(false),
        kept: integer("kept", { mode: "boolean" }).notNull().default(false),
        notify: integer("notify", { mode: "boolean" }).notNull().default(false),
        serviceRef: text("serviceRef"),
        readLater: integer("readLater", { mode: "boolean" })
            .notNull()
            .default(false),
        highlight: text("highlight").notNull().default(""),
        tags: text("tags", { mode: "json" })
            .$type<string[]>()
            .notNull()
            .default(sql`'[]'`),
        saveRequested: integer("saveRequested", { mode: "boolean" })
            .notNull()
            .default(false),
    },
    table => [
        index("items_source_date").on(
            table.source,
            desc(table.date),
            desc(table._id)
        ),
        index("items_date").on(desc(table.date), desc(table._id)),
        index("items_source_guid")
            .on(table.source, table.guid)
            .where(sql`${table.guid} IS NOT NULL`),
        index("items_local_identity")
            .on(table.source, table.title, table.link, table.date)
            .where(sql`${table.serviceRef} IS NULL`),
        index("items_service_state")
            .on(table.serviceRef, table.hasRead, table.starred)
            .where(sql`${table.serviceRef} IS NOT NULL`),
        index("items_unread_date")
            .on(table.hasRead, desc(table.date), desc(table._id), table.source)
            .where(sql`${table.hasRead} = 0`),
        index("items_starred_date")
            .on(table.starred, desc(table.date), desc(table._id))
            .where(sql`${table.starred} = 1`),
    ]
)
