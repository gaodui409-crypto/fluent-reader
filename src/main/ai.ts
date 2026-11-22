import type Database from "better-sqlite3"
import type Store from "electron-store"
import type { SchemaTypes } from "../schema-types"
import type {
    AIArticleState,
    AIConfig,
    AIKind,
    AIResult,
    AISettings,
    AIUsage,
    Briefing,
} from "../personal-types"
import type { DomainQueue } from "./domain-queue"
import { htmlText } from "./web-content"
import type { SourcePreferences } from "../source-preferences"
import { AIClient, sumTokens } from "./ai-client"
import { AIBriefingService } from "./ai-briefing"

function splitText(text: string, size = 7000): string[] {
    const chars = Array.from(text)
    const chunks: string[] = []
    for (let i = 0; i < chars.length; i += size)
        chunks.push(chars.slice(i, i + size).join(""))
    return chunks.length ? chunks : [""]
}

const titlePrompt = (language: string) =>
    `Translate this title to ${language}. Return only the translated title. If already in the target language, return it unchanged.`
const translationPrompt = (language: string) =>
    `Translate the complete text to ${language}. Preserve paragraphs and all factual details. Return only the translation.`
const summaryChunkPrompt = (language: string) =>
    `Summarize the text in ${language} in 3 to 6 concise points.`

export class AI {
    private client: AIClient
    private briefingService: AIBriefingService

    constructor(
        private db: Database.Database,
        store: Store<SchemaTypes>,
        queue: DomainQueue,
        private preferences: (sid: number) => SourcePreferences,
        changed: () => void
    ) {
        this.client = new AIClient(db, store, queue, changed)
        this.briefingService = new AIBriefingService(db, this.client)
    }

    get error(): string {
        return this.client.error
    }

    settings(): AISettings {
        return this.client.settings()
    }

    save(input: AIConfig, key?: string): AISettings {
        return this.client.save(input, key)
    }

    test(): Promise<AIResult> {
        return this.client.test()
    }

    usage(): AIUsage {
        return this.client.usage()
    }

    briefings(): Briefing[] {
        return this.briefingService.briefings()
    }

    deleteBriefing(id: number): boolean {
        return this.briefingService.deleteBriefing(id)
    }

    brief(): Promise<Briefing> {
        return this.briefingService.brief()
    }

    scheduled(): Promise<void> {
        return this.briefingService.scheduled()
    }

    private article(id: number) {
        if (!Number.isSafeInteger(id)) throw new Error("无效的文章。")
        const row = this.db
            .prepare(
                "SELECT i._id,i.source,i.title,i.link,i.content,c.fullText,c.offlineText FROM items i LEFT JOIN article_content c ON c.itemId=i._id WHERE i._id=?"
            )
            .get(id) as {
            _id: number
            source: number
            title: string
            link: string
            content: string
            fullText: string
            offlineText: string
        }
        if (!row) throw new Error("文章已不存在。")
        return {
            ...row,
            text: row.fullText || row.offlineText || htmlText(row.content),
        }
    }

    articleState(id: number): AIArticleState {
        if (!this.settings().configured) return {}
        let article: ReturnType<AI["article"]>
        try {
            article = this.article(id)
        } catch {
            return {}
        }
        if (!article.text.trim()) return {}
        const c = this.client.config()
        const language = c.targetLanguage
        const chunks = splitText(article.text)
        const state: AIArticleState = {}

        if (chunks.length === 1) {
            const summaryKey = this.client.makeCacheKey(
                c,
                id,
                "summary-part",
                summaryChunkPrompt(language),
                chunks[0]
            )
            const summary = this.client.readCachedOnly(summaryKey)
            if (summary) state.summary = summary
        } else {
            const fullSummaryKey = this.client.makeCacheKey(
                c,
                id,
                "summary-full",
                summaryChunkPrompt(language),
                article.text
            )
            const summary = this.client.readCachedOnly(fullSummaryKey)
            if (summary) state.summary = summary
        }

        const translatedParts = chunks.map(chunk =>
            this.client.readCachedOnly(
                this.client.makeCacheKey(
                    c,
                    id,
                    "translation-part",
                    translationPrompt(language),
                    chunk
                )
            )
        )
        if (translatedParts.every(Boolean)) {
            state.translation = translatedParts.join("\n\n")
            state.original = article.text
        }
        return state
    }

    async generate(id: number, kind: AIKind, force = false): Promise<AIResult> {
        if (!["title", "summary", "translation"].includes(kind))
            throw new Error("不支持的 AI 操作。")
        const article = this.article(id)
        if (!this.preferences(article.source).aiEnabled)
            throw new Error(
                "此订阅源已关闭 AI 功能，可在「源与分组阅读偏好」中重新开启。"
            )
        const c = this.client.config()
        if (!c.baseURL || !c.model)
            throw new Error(
                "请先前往「选项 → 自用功能 → AI 设置」填写接口基础地址与模型名。"
            )
        const language = c.targetLanguage
        if (kind === "title")
            return this.client.cached(
                c,
                id,
                kind,
                titlePrompt(language),
                article.title,
                undefined,
                force
            )
        if (!article.text.trim()) throw new Error("No article text available.")
        const chunks = splitText(article.text)
        if (kind === "summary" && chunks.length > 1 && !force) {
            const fullSummaryKey = this.client.makeCacheKey(
                c,
                id,
                "summary-full",
                summaryChunkPrompt(language),
                article.text
            )
            const cachedFull = this.client.readCachedOnly(fullSummaryKey)
            if (cachedFull) {
                return { text: cachedFull, tokens: null, cached: true }
            }
        }
        const parts: AIResult[] = []
        for (const chunk of chunks)
            parts.push(
                await this.client.cached(
                    c,
                    id,
                    kind + "-part",
                    kind === "translation"
                        ? translationPrompt(language)
                        : summaryChunkPrompt(language),
                    chunk,
                    undefined,
                    force
                )
            )
        let result: AIResult = {
            text: parts.map(p => p.text).join("\n\n"),
            tokens: sumTokens(parts.map(p => p.tokens)),
            cached: parts.every(p => p.cached),
        }
        if (kind === "summary" && parts.length > 1) {
            // Reduce arbitrary-length articles in bounded batches without dropping parts.
            let level = result.text
            let depth = 0
            while (Array.from(level).length > 7000 && depth++ < 8) {
                const reduced: string[] = []
                for (const chunk of splitText(level)) {
                    const part = await this.client.cached(
                        c,
                        id,
                        "summary-reduce",
                        `Condense these notes in ${language} into at most 1200 characters, preserving the main facts.`,
                        chunk,
                        undefined,
                        force
                    )
                    reduced.push(part.text)
                    result.tokens = sumTokens([result.tokens, part.tokens])
                    result.cached = result.cached && part.cached
                }
                level = reduced.join("\n\n")
            }
            if (Array.from(level).length > 7000)
                throw new Error(
                    "文章过长，当前模型未能完成分段汇总，请尝试更换支持长文本的模型。"
                )
            const final = await this.client.cached(
                c,
                id,
                "summary",
                `Combine these notes into a concise summary in ${language}, with 3 to 6 main points.`,
                level,
                undefined,
                force
            )
            result = {
                ...final,
                tokens: sumTokens([result.tokens, final.tokens]),
                cached: result.cached && final.cached,
            }
            const fullSummaryKey = this.client.makeCacheKey(
                c,
                id,
                "summary-full",
                summaryChunkPrompt(language),
                article.text
            )
            this.client.saveCachedValue(
                fullSummaryKey,
                id,
                "summary-full",
                result.text,
                result.tokens
            )
        }
        return {
            ...result,
            ...(kind === "translation" ? { original: article.text } : {}),
        }
    }

    titles(): Record<number, string> {
        if (!this.settings().configured) return {}
        const c = this.client.config()
        const rows = this.db
            .prepare(
                "SELECT i._id,i.title,i.source,a.key,a.result FROM items i JOIN ai_cache a ON a.itemId=i._id WHERE a.kind='title'"
            )
            .all() as {
            _id: number
            title: string
            source: number
            key: string
            result: string
        }[]
        if (!rows.length) return {}
        const enabledBySource = new Map<number, boolean>()
        const isSourceAIEnabled = (sid: number) => {
            if (!enabledBySource.has(sid)) {
                try {
                    enabledBySource.set(sid, this.preferences(sid).aiEnabled)
                } catch {
                    enabledBySource.set(sid, false)
                }
            }
            return enabledBySource.get(sid)
        }
        const result: Record<number, string> = {}
        const instruction = titlePrompt(c.targetLanguage)
        for (const row of rows) {
            if (!isSourceAIEnabled(row.source)) continue
            const expectedKey = this.client.makeCacheKey(
                c,
                row._id,
                "title",
                instruction,
                row.title
            )
            if (row.key === expectedKey) {
                result[row._id] = row.result
            }
        }
        return result
    }

    auto(id: number, options?: { skipTitle?: boolean; skipSummary?: boolean }) {
        if (!this.settings().configured) return
        try {
            const article = this.article(id)
            const prefs = this.preferences(article.source)
            if (!prefs.aiEnabled) return
            if (!options?.skipTitle && prefs.autoTranslateTitle) {
                void this.generate(id, "title").catch(err =>
                    this.client.recordError(err)
                )
            }
            if (!options?.skipSummary && prefs.autoSummary) {
                void this.generate(id, "summary").catch(err =>
                    this.client.recordError(err)
                )
            }
        } catch (err) {
            this.client.recordError(err)
        }
    }
}
