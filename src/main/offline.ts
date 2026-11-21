import { app, ipcMain, session, shell, WebContents } from "electron"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type Database from "better-sqlite3"
import type { OfflineTask, PersonalSettings } from "../personal-types"
import type { SourcePreferences } from "../source-preferences"
import { DomainQueue, httpURL } from "./domain-queue"
import { renderedPage, WEB_PARTITION } from "./web-content"

export function safeFilename(
    value: string,
    fallback = "article",
    maximum = 90
) {
    const clean = value
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/[. ]+$/g, "")
        .trim()
    const name = [...(clean || fallback)]
        .slice(0, maximum)
        .join("")
        .replace(/[. ]+$/g, "")
    return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)
        ? "_" + name
        : name
}

export class OfflinePages {
    private pending = new Map<number, Promise<string>>()
    private tasks = new Map<number, OfflineTask>()
    private captures = new Map<
        number,
        {
            bytes: number
            resolve: (value: { html: string; text: string }) => void
            reject: (error: Error) => void
        }
    >()
    constructor(
        private sqlite: Database.Database,
        private queue: DomainQueue,
        private settings: () => PersonalSettings,
        private preferences: (sid: number) => SourcePreferences,
        private updated: () => void
    ) {
        ipcMain.handle("offline:resource", async (event, address: string) => {
            const capture = this.captures.get(event.sender.id)
            if (!capture || event.senderFrame !== event.sender.mainFrame)
                return { error: "Untrusted capture request." }
            try {
                const url = httpURL(String(address))
                const response = await session
                    .fromPartition(WEB_PARTITION)
                    .fetch(url.href, {
                        credentials: "include",
                        signal: AbortSignal.timeout(20000),
                    })
                if (!response.ok)
                    throw new Error(`Resource HTTP ${response.status}`)
                const chunks: Uint8Array[] = []
                let size = 0
                const reader = response.body.getReader()
                for (;;) {
                    const { done, value } = await reader.read()
                    if (done) break
                    size += value.length
                    capture.bytes += value.length
                    if (
                        size > 20 * 1024 * 1024 ||
                        capture.bytes > 150 * 1024 * 1024
                    ) {
                        await reader.cancel()
                        throw new Error("Offline page resource limit exceeded.")
                    }
                    chunks.push(value)
                }
                return {
                    bytes: Buffer.concat(chunks),
                    status: 200,
                    headers: {
                        "content-type":
                            response.headers.get("content-type") ||
                            "application/octet-stream",
                    },
                }
            } catch (error) {
                return { error: String(error) }
            }
        })
        ipcMain.on("offline:captured", (event, result) => {
            const capture = this.captures.get(event.sender.id)
            if (!capture || event.senderFrame !== event.sender.mainFrame) return
            if (result?.error) capture.reject(new Error(String(result.error)))
            else if (
                typeof result?.html !== "string" ||
                result.html.length > 200 * 1024 * 1024 ||
                typeof result.text !== "string"
            )
                capture.reject(new Error("Invalid saved page."))
            else capture.resolve(result)
        })
    }
    snapshot() {
        return [...this.tasks.values()].map(task => ({ ...task })).slice(-100)
    }
    savedIds(): number[] {
        return (
            this.sqlite
                .prepare(
                    "SELECT itemId FROM article_content WHERE offlinePath<>''"
                )
                .all() as { itemId: number }[]
        ).map(row => row.itemId)
    }
    private async capture(contents: WebContents) {
        return new Promise<{ html: string; text: string }>(
            (resolve, reject) => {
                const timeout = setTimeout(
                    () => fail(new Error("Offline capture timed out.")),
                    90000
                )
                const cleanup = () => {
                    clearTimeout(timeout)
                    this.captures.delete(contents.id)
                    contents.removeListener("destroyed", destroyed)
                }
                const fail = (error: Error) => {
                    cleanup()
                    reject(error)
                }
                const destroyed = () =>
                    fail(new Error("The capture window closed."))
                this.captures.set(contents.id, {
                    bytes: 0,
                    resolve: value => {
                        cleanup()
                        resolve(value)
                    },
                    reject: fail,
                })
                contents.once("destroyed", destroyed)
                contents.send("offline:capture")
            }
        )
    }
    async save(id: number): Promise<string> {
        if (!Number.isSafeInteger(id)) throw new Error("Invalid article.")
        if (this.pending.has(id)) return this.pending.get(id)
        const item = this.sqlite
            .prepare(
                "SELECT i.title,i.link,i.source,i.date,s.name FROM items i JOIN sources s ON s.sid=i.source WHERE i._id=?"
            )
            .get(id) as {
            title: string
            link: string
            source: number
            date: number
            name: string
        }
        if (!item) throw new Error("The article no longer exists.")
        if (!this.preferences(item.source).offlineEnabled)
            throw new Error("Offline saving is disabled for this source.")
        const task: OfflineTask = { id, title: item.title, state: "waiting" }
        this.tasks.set(id, task)
        const work = this.queue
            .add(item.link, "offlineSave", async () => {
                task.state = "running"
                const preload = path.join(
                    app.getAppPath(),
                    app.isPackaged ? "dist" : "",
                    "offline-preload.js"
                )
                const page = await renderedPage(
                    item.link,
                    win => this.capture(win.webContents),
                    preload,
                    120000
                )
                const root =
                    this.settings().offlineFolder ||
                    path.join(app.getPath("userData"), "offline")
                const date = new Date(item.date)
                const day = Number.isFinite(date.getTime())
                    ? date.toISOString().slice(0, 10)
                    : new Date().toISOString().slice(0, 10)
                const folder = path.join(
                    root,
                    safeFilename(item.name, "feed", 60),
                    day
                )
                await fs.mkdir(folder, { recursive: true })
                const title = safeFilename(item.title)
                let output: string
                for (let suffix = 0; suffix < 10000; suffix++) {
                    output = path.join(
                        folder,
                        title + (suffix ? ` (${suffix})` : "") + ".html"
                    )
                    try {
                        await fs.writeFile(output, page.html, { flag: "wx" })
                        break
                    } catch (error) {
                        if (
                            (error as NodeJS.ErrnoException).code !==
                                "EEXIST" ||
                            suffix === 9999
                        )
                            throw error
                    }
                }
                this.sqlite.transaction(() => {
                    this.sqlite
                        .prepare(
                            "INSERT INTO article_content(itemId,offlinePath,offlineText) VALUES(?,?,?) ON CONFLICT(itemId) DO UPDATE SET offlinePath=excluded.offlinePath,offlineText=excluded.offlineText"
                        )
                        .run(id, output, page.text.slice(0, 8 * 1024 * 1024))
                    this.sqlite
                        .prepare("UPDATE items SET saveRequested=0 WHERE _id=?")
                        .run(id)
                })()
                task.state = "done"
                task.path = output
                this.updated()
                return output
            })
            .catch(error => {
                task.state = "failed"
                task.error = String(error)
                this.updated()
                throw error
            })
        this.pending.set(id, work)
        try {
            return await work
        } finally {
            this.pending.delete(id)
        }
    }
    async open(id: number, reveal = false) {
        if (!Number.isSafeInteger(id)) throw new Error("Invalid article.")
        const row = this.sqlite
            .prepare("SELECT offlinePath FROM article_content WHERE itemId=?")
            .get(id) as { offlinePath: string }
        if (
            !row?.offlinePath ||
            path.extname(row.offlinePath).toLowerCase() !== ".html"
        )
            throw new Error("No local copy is available.")
        await fs.access(row.offlinePath)
        if (reveal) shell.showItemInFolder(row.offlinePath)
        else {
            const error = await shell.openPath(row.offlinePath)
            if (error) throw new Error(error)
        }
        return true
    }
}
