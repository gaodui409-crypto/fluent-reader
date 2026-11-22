import type Database from "better-sqlite3"
import type { Briefing, BriefingTopic } from "../personal-types"
import { AIClient, stripCodeFenceJSON, sumTokens } from "./ai-client"

interface BriefingCandidateRow {
    _id: number
    title: string
    link: string
    snippet: string
}

function parseAndValidateBriefingBatch(
    text: string,
    batch: BriefingCandidateRow[]
): BriefingTopic[] {
    const parsed = stripCodeFenceJSON(text) as {
        topics: { topic: string; entries: { id: number; summary: string }[] }[]
    }
    if (!Array.isArray(parsed?.topics))
        throw new Error("AI 返回的简报格式无法识别，请重试或更换模型。")
    const batchById = new Map(batch.map(row => [row._id, row]))
    const seen = new Set<number>()
    const topics: BriefingTopic[] = []
    for (const topic of parsed.topics) {
        if (
            typeof topic?.topic !== "string" ||
            !topic.topic.trim() ||
            !Array.isArray(topic.entries)
        )
            throw new Error("AI 返回的简报主题结构无效，请重试。")
        const name = topic.topic.trim().slice(0, 120)
        const entries: BriefingTopic["entries"] = []
        for (const entry of topic.entries) {
            const row = entry ? batchById.get(entry.id) : undefined
            if (!row || typeof entry.summary !== "string" || seen.has(entry.id))
                throw new Error("AI 返回的简报条目不匹配，请重试。")
            seen.add(entry.id)
            entries.push({
                id: row._id,
                title: row.title,
                link: row.link,
                summary: entry.summary.trim().slice(0, 5000),
            })
        }
        if (entries.length) topics.push({ topic: name, entries })
    }
    if (seen.size !== batch.length)
        throw new Error("AI 在汇总简报时漏掉了部分文章，请重试或更换模型。")
    return topics
}

export class AIBriefingService {
    private briefingJob: Promise<Briefing> | null = null
    private scheduleAttempt = 0

    constructor(private db: Database.Database, private client: AIClient) {}

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

    private async makeBrief(): Promise<Briefing> {
        const c = this.client.config()
        if (!c.baseURL || !c.model)
            throw new Error(
                "请先前往「选项 → 自用功能 → AI 设置」填写接口基础地址与模型名。"
            )
        const rows = this.db
            .prepare(
                "SELECT _id,title,link,snippet FROM items WHERE hasRead=0 AND hidden=0 AND date>=? ORDER BY date DESC"
            )
            .all(Date.now() - 86400000) as BriefingCandidateRow[]
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
                `Group the articles by topic and summarize each in ${c.targetLanguage}. Include every supplied id exactly once. Return JSON only: {"topics":[{"topic":"topic name","entries":[{"id":123,"summary":"short summary"}]}]}.`,
                JSON.stringify(
                    batch.map(row => ({
                        id: row._id,
                        title: row.title,
                        text: row.snippet.slice(0, 1000),
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
        const now = new Date()
        const day = `${now.getFullYear()}-${
            now.getMonth() + 1
        }-${now.getDate()}`
        if (
            !c.dailyBriefing ||
            !c.baseURL ||
            !c.model ||
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
