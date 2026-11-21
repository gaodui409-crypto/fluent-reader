import { app, dialog } from "electron"
import type Database from "better-sqlite3"
import SQLite from "better-sqlite3"
import type Store from "electron-store"
import AdmZip from "adm-zip"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { SchemaTypes } from "../schema-types"
import { sha256, validateOfflineEntries, OfflineBackupEntry } from "./restore"
import { safeFilename } from "./offline"
import { readServiceConfig } from "./service-secrets"
import type { PersonalSettings } from "../personal-types"

const escapeXML = (s: string) =>
    s.replace(
        /[<>&"']/g,
        c =>
            ({
                "<": "&lt;",
                ">": "&gt;",
                "&": "&amp;",
                '"': "&quot;",
                "'": "&apos;",
            }[c])
    )

export class Backups {
    running = false
    error = ""
    constructor(
        private sqlite: Database.Database,
        private store: Store<SchemaTypes>,
        private settings: () => PersonalSettings
    ) {}

    async create(): Promise<string> {
        if (this.running) throw new Error("A backup is already running.")
        const options = this.settings()
        if (!options.backupFolder)
            throw new Error("Choose a backup folder first.")
        this.running = true
        this.error = ""
        let temporary = ""
        try {
            // Encrypt legacy service credentials before taking the settings snapshot.
            readServiceConfig(this.store)
            await fs.mkdir(options.backupFolder, { recursive: true })
            temporary = await fs.mkdtemp(
                path.join(app.getPath("temp"), "fluent-backup-")
            )
            const dbPath = path.join(temporary, "fluent-reader.db")
            // SQLite's online backup handles concurrent writes and WAL correctly.
            await this.sqlite.backup(dbPath)
            const dbBytes = await fs.readFile(dbPath)
            const snapshot = new SQLite(dbPath, { readonly: true })
            let rows: { url: string; name: string }[]
            let saved: {
                itemId: number
                offlinePath: string
                title: string
                name: string
                date: number
            }[]
            try {
                rows = snapshot
                    .prepare("SELECT url,name FROM sources ORDER BY sid")
                    .all() as typeof rows
                saved = snapshot
                    .prepare(
                        "SELECT c.itemId,c.offlinePath,i.title,i.date,s.name FROM article_content c JOIN items i ON i._id=c.itemId JOIN sources s ON s.sid=i.source WHERE c.offlinePath<>''"
                    )
                    .all() as typeof saved
            } finally {
                snapshot.close()
            }
            const settings = Buffer.from(
                JSON.stringify(this.store.store, null, 2)
            )
            const opml = `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Fluent Reader</title></head><body>${rows
                .map(
                    row =>
                        `<outline type="rss" text="${escapeXML(
                            row.name
                        )}" xmlUrl="${escapeXML(row.url)}"/>`
                )
                .join("")}</body></opml>`
            const zip = new AdmZip()
            zip.addFile("fluent-reader.db", dbBytes)
            zip.addFile("config.json", settings)
            zip.addFile("subscriptions.opml", Buffer.from(opml))
            const offline: OfflineBackupEntry[] = []
            const hashes: Record<string, string> = {
                "fluent-reader.db": sha256(dbBytes),
                "config.json": sha256(settings),
            }
            for (const row of saved) {
                let bytes: Buffer
                try {
                    bytes = await fs.readFile(row.offlinePath)
                } catch {
                    throw new Error(
                        `Cannot back up the saved page: ${row.offlinePath}`
                    )
                }
                const entry = `offline/${row.itemId}.html`
                const date = new Date(row.date)
                const folder = Number.isFinite(date.getTime())
                    ? date.toISOString().slice(0, 10)
                    : "undated"
                const relative = [
                    safeFilename(row.name, "source", 60),
                    folder,
                    `${safeFilename(row.title)}-${row.itemId}.html`,
                ]
                offline.push({ itemId: row.itemId, entry, relative })
                zip.addFile(entry, bytes)
                hashes[entry] = sha256(bytes)
            }
            zip.addFile(
                "manifest.json",
                Buffer.from(
                    JSON.stringify({
                        format: "fluent-personal",
                        version: 2,
                        created: new Date().toISOString(),
                        hashes,
                        offline,
                    })
                )
            )
            const filename = `FluentReader-${new Date()
                .toISOString()
                .replace(/[:.]/g, "-")}.zip`
            const output = path.join(options.backupFolder, filename)
            await zip.writeZipPromise(output + ".tmp")
            await fs.rename(output + ".tmp", output)
            this.store.set("personal", {
                ...this.settings(),
                lastBackup: Date.now(),
            })
            const previous = (await fs.readdir(options.backupFolder))
                .filter(name =>
                    /^FluentReader-\d{4}-\d{2}-\d{2}T[\dTZ-]+\.zip$/.test(name)
                )
                .sort()
                .reverse()
            for (const name of previous.slice(Math.max(1, options.backupKeep)))
                await fs.unlink(path.join(options.backupFolder, name))
            return output
        } catch (error) {
            this.error = String(error)
            throw error
        } finally {
            this.running = false
            if (temporary)
                await fs
                    .rm(temporary, { recursive: true, force: true })
                    .catch(() => {})
        }
    }

    async restore(): Promise<boolean> {
        const zh = this.store.get("locale", "").startsWith("zh")
        const selected = await dialog.showOpenDialog({
            filters: [{ name: "Fluent Reader ZIP", extensions: ["zip"] }],
            properties: ["openFile"],
        })
        if (selected.canceled) return false
        const zip = new AdmZip(selected.filePaths[0])
        for (const name of [
            "manifest.json",
            "config.json",
            "fluent-reader.db",
        ]) {
            const entry = zip.getEntry(name)
            if (!entry || entry.header.size > 2 * 1024 * 1024 * 1024)
                throw new Error("Invalid backup: " + name)
        }
        const manifest = JSON.parse(zip.readAsText("manifest.json"))
        if (
            manifest.format !== "fluent-personal" ||
            ![1, 2].includes(manifest.version)
        )
            throw new Error("Unsupported backup format.")
        const offline = validateOfflineEntries(manifest.offline)
        const configBytes = zip.readFile("config.json")
        const dbBytes = zip.readFile("fluent-reader.db")
        if (
            sha256(configBytes) !== manifest.hashes["config.json"] ||
            sha256(dbBytes) !== manifest.hashes["fluent-reader.db"]
        )
            throw new Error("Backup checksum mismatch.")
        const config = JSON.parse(configBytes.toString("utf8"))
        if (!config || typeof config !== "object" || Array.isArray(config))
            throw new Error("Invalid settings.")
        const pending = path.join(
            path.dirname(this.store.path),
            "pending-restore"
        )
        await fs.mkdir(pending, { recursive: true })
        const candidate = path.join(pending, "fluent-reader.db")
        // A manifest is the commit marker. Never leave one pointing at partial staging.
        await fs.rm(path.join(pending, "manifest.json"), { force: true })
        for (const file of offline) {
            const entry = zip.getEntry(file.entry)
            if (!entry || entry.header.size > 200 * 1024 * 1024)
                throw new Error("Invalid offline page in backup.")
            const bytes = zip.readFile(entry)
            if (sha256(bytes) !== manifest.hashes[file.entry])
                throw new Error("Offline page checksum mismatch.")
            const destination = path.join(pending, file.entry)
            await fs.mkdir(path.dirname(destination), { recursive: true })
            await fs.writeFile(destination, bytes)
        }
        await fs.writeFile(candidate, dbBytes)
        const check = new SQLite(candidate, { readonly: true })
        try {
            if (check.pragma("integrity_check", { simple: true }) !== "ok")
                throw new Error("Backup database integrity check failed.")
            check.prepare("SELECT _id,title,content FROM items LIMIT 1").get()
            check.prepare("SELECT sid,url FROM sources LIMIT 1").get()
        } finally {
            check.close()
        }
        const answer = await dialog.showMessageBox({
            type: "warning",
            message: zh ? "恢复备份并重启？" : "Restore backup and restart?",
            detail: zh
                ? "当前数据库和设置将替换为备份。替换前的数据会保留在 before-restore 文件夹。"
                : "The backup will replace your database and settings. The previous files are kept in before-restore.",
            buttons: zh
                ? ["取消", "恢复并重启"]
                : ["Cancel", "Restore and restart"],
            defaultId: 0,
            cancelId: 0,
        })
        if (answer.response !== 1) return false
        await fs.writeFile(path.join(pending, "config.json"), configBytes)
        await fs.rm(path.join(pending, "started"), { force: true })
        await fs.writeFile(
            path.join(pending, "manifest.json"),
            JSON.stringify(manifest)
        )
        app.relaunch()
        app.exit(0)
        return true
    }

    async scheduled() {
        const settings = this.settings()
        const interval =
            settings.backupSchedule === "daily" ? 86400000 : 7 * 86400000
        if (
            !this.running &&
            settings.backupFolder &&
            settings.backupSchedule !== "off" &&
            Date.now() - settings.lastBackup >= interval
        ) {
            await this.create().catch(() => {})
        }
    }
}
