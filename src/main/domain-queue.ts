import type { QueueSummary, QueueTask } from "../personal-types"

export class RequestError extends Error {
    retryMs: number
    constructor(public status: number, retryAfter?: string) {
        super(`HTTP ${status}`)
        const seconds = Number(retryAfter)
        const delay = retryAfter
            ? Number.isFinite(seconds)
                ? seconds * 1000
                : Date.parse(retryAfter) - Date.now()
            : 60000
        this.retryMs = Math.min(
            900000,
            Math.max(1000, Number.isFinite(delay) ? delay : 60000)
        )
    }
}

export function httpURL(value: string): URL {
    const url = new URL(value)
    if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
    )
        throw new Error("仅支持不含账号密码的 HTTP / HTTPS 网址。")
    return url
}

export function normalizeSiteHost(input: string): string {
    const trimmed = String(input || "").trim()
    if (!trimmed) throw new Error("请填写网站域名或网址。")
    const url = httpURL(
        trimmed.includes("://") ? trimmed : "https://" + trimmed
    )
    return url.hostname.toLowerCase()
}

const MAX_HOST_CACHE = 500
const MAX_SNAPSHOT_TASKS = 100

function pruneHostMap(map: Map<string, number>) {
    if (map.size <= MAX_HOST_CACHE) return
    const now = Date.now()
    for (const [host, ts] of map) {
        if (now - ts > 3600000) map.delete(host)
    }
    while (map.size > MAX_HOST_CACHE) {
        map.delete(map.keys().next().value)
    }
}

/** Every background page visit enters this scheduler, including rendered visits. */
export class DomainQueue {
    private nextId = 0
    private active = 0
    private failedTotal = 0
    private activeHosts = new Set<string>()
    private lastFinished = new Map<string, number>()
    private backoffUntil = new Map<string, number>()
    private pending: { task: QueueTask; run: () => Promise<void> }[] = []
    private finished: QueueTask[] = []
    private runningTasks = new Map<number, QueueTask>()
    private timer: ReturnType<typeof setTimeout>

    constructor(
        private config: () => { domainInterval: number; concurrency: number }
    ) {}

    summary(): QueueSummary {
        return {
            waiting: this.pending.length,
            running: this.runningTasks.size,
            failed: this.failedTotal,
        }
    }

    snapshot(): QueueTask[] {
        const active = [
            ...this.runningTasks.values(),
            ...this.pending.slice(0, MAX_SNAPSHOT_TASKS).map(p => p.task),
        ]
        const remaining = Math.max(0, MAX_SNAPSHOT_TASKS - active.length)
        const recent = remaining ? this.finished.slice(-remaining) : []
        return [...recent, ...active]
            .slice(-MAX_SNAPSHOT_TASKS)
            .map(task => ({ ...task }))
    }

    add<T>(address: string, label: string, work: () => Promise<T>): Promise<T> {
        const host = httpURL(address).hostname.toLowerCase()
        const task: QueueTask = {
            id: ++this.nextId,
            label,
            host,
            state: "waiting",
        }
        return new Promise((resolve, reject) => {
            const finishTask = () => {
                this.active--
                this.activeHosts.delete(host)
                this.runningTasks.delete(task.id)
                pruneHostMap(this.lastFinished)
                this.lastFinished.set(host, Date.now())
                this.finished.push(task)
                if (this.finished.length > MAX_SNAPSHOT_TASKS) {
                    this.finished.splice(
                        0,
                        this.finished.length - MAX_SNAPSHOT_TASKS
                    )
                }
                this.pump()
            }

            this.pending.push({
                task,
                run: async () => {
                    try {
                        const value = await work()
                        task.state = "done"
                        finishTask()
                        resolve(value)
                    } catch (error) {
                        if (
                            error instanceof RequestError &&
                            error.status === 429
                        ) {
                            pruneHostMap(this.backoffUntil)
                            this.backoffUntil.set(
                                host,
                                Date.now() + error.retryMs
                            )
                        }
                        this.failedTotal++
                        task.state = "failed"
                        task.error = String(error).slice(0, 500)
                        finishTask()
                        reject(error)
                    }
                },
            })
            this.pump()
        })
    }

    private pump() {
        clearTimeout(this.timer)
        const config = this.config()
        const interval = Math.max(0, config.domainInterval) * 1000
        const concurrency = Math.max(1, Math.min(8, config.concurrency))
        let delay = Infinity
        while (this.active < concurrency) {
            const now = Date.now()
            const index = this.pending.findIndex(({ task }) => {
                if (this.activeHosts.has(task.host)) return false
                const wait =
                    Math.max(
                        (this.lastFinished.get(task.host) || 0) + interval,
                        this.backoffUntil.get(task.host) || 0
                    ) - now
                if (wait > 0) {
                    delay = Math.min(delay, wait)
                    return false
                }
                return true
            })
            if (index < 0) break
            const { task, run } = this.pending.splice(index, 1)[0]
            this.active++
            this.activeHosts.add(task.host)
            task.state = "running"
            this.runningTasks.set(task.id, task)
            void run()
        }
        if (Number.isFinite(delay))
            this.timer = setTimeout(() => this.pump(), Math.max(1, delay))
    }
}
