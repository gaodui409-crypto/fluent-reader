import type Database from "better-sqlite3"
import type Store from "electron-store"
import { parseHTML } from "linkedom"
import type { SchemaTypes } from "../schema-types"
import type {
    AIArticleState,
    AIConfig,
    AIKind,
    AIResult,
    AISettings,
    AIStreamEvent,
    AIUsage,
    BilingualBlock,
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

export interface RawArticleBlock {
    text: string
    isCode?: boolean
}

const LEAF_BLOCK_TAGS = new Set([
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "li",
])

const CONTAINER_BLOCK_TAGS = new Set([
    "div",
    "article",
    "section",
    "main",
    "aside",
    "header",
    "footer",
    "nav",
    "ul",
    "ol",
    "dl",
    "dt",
    "dd",
    "figure",
    "figcaption",
    "details",
    "summary",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "hr",
])

function inlineNodeText(node: any): string {
    if (!node) return ""
    if (node.nodeType === 3) return node.nodeValue || ""
    if (node.nodeType !== 1) return ""
    const tag = String(node.tagName || "").toLowerCase()
    if (tag === "br") return "\n"
    return Array.from(node.childNodes || [])
        .map(inlineNodeText)
        .join("")
}

function normalizeProseText(raw: string): string {
    return raw
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map(line => line.replace(/[ \t\f\v\u00a0]+/g, " ").trim())
        .filter(Boolean)
        .join("\n")
        .trim()
}

export function extractStructuredBlocks(
    html: string,
    fallbackText = ""
): RawArticleBlock[] {
    const blocks: RawArticleBlock[] = []
    const pushProse = (text: string) => {
        if (!text) return
        if (Array.from(text).length <= 5500) {
            blocks.push({ text })
            return
        }
        for (const piece of splitText(text, 5500)) {
            if (piece.trim()) blocks.push({ text: piece.trim() })
        }
    }

    if (html && html.trim()) {
        const { document } = parseHTML(
            `<!doctype html><html><body>${html}</body></html>`
        )
        document
            .querySelectorAll("script,style,noscript,svg,template")
            .forEach((el: any) => el.remove())

        const walk = (parent: any) => {
            let inlineBuf = ""
            const flushInline = () => {
                const clean = normalizeProseText(inlineBuf)
                inlineBuf = ""
                if (clean) pushProse(clean)
            }
            for (const child of Array.from(parent.childNodes || []) as any[]) {
                if (child.nodeType === 3) {
                    inlineBuf += child.nodeValue || ""
                    continue
                }
                if (child.nodeType !== 1) continue
                const tag = String(child.tagName || "").toLowerCase()
                if (tag === "pre") {
                    flushInline()
                    const codeText = String(child.textContent || "")
                        .replace(/\r\n/g, "\n")
                        .replace(/^\n+|\n+$/g, "")
                    if (codeText.trim()) {
                        blocks.push({ text: codeText, isCode: true })
                    }
                } else if (LEAF_BLOCK_TAGS.has(tag)) {
                    flushInline()
                    if (
                        child.querySelector?.(
                            "p,h1,h2,h3,h4,h5,h6,blockquote,li,pre"
                        )
                    ) {
                        walk(child)
                    } else {
                        const clean = normalizeProseText(inlineNodeText(child))
                        if (clean) pushProse(clean)
                    }
                } else if (CONTAINER_BLOCK_TAGS.has(tag)) {
                    flushInline()
                    walk(child)
                } else {
                    inlineBuf += inlineNodeText(child)
                }
            }
            flushInline()
        }

        walk(document.body)
    }

    if (!blocks.length && fallbackText && fallbackText.trim()) {
        const normalized = fallbackText.replace(/\r\n/g, "\n").trim()
        const paragraphs = normalized
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(Boolean)
        for (const p of paragraphs.length ? paragraphs : [normalized]) {
            pushProse(p)
        }
    }

    return blocks
}

export function batchProseBlocks(
    entries: { index: number; text: string }[],
    maxChars = 6000
): { index: number; text: string }[][] {
    const batches: { index: number; text: string }[][] = []
    let current: { index: number; text: string }[] = []
    let currentLen = 0
    for (const entry of entries) {
        const markerOverhead = 18
        const entryLen = Array.from(entry.text).length + markerOverhead
        if (current.length > 0 && currentLen + entryLen > maxChars) {
            batches.push(current)
            current = []
            currentLen = 0
        }
        current.push(entry)
        currentLen += entryLen
    }
    if (current.length > 0) batches.push(current)
    return batches
}

class IncompleteTranslation extends Error {
    constructor(readonly partial: string[]) {
        super("AI 翻译段落缺失或对应关系异常，需要逐段补译。")
    }
}

export function parseBatchTranslation(output: string, count: number): string[] {
    if (count <= 0) return []
    const text = String(output || "").trim()
    const markers = [...text.matchAll(/\[{2,3}\s*PARA_(\d+)\s*\]{2,3}/gi)]
    if (count === 1 && !markers.length && text) return [text]
    const partial: string[] = Array(count).fill("")
    // Recover only unambiguous, ordered markers. Never guess paragraph positions.
    let previous = -1
    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i]
        const index = Number(marker[1])
        if (index <= previous || index >= count)
            throw new IncompleteTranslation(Array(count).fill(""))
        previous = index
        partial[index] = text
            .slice(
                marker.index + marker[0].length,
                markers[i + 1]?.index ?? text.length
            )
            .trim()
    }
    if (markers.length !== count || partial.some(t => !t))
        throw new IncompleteTranslation(partial)
    return partial
}

function cleanStreamingMarkers(partial: string): string {
    return partial
        .replace(/\[{2,3}\s*PARA_\d+\s*\]{2,3}\s*/gi, "\n\n")
        .replace(/\[{1,3}(?:P(?:A(?:R(?:A(?:_\d*\]{0,2})?)?)?)?)?$/i, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

interface CachedTranslationEnvelope {
    v: 2
    text: string
    original: string
    blocks: BilingualBlock[]
}

function validTranslationEnvelope(
    value: CachedTranslationEnvelope,
    raw: RawArticleBlock[]
): boolean {
    return (
        value?.v === 2 &&
        typeof value.text === "string" &&
        typeof value.original === "string" &&
        Array.isArray(value.blocks) &&
        value.blocks.length === raw.length &&
        value.blocks.every(
            (block, i) =>
                block &&
                block.source === raw[i].text &&
                Boolean(block.isCode) === Boolean(raw[i].isCode) &&
                typeof block.target === "string" &&
                (block.isCode
                    ? block.target === block.source
                    : Boolean(block.target.trim()))
        ) &&
        value.text === value.blocks.map(b => b.target).join("\n\n") &&
        value.original === raw.map(b => b.text).join("\n\n")
    )
}

const titlePrompt = (language: string) =>
    `Translate this title to ${language}. Return only the translated title. If already in the target language, return it unchanged.`
const translationPrompt = (language: string) =>
    `Translate the complete text to ${language}. Preserve paragraphs and all factual details. Return only the translation.`
const structuredTranslationPrompt = (language: string, count: number) =>
    `Translate each paragraph to ${language}. The input contains ${count} paragraphs marked [[[PARA_0]]] through [[[PARA_${
        count - 1
    }]]]. Keep every [[[PARA_N]]] marker on its own line in exact order, followed by the translated paragraph. Preserve all factual details. Return only the markers and translated paragraphs.`
const summaryChunkPrompt = (language: string) =>
    `Summarize the text in ${language} in 3 to 6 concise points.`
const selectionPrompt = (language: string) =>
    `Translate the selected snippet accurately into ${language}. If it is a short term, idiom, or technical phrase, also provide a brief one-sentence explanation in ${language}; otherwise return only the natural translation.`

export class AI {
    private client: AIClient
    private briefingService: AIBriefingService
    private controllers = new Map<string, AbortController>()

    constructor(
        private db: Database.Database,
        store: Store<SchemaTypes>,
        private queue: DomainQueue,
        private preferences: (sid: number) => SourcePreferences,
        changed: () => void
    ) {
        this.client = new AIClient(db, store, queue, changed)
        this.briefingService = new AIBriefingService(
            db,
            this.client,
            preferences
        )
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

    saveProfile(
        profile: {
            id?: string
            name: string
            baseURL: string
            model: string
            summaryModel?: string
            translateModel?: string
        },
        key?: string,
        removeKey = false
    ): AISettings {
        return this.client.saveProfile(profile, key, removeKey)
    }

    selectProfile(id: string): AISettings {
        return this.client.selectProfile(id)
    }

    deleteProfile(id: string): AISettings {
        return this.client.deleteProfile(id)
    }

    listModels(
        baseURL: string,
        key?: string,
        profileId?: string
    ): Promise<string[]> {
        return this.client.listModels(baseURL, key, profileId)
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

    cancel(requestId: string): boolean {
        if (!requestId) return false
        const ctrl = this.controllers.get(requestId)
        if (!ctrl) return false
        ctrl.abort(new Error("AI 请求已取消。"))
        this.controllers.delete(requestId)
        return true
    }

    async translateSelection(text: string): Promise<string> {
        const trimmed = String(text || "").trim()
        if (!trimmed) throw new Error("请先选择要翻译的文字。")
        const bounded = Array.from(trimmed).slice(0, 4000).join("")
        const c = this.client.config()
        const model = this.client.resolveModel(c, "selection")
        if (!c.baseURL || !model)
            throw new Error(
                "请先前往「选项 → 自用功能 → AI 设置」填写接口基础地址与模型名。"
            )
        const result = await this.client.cached(
            c,
            null,
            "selection",
            selectionPrompt(c.targetLanguage),
            bounded
        )
        return result.text
    }

    private article(id: number) {
        if (!Number.isSafeInteger(id)) throw new Error("无效的文章。")
        const row = this.db
            .prepare(
                "SELECT i._id,i.source,i.title,i.link,i.content,c.fullHtml,c.fullText,c.offlineText FROM items i LEFT JOIN article_content c ON c.itemId=i._id WHERE i._id=?"
            )
            .get(id) as {
            _id: number
            source: number
            title: string
            link: string
            content: string
            fullHtml: string | null
            fullText: string | null
            offlineText: string | null
        }
        if (!row) throw new Error("文章已不存在。")
        const plainText =
            row.fullText || row.offlineText || htmlText(row.content)
        const preferOfflinePlain =
            !row.fullHtml?.trim() &&
            Boolean(row.offlineText?.trim()) &&
            (row.offlineText || "").length > htmlText(row.content).length * 1.3
        const htmlForBlocks = row.fullHtml?.trim()
            ? row.fullHtml
            : preferOfflinePlain
            ? ""
            : row.content
        return {
            ...row,
            text: plainText,
            blocksSourceHtml: htmlForBlocks,
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

        const rawBlocks = extractStructuredBlocks(
            article.blocksSourceHtml,
            article.text
        )
        if (rawBlocks.length) {
            const blocksKey = this.client.makeCacheKey(
                c,
                id,
                "translation-blocks",
                "bilingual-v2",
                JSON.stringify(rawBlocks)
            )
            const cachedBlocksRaw = this.client.readCachedOnly(blocksKey)
            if (cachedBlocksRaw) {
                try {
                    const parsed = JSON.parse(
                        cachedBlocksRaw
                    ) as CachedTranslationEnvelope
                    if (validTranslationEnvelope(parsed, rawBlocks)) {
                        state.translation = parsed.text
                        state.original = parsed.original
                        state.blocks = parsed.blocks
                        return state
                    }
                } catch {
                    // Invalid historical envelopes are recomputed.
                }
                return state
            }
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
        if (translatedParts.every(part => part?.trim())) {
            state.translation = translatedParts.join("\n\n")
            state.original = article.text
        }
        return state
    }

    async generate(
        id: number,
        kind: AIKind,
        force = false,
        requestId = "",
        onStream?: (ev: AIStreamEvent) => void
    ): Promise<AIResult> {
        if (!["title", "summary", "translation"].includes(kind))
            throw new Error("不支持的 AI 操作。")
        const article = this.article(id)
        if (!this.preferences(article.source).aiEnabled)
            throw new Error(
                "此订阅源已关闭 AI 功能，可在「源与分组阅读偏好」中重新开启。"
            )
        const c = this.client.config()
        const taskModel = this.client.resolveModel(c, kind)
        if (!c.baseURL || !taskModel)
            throw new Error(
                "请先前往「选项 → 自用功能 → AI 设置」填写接口基础地址与模型名。"
            )

        const reqId = typeof requestId === "string" ? requestId.trim() : ""
        let controller: AbortController | undefined
        if (reqId) {
            this.controllers.get(reqId)?.abort(new Error("AI 请求已替换。"))
            controller = new AbortController()
            this.controllers.set(reqId, controller)
        }

        let throttleTimer: ReturnType<typeof setTimeout> | null = null
        let lastSentAt = 0
        let pendingEvent: AIStreamEvent | null = null

        const emitStream = (
            text: string,
            chunkIndex = 0,
            chunkCount = 1,
            done = false
        ) => {
            if (!reqId || !onStream || controller?.signal.aborted) return
            const event: AIStreamEvent = {
                requestId: reqId,
                id,
                kind,
                text,
                chunkIndex,
                chunkCount,
                done,
            }
            if (done) {
                if (throttleTimer) {
                    clearTimeout(throttleTimer)
                    throttleTimer = null
                }
                pendingEvent = null
                onStream(event)
                return
            }
            const now = Date.now()
            pendingEvent = event
            const elapsed = now - lastSentAt
            if (elapsed >= 40) {
                if (throttleTimer) {
                    clearTimeout(throttleTimer)
                    throttleTimer = null
                }
                lastSentAt = now
                pendingEvent = null
                onStream(event)
            } else if (!throttleTimer) {
                throttleTimer = setTimeout(() => {
                    throttleTimer = null
                    if (pendingEvent && !controller?.signal.aborted) {
                        lastSentAt = Date.now()
                        const toSend = pendingEvent
                        pendingEvent = null
                        onStream(toSend)
                    }
                }, 40 - elapsed)
            }
        }

        try {
            const language = c.targetLanguage
            if (kind === "title") {
                const res = await this.client.cached(
                    c,
                    id,
                    kind,
                    titlePrompt(language),
                    article.title,
                    undefined,
                    force,
                    reqId
                        ? {
                              stream: true,
                              requestId: reqId,
                              signal: controller?.signal,
                              onProgress: text => emitStream(text, 0, 1, false),
                          }
                        : undefined
                )
                emitStream(res.text, 0, 1, true)
                return res
            }

            if (!article.text.trim())
                throw new Error("No article text available.")

            if (kind === "translation") {
                return await this.generateBilingualTranslation(
                    c,
                    id,
                    article,
                    force,
                    reqId,
                    controller?.signal,
                    emitStream
                )
            }

            const chunks = splitText(article.text)
            if (chunks.length > 1 && !force) {
                const fullSummaryKey = this.client.makeCacheKey(
                    c,
                    id,
                    "summary-full",
                    summaryChunkPrompt(language),
                    article.text
                )
                const cachedFull = this.client.readCachedOnly(fullSummaryKey)
                if (cachedFull) {
                    emitStream(
                        cachedFull,
                        chunks.length - 1,
                        chunks.length,
                        true
                    )
                    return { text: cachedFull, tokens: null, cached: true }
                }
            }

            const parts: AIResult[] = []
            for (let i = 0; i < chunks.length; i++) {
                const completedPrefix = parts.map(p => p.text).join("\n\n")
                const part = await this.client.cached(
                    c,
                    id,
                    "summary-part",
                    summaryChunkPrompt(language),
                    chunks[i],
                    undefined,
                    force,
                    reqId
                        ? {
                              stream: true,
                              requestId: reqId,
                              signal: controller?.signal,
                              onProgress: partial =>
                                  emitStream(
                                      completedPrefix
                                          ? `${completedPrefix}\n\n${partial}`
                                          : partial,
                                      i,
                                      chunks.length,
                                      false
                                  ),
                          }
                        : undefined
                )
                parts.push(part)
            }

            let result: AIResult = {
                text: parts.map(p => p.text).join("\n\n"),
                tokens: sumTokens(parts.map(p => p.tokens)),
                cached: parts.every(p => p.cached),
            }

            if (parts.length > 1) {
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
                            force,
                            reqId
                                ? {
                                      stream: true,
                                      requestId: reqId,
                                      signal: controller?.signal,
                                  }
                                : undefined
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
                    force,
                    reqId
                        ? {
                              stream: true,
                              requestId: reqId,
                              signal: controller?.signal,
                              onProgress: partial =>
                                  emitStream(
                                      partial,
                                      chunks.length - 1,
                                      chunks.length,
                                      false
                                  ),
                          }
                        : undefined
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
            emitStream(result.text, chunks.length - 1, chunks.length, true)
            return result
        } finally {
            if (throttleTimer) clearTimeout(throttleTimer)
            if (reqId && this.controllers.get(reqId) === controller) {
                this.controllers.delete(reqId)
            }
        }
    }

    private async generateBilingualTranslation(
        c: ReturnType<AIClient["config"]>,
        id: number,
        article: ReturnType<AI["article"]>,
        force: boolean,
        reqId: string,
        signal: AbortSignal | undefined,
        emitStream: (
            text: string,
            chunkIndex: number,
            chunkCount: number,
            done: boolean
        ) => void
    ): Promise<AIResult> {
        const rawBlocks = extractStructuredBlocks(
            article.blocksSourceHtml,
            article.text
        )
        if (!rawBlocks.length) throw new Error("No article text available.")

        const blocksCacheKey = this.client.makeCacheKey(
            c,
            id,
            "translation-blocks",
            "bilingual-v2",
            JSON.stringify(rawBlocks)
        )
        if (!force) {
            const cachedEntry = this.client.readCachedEntry(blocksCacheKey)
            if (cachedEntry) {
                try {
                    const parsed = JSON.parse(
                        cachedEntry.result
                    ) as CachedTranslationEnvelope
                    if (validTranslationEnvelope(parsed, rawBlocks)) {
                        emitStream(parsed.text, 0, 1, true)
                        return {
                            text: parsed.text,
                            original: parsed.original,
                            blocks: parsed.blocks,
                            tokens: cachedEntry.tokens,
                            cached: true,
                        }
                    }
                } catch {
                    // Recompute if cached envelope was invalid.
                }
            }
        }

        const blocks: BilingualBlock[] = rawBlocks.map(b =>
            b.isCode
                ? { source: b.text, target: b.text, isCode: true }
                : { source: b.text, target: "" }
        )
        const proseEntries = rawBlocks
            .map((b, index) => ({ index, text: b.text, isCode: b.isCode }))
            .filter(b => !b.isCode)
            .map(b => ({ index: b.index, text: b.text }))

        const batches = batchProseBlocks(proseEntries, 6000)
        const language = c.targetLanguage
        const tokenParts: (number | null)[] = []
        let allCached = true

        for (let bIdx = 0; bIdx < batches.length; bIdx++) {
            const batch = batches[bIdx]
            const isSingle = batch.length === 1
            const instruction = isSingle
                ? translationPrompt(language)
                : structuredTranslationPrompt(language, batch.length)
            const batchInput = isSingle
                ? batch[0].text
                : batch
                      .map((entry, idx) => `[[[PARA_${idx}]]]\n${entry.text}`)
                      .join("\n\n")

            const completedBefore = blocks
                .slice(0, batch[0].index)
                .map(b => b.target)
                .filter(Boolean)
                .join("\n\n")

            let translatedList: string[]
            try {
                const batchResult = await this.client.cached(
                    c,
                    id,
                    "translation-part",
                    instruction,
                    batchInput,
                    text => {
                        parseBatchTranslation(text, batch.length)
                    },
                    force,
                    {
                        stream: Boolean(reqId),
                        requestId: reqId || undefined,
                        signal,
                        onProgress: partial => {
                            const cleaned = cleanStreamingMarkers(partial)
                            emitStream(
                                completedBefore
                                    ? completedBefore + "\n\n" + cleaned
                                    : cleaned,
                                bIdx,
                                batches.length,
                                false
                            )
                        },
                    }
                )
                tokenParts.push(batchResult.tokens)
                allCached = allCached && batchResult.cached
                translatedList = parseBatchTranslation(
                    batchResult.text,
                    batch.length
                )
            } catch (error) {
                if (
                    !(error instanceof IncompleteTranslation) ||
                    isSingle ||
                    signal?.aborted
                )
                    throw error
                // The failed batch is absent from ai_cache. Its usage is still in ai_usage.
                tokenParts.push(null)
                allCached = false
                translatedList = error.partial
                for (let i = 0; i < batch.length; i++) {
                    if (translatedList[i]?.trim()) continue
                    const repaired = await this.client.cached(
                        c,
                        id,
                        "translation-part",
                        translationPrompt(language),
                        batch[i].text,
                        text => {
                            parseBatchTranslation(text, 1)
                        },
                        force,
                        {
                            stream: Boolean(reqId),
                            requestId: reqId || undefined,
                            signal,
                        }
                    )
                    translatedList[i] = parseBatchTranslation(
                        repaired.text,
                        1
                    )[0]
                    tokenParts.push(repaired.tokens)
                }
            }
            for (let i = 0; i < batch.length; i++) {
                if (!translatedList[i]?.trim())
                    throw new Error("AI 翻译仍有空白段落，未保存不完整译文。")
                blocks[batch[i].index].target = translatedList[i]
            }
        }

        const original = blocks.map(b => b.source).join("\n\n")
        const text = blocks
            .map(b => b.target)
            .filter(Boolean)
            .join("\n\n")
        const tokens = batches.length ? sumTokens(tokenParts) : 0
        const cached = batches.length ? allCached : true

        const envelope: CachedTranslationEnvelope = {
            v: 2,
            text,
            original,
            blocks,
        }
        if (!validTranslationEnvelope(envelope, rawBlocks))
            throw new Error("AI 翻译仍有空白段落，未保存不完整译文。")
        this.client.clearError()
        this.client.saveCachedValue(
            blocksCacheKey,
            id,
            "translation-blocks",
            JSON.stringify(envelope),
            tokens
        )
        emitStream(
            text,
            Math.max(0, batches.length - 1),
            Math.max(1, batches.length),
            true
        )
        return {
            text,
            original,
            blocks,
            tokens,
            cached,
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
            const c = this.client.config()
            if (!options?.skipTitle && prefs.autoTranslateTitle) {
                void this.queue
                    .add(c.baseURL || "https://ai.local", "aiTask", () =>
                        this.generate(id, "title")
                    )
                    .catch(err => this.client.recordError(err))
            }
            if (!options?.skipSummary && prefs.autoSummary) {
                void this.queue
                    .add(c.baseURL || "https://ai.local", "aiTask", () =>
                        this.generate(id, "summary")
                    )
                    .catch(err => this.client.recordError(err))
            }
        } catch (err) {
            this.client.recordError(err)
        }
    }
}
