import type Database from "better-sqlite3"
import type { Briefing, BriefingTopic } from "../personal-types"
import { AIClient, stripCodeFenceJSON, sumTokens } from "./ai-client"

export interface BriefingCandidateRow {
    _id: number
    source?: number
    title: string
    link: string
    snippet?: string
    excerpt?: string
}

function cleanOneLineSnippet(row: BriefingCandidateRow): string {
    const raw = (row.excerpt || row.snippet || row.title || "")
        .replace(/\s+/g, " ")
        .trim()
    return raw.slice(0, 200) || row.title
}

export function parseAndValidateBriefingBatch(
    text: string,
    batch: BriefingCandidateRow[]
): BriefingTopic[] {
    const parsed = stripCodeFenceJSON(text) as {
        topics: {
            topic: string
            entries: { id: number | string; summary: string }[]
        }[]
    }
    if (!Array.isArray(parsed?.topics))
        throw new Error("AI 返回的简报格式无法识别，请重试或更换模型。")
    const batchById = new Map(batch.map(row => [row._id, row]))
    const seen = new Set<number>()
    const topics: BriefingTopic[] = []
    for (const topic of parsed.topics) {
        if (
            !topic ||
            typeof topic.topic !== "string" ||
            !topic.topic.trim() ||
            !Array.isArray(topic.entries)
        ) {
            continue
        }
        const name = topic.topic.trim().slice(0, 120)
        const entries: BriefingTopic["entries"] = []
        for (const entry of topic.entries) {
            const id =
                typeof entry?.id === "number" ? entry.id : Number(entry?.id)
            const row = Number.isSafeInteger(id) ? batchById.get(id) : undefined
            if (!row || seen.has(row._id)) continue
            const summary =
                typeof entry?.summary === "string" && entry.summary.trim()
                    ? entry.summary.trim().slice(0, 5000)
                    : cleanOneLineSnippet(row)
            seen.add(row._id)
            entries.push({
                id: row._id,
                title: row.title,
                link: row.link,
                summary,
            })
        }
        if (entries.length) topics.push({ topic: name, entries })
    }
    if (seen.size === 0) {
        throw new Error("Briefing contained no valid unread articles.")
    }
    const omitted = batch.filter(row => !seen.has(row._id))
    if (omitted.length > 0) {
        const fallbackEntries = omitted.map(row => ({
            id: row._id,
            title: row.title,
            link: row.link,
            summary: cleanOneLineSnippet(row),
        }))
        const existingFallback = topics.find(t => t.topic === "其他未读动态")
        if (existingFallback) {
            existingFallback.entries.push(...fallbackEntries)
        } else {
            topics.push({
                topic: "其他未读动态",
                entries: fallbackEntries,
            })
        }
    }
    return topics
}

export class AIBriefingService {
    private briefingJob: Promise<Briefing> | null = null
    private scheduleAttempt = 0

    constructor(
        private db: Database.Database,
        private client: AIClient,
        private preferences: (sid: number) => { aiEnabled?: boolean } = () => ({
            aiEnabled: true,
        })
    ) {}

    briefings(): Briefing[] {
        const rows = this.db
            .prepare("SELECT * FROM briefings ORDER BY id DESC LIMIT 365")
            .all() as {
            id: number
            createdAt: number
            content: string
            tokens: number | null
        }[]
        const result: Briefing[] = []
        for (const row of rows) {
            try {
                const topics = JSON.parse(row.content)
                if (Array.isArray(topics)) {
                    result.push({
                        id: row.id,
                        createdAt: row.createdAt,
                        topics,
                        tokens: row.tokens,
                    })
                }
            } catch {
                // Skip corrupted historical row without breaking remaining briefings.
            }
        }
        return result
    }

    deleteBriefing(id: number): boolean {
        if (!Number.isSafeInteger(id)) throw new Error("无效的简报编号。")
        this.db.prepare("DELETE FROM briefings WHERE id=?").run(id)
        return true
    }

    brief(): Promise<Briefing> {
        if (this.briefingJob) return this.briefingJob
        this.briefingJob = this.makeBrief()
            .catch(error => {
                this.client.recordError(error)
                throw error
            })
            .finally(() => {
                this.briefingJob = null
            })
        return this.briefingJob
    }

    private isSourceEnabled(sid: number): boolean {
        try {
            return this.preferences(sid)?.aiEnabled !== false
        } catch {
            return true
        }
    }

    private async makeBrief(): Promise<Briefing> {
        const c = this.client.config()
        const model = this.client.resolveModel(c, "briefing")
        if (!c.baseURL || !model)
            throw new Error(
                "请先前往「选项 → 自用功能 → AI 设置」填写接口基础地址与模型名。"
            )
        const since = Date.now() - 86400000
        const distinctSources = (
            this.db
                .prepare(
                    "SELECT DISTINCT source FROM items WHERE hasRead=0 AND hidden=0 AND date>=?"
                )
                .all(since) as { source: number }[]
        ).map(r => r.source)
        const allowedSources = distinctSources.filter(sid =>
            this.isSourceEnabled(sid)
        )
        const rows = allowedSources.length
            ? (this.db
                  .prepare(
                      "SELECT _id,source,title,link,snippet FROM items WHERE hasRead=0 AND hidden=0 AND date>=? AND source IN (SELECT value FROM json_each(?)) ORDER BY date DESC LIMIT 120"
                  )
                  .all(
                      since,
                      JSON.stringify(allowedSources)
                  ) as BriefingCandidateRow[])
            : []
        if (!rows.length)
            throw new Error("过去 24 小时内没有未读文章可供生成简报。")
        const topics = new Map<string, BriefingTopic>()
        const tokens: (number | null)[] = []
        for (let offset = 0; offset < rows.length; offset += 20) {
            const batch = rows.slice(offset, offset + 20)
            let batchTopics: BriefingTopic[] | null = null
            const result = await this.client.cached(
                c,
                null,
                "briefing",
                `Group the articles by topic and summarize each in ${c.targetLanguage}. Include every supplied id once. Return JSON only: {"topics":[{"topic":"topic name","entries":[{"id":123,"summary":"short summary"}]}]}.`,
                JSON.stringify(
                    batch.map(row => ({
                        id: row._id,
                        title: row.title,
                        text: (row.snippet || "").slice(0, 1000),
                    }))
                ),
                text => {
                    batchTopics = parseAndValidateBriefingBatch(text, batch)
                }
            )
            tokens.push(result.tokens)
            const resolvedTopics =
                batchTopics || parseAndValidateBriefingBatch(result.text, batch)
            for (const itemTopic of resolvedTopics) {
                const group = topics.get(itemTopic.topic) || {
                    topic: itemTopic.topic,
                    entries: [],
                }
                group.entries.push(...itemTopic.entries)
                topics.set(itemTopic.topic, group)
            }
        }
        const createdAt = Date.now()
        const usage = sumTokens(tokens)
        const topicList = [...topics.values()]
        const content = JSON.stringify(topicList)
        const inserted = this.db
            .prepare(
                "INSERT INTO briefings(createdAt,content,tokens) VALUES(?,?,?)"
            )
            .run(createdAt, content, usage)
        this.client.clearError()
        return {
            id: Number(inserted.lastInsertRowid),
            createdAt,
            topics: topicList,
            tokens: usage,
        }
    }

    async scheduled() {
        const c = this.client.config()
        const model = this.client.resolveModel(c, "briefing")
        const now = new Date()
        const day = `${now.getFullYear()}-${
            now.getMonth() + 1
        }-${now.getDate()}`
        if (
            !c.dailyBriefing ||
            !c.baseURL ||
            !model ||
            now.getHours() < c.briefingHour ||
            c.lastBriefingDay === day ||
            Date.now() - this.scheduleAttempt < 3600000
        )
            return
        this.scheduleAttempt = Date.now()
        try {
            await this.brief()
            this.client.setLastBriefingDay(day)
        } catch (error) {
            this.client.recordError(error)
        }
    }
}
