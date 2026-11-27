import { app, ipcMain, session, shell, WebContents } from "electron"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type Database from "better-sqlite3"
import type { OfflineTask, PersonalSettings } from "../personal-types"
import type { SourcePreferences } from "../source-preferences"
import { DomainQueue, httpURL } from "./domain-queue"
import {
    assertAllowedCrossTarget,
    fetchWithSafeRedirects,
    shouldIncludeCredentials,
} from "./net-guard"
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

const MAX_RETAINED_TASKS = 150

export class OfflinePages {
    private pending = new Map<number, Promise<string>>()
    private tasks = new Map<number, OfflineTask>()
    private cancelledSeq = new Map<number, number>()
    private captures = new Map<
        number,
        {
            pageUrl: string
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
        ipcMain.removeHandler?.("offline:resource")
        ipcMain.handle("offline:resource", async (event, address: string) => {
            const capture = this.captures.get(event.sender.id)
            if (!capture || event.senderFrame !== event.sender.mainFrame)
                return { error: "Untrusted capture request." }
            try {
                const targetUrl = httpURL(String(address))
                const contextHref =
                    (typeof event.sender.getURL === "function" &&
                        event.sender.getURL()) ||
                    capture.pageUrl
                const contextUrl = httpURL(contextHref)
                assertAllowedCrossTarget(contextUrl, targetUrl)
                const includeCreds = shouldIncludeCredentials(
                    contextUrl,
                    targetUrl
                )
                const webSession = session.fromPartition(WEB_PARTITION)
                const { response } = await fetchWithSafeRedirects(
                    (url, init) => webSession.fetch(url, init),
                    targetUrl.href,
                    {
                        credentials: includeCreds ? "include" : "omit",
                        timeoutMs: 20000,
                        maxRedirects: 5,
                    }
                )
                if (!response.ok)
                    throw new Error(`Resource HTTP ${response.status}`)
                const contentType =
                    response.headers.get("content-type") ||
                    "application/octet-stream"
                if (!response.body) {
                    return {
                        bytes: Buffer.alloc(0),
                        status: response.status,
                        headers: { "content-type": contentType },
                    }
                }
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
                        throw new Error(
                            "网页内图片或媒体体积过大（超出离线打包上限），建议在浏览器中打开。"
                        )
                    }
                    chunks.push(value)
                }
                return {
                    bytes: Buffer.concat(chunks),
                    status: 200,
                    headers: { "content-type": contentType },
                }
            } catch (error) {
                return { error: String(error) }
            }
        })
        ipcMain.removeAllListeners?.("offline:captured")
        ipcMain.on("offline:captured", (event, result) => {
            const capture = this.captures.get(event.sender.id)
            if (!capture || event.senderFrame !== event.sender.mainFrame) return
            if (result?.error) capture.reject(new Error(String(result.error)))
            else if (
                typeof result?.html !== "string" ||
                result.html.length > 200 * 1024 * 1024 ||
                typeof result.text !== "string"
            )
                capture.reject(new Error("离线页面内容无效或体积过大。"))
            else capture.resolve(result)
        })
    }

    private pruneTasks() {
        if (this.tasks.size <= MAX_RETAINED_TASKS) return
        for (const [key, task] of this.tasks) {
            if (this.tasks.size <= MAX_RETAINED_TASKS) break
            if (task.state === "done" || task.state === "failed") {
                this.tasks.delete(key)
            }
        }
    }

    snapshot() {
        return [...this.tasks.values()].slice(-100).map(task => ({ ...task }))
    }

    tasksByItem(): Record<number, OfflineTask> {
        const out: Record<number, OfflineTask> = {}
        for (const [id, task] of this.tasks) {
            if (
                task.state === "waiting" ||
                task.state === "running" ||
                task.state === "failed"
            ) {
                out[id] = { ...task }
            }
        }
        return out
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

    clearTasks() {
        this.tasks.clear()
        this.cancelledSeq.clear()
    }

    private async capture(contents: WebContents, pageUrl: string) {
        return new Promise<{ html: string; text: string }>(
            (resolve, reject) => {
                if (contents.isDestroyed()) {
                    reject(new Error("离线保存被中断，请点击重试。"))
                    return
                }
                const timeout = setTimeout(
                    () => fail(new Error("离线网页打包超时（超过 90 秒）。")),
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
                    fail(new Error("离线保存被中断，请点击重试。"))
                this.captures.set(contents.id, {
                    pageUrl,
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
        if (!Number.isSafeInteger(id)) throw new Error("无效的文章。")
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
        if (!item) throw new Error("文章已不存在。")
        if (!this.preferences(item.source).offlineEnabled)
            throw new Error(
                "此订阅源已关闭离线保存，可在「源与分组阅读偏好」中开启。"
            )
        const validUrl = httpURL(item.link).href
        const seq = this.cancelledSeq.get(id) || 0

        const task: OfflineTask = { id, title: item.title, state: "waiting" }
        this.tasks.delete(id)
        this.tasks.set(id, task)
        this.pruneTasks()
        this.updated()

        const work = this.queue
            .add(validUrl, "offlineSave", async () => {
                if ((this.cancelledSeq.get(id) || 0) !== seq) {
                    throw new Error("离线保存已取消。")
                }
                task.state = "running"
                this.updated()
                const preload = path.join(__dirname, "offline-preload.js")
                const page = await renderedPage(
                    validUrl,
                    win => this.capture(win.webContents, validUrl),
                    preload,
                    120000
                )
                if ((this.cancelledSeq.get(id) || 0) !== seq) {
                    throw new Error("离线保存已取消。")
                }
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
                try {
                    this.sqlite.transaction(() => {
                        if ((this.cancelledSeq.get(id) || 0) !== seq) {
                            throw new Error("离线保存已取消。")
                        }
                        if (
                            !this.sqlite
                                .prepare("SELECT 1 FROM items WHERE _id=?")
                                .get(id)
                        ) {
                            throw new Error("文章在离线保存完成前已被删除。")
                        }
                        this.sqlite
                            .prepare(
                                "INSERT INTO article_content(itemId,offlinePath,offlineText) VALUES(?,?,?) ON CONFLICT(itemId) DO UPDATE SET offlinePath=excluded.offlinePath,offlineText=excluded.offlineText"
                            )
                            .run(
                                id,
                                output,
                                page.text.slice(0, 8 * 1024 * 1024)
                            )
                        this.sqlite
                            .prepare(
                                "UPDATE items SET saveRequested=0,kept=1 WHERE _id=?"
                            )
                            .run(id)
                    })()
                } catch (dbErr) {
                    await fs.unlink(output).catch(() => {})
                    throw dbErr
                }
                task.state = "done"
                task.path = output
                this.updated()
                return output
            })
            .catch(error => {
                if ((this.cancelledSeq.get(id) || 0) === seq) {
                    task.state = "failed"
                    task.error = String(error)
                    this.updated()
                }
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
        if (!Number.isSafeInteger(id)) throw new Error("无效的文章。")
        const row = this.sqlite
            .prepare("SELECT offlinePath FROM article_content WHERE itemId=?")
            .get(id) as { offlinePath: string }
        if (
            !row?.offlinePath ||
            path.extname(row.offlinePath).toLowerCase() !== ".html"
        )
            throw new Error(
                "这篇文章尚未保存离线网页，请先点击「保存到本地」。"
            )
        try {
            await fs.access(row.offlinePath)
        } catch {
            throw new Error(
                "本地离线网页文件已被移动或删除，可重新执行「保存到本地」恢复。"
            )
        }
        if (reveal) shell.showItemInFolder(row.offlinePath)
        else {
            const error = await shell.openPath(row.offlinePath)
            if (error) throw new Error(error)
        }
        return true
    }

    async remove(id: number) {
        if (!Number.isSafeInteger(id)) throw new Error("无效的文章。")
        this.cancelledSeq.set(id, (this.cancelledSeq.get(id) || 0) + 1)
        const row = this.sqlite
            .prepare("SELECT offlinePath FROM article_content WHERE itemId=?")
            .get(id) as { offlinePath: string } | undefined
        if (
            row?.offlinePath &&
            path.extname(row.offlinePath).toLowerCase() === ".html"
        ) {
            try {
                await fs.unlink(row.offlinePath)
            } catch (err) {
                if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err
            }
        }
        this.sqlite
            .prepare(
                "UPDATE article_content SET offlinePath='',offlineText='' WHERE itemId=?"
            )
            .run(id)
        this.tasks.delete(id)
        this.updated()
        return true
    }
}
