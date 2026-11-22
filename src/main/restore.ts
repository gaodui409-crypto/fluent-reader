import * as fs from "node:fs"
import * as path from "node:path"
import { createHash } from "node:crypto"
import SQLite from "better-sqlite3"

export interface OfflineBackupEntry {
    itemId: number
    entry: string
    relative: string[]
}
export function validateOfflineEntries(value: unknown): OfflineBackupEntry[] {
    if (value === undefined) return []
    if (!Array.isArray(value) || value.length > 1000000)
        throw new Error("Invalid offline backup list.")
    const seen = new Set<number>()
    for (const row of value) {
        if (
            !row ||
            !Number.isSafeInteger(row.itemId) ||
            row.itemId < 1 ||
            seen.has(row.itemId) ||
            row.entry !== `offline/${row.itemId}.html` ||
            !Array.isArray(row.relative) ||
            row.relative.length !== 3 ||
            row.relative.some(
                (part: unknown) =>
                    typeof part !== "string" ||
                    !part ||
                    part.length > 200 ||
                    /[<>:"/\\|?*\x00-\x1f]/.test(part) ||
                    /[. ]$/.test(part) ||
                    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)
            )
        )
            throw new Error("Unsafe offline backup entry.")
        seen.add(row.itemId)
    }
    return value
}

export function sha256(data: Buffer | string) {
    return createHash("sha256").update(data).digest("hex")
}

/** Runs before electron-store/SQLite open files. The staged archive was verified
 * before relaunch; verify again and keep the previous pair for rollback. */
export function applyPendingRestore(root: string) {
    const pending = path.join(root, "pending-restore")
    const marker = path.join(pending, "manifest.json")
    if (!fs.existsSync(marker)) return
    const started = path.join(pending, "started")
    const retirePending = () => {
        try {
            if (fs.existsSync(marker)) fs.unlinkSync(marker)
            fs.rmSync(pending, { recursive: true, force: true })
        } catch {
            // Non-fatal if OS still releases directory handles.
        }
    }
    let manifest: {
        hashes: Record<string, string>
        offline?: unknown
    }
    let offline: OfflineBackupEntry[]
    const names = ["config.json", "fluent-reader.db"]
    try {
        manifest = JSON.parse(fs.readFileSync(marker, "utf8"))
        offline = validateOfflineEntries(manifest.offline)
        for (const name of names) {
            const bytes = fs.readFileSync(path.join(pending, name))
            if (sha256(bytes) !== manifest.hashes?.[name])
                throw new Error("Restore file verification failed: " + name)
        }
        for (const file of offline) {
            if (
                sha256(fs.readFileSync(path.join(pending, file.entry))) !==
                manifest.hashes?.[file.entry]
            )
                throw new Error("Offline restore verification failed.")
        }
    } catch (verifyErr) {
        if (!fs.existsSync(started)) retirePending()
        throw verifyErr
    }
    const rollback = path.join(root, "before-restore")
    const rollbackNames = [
        ...names,
        "fluent-reader.db-wal",
        "fluent-reader.db-shm",
    ]
    fs.mkdirSync(rollback, { recursive: true })
    if (!fs.existsSync(started)) {
        for (const name of rollbackNames) {
            const dest = path.join(root, name)
            const saved = path.join(rollback, name)
            if (fs.existsSync(dest)) fs.copyFileSync(dest, saved)
            else if (fs.existsSync(saved)) fs.unlinkSync(saved)
        }
        fs.writeFileSync(started, "1")
    }
    const offlineRoot = path.join(root, "offline-restored-" + Date.now())
    try {
        for (const suffix of ["-wal", "-shm"]) {
            const sidecar = path.join(root, "fluent-reader.db" + suffix)
            if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar)
        }
        for (const name of names)
            fs.copyFileSync(path.join(pending, name), path.join(root, name))
        if (offline.length) {
            const db = new SQLite(path.join(root, "fluent-reader.db"))
            try {
                const update = db.prepare(
                    "UPDATE article_content SET offlinePath=? WHERE itemId=?"
                )
                db.transaction(() => {
                    for (const file of offline) {
                        const destination = path.join(
                            offlineRoot,
                            ...file.relative
                        )
                        fs.mkdirSync(path.dirname(destination), {
                            recursive: true,
                        })
                        fs.copyFileSync(
                            path.join(pending, file.entry),
                            destination,
                            fs.constants.COPYFILE_EXCL
                        )
                        if (update.run(destination, file.itemId).changes !== 1)
                            throw new Error(
                                "Offline page has no matching article."
                            )
                    }
                })()
            } finally {
                db.close()
            }
        }
        retirePending()
    } catch (error) {
        try {
            if (fs.existsSync(offlineRoot))
                fs.rmSync(offlineRoot, { recursive: true, force: true })
        } catch {
            // Ignore partial cleanup failure during rollback.
        }
        // Roll back the database together with its WAL, including writes that
        // were durable before restart but not yet checkpointed into the DB file.
        for (const name of rollbackNames) {
            const saved = path.join(rollback, name)
            if (fs.existsSync(saved))
                fs.copyFileSync(saved, path.join(root, name))
            else if (fs.existsSync(path.join(root, name)))
                fs.unlinkSync(path.join(root, name))
        }
        // Retire the failed staged restore after rollback succeeds so subsequent
        // app launches never overwrite new user data with a stale before-restore.
        retirePending()
        throw error
    }
}
