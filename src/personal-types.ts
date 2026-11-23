export type FetchMode = "direct" | "rendered" | "off"

export interface SiteExtractionRule {
    host: string
    container: string
    remove: string
    mode: FetchMode
}

export interface PersonalSettings {
    domainInterval: number
    concurrency: number
    backupFolder: string
    backupSchedule: "off" | "daily" | "weekly"
    backupKeep: number
    lastBackup: number
    siteRules: SiteExtractionRule[]
    offlineFolder: string
    removeLaterOnRead: boolean
    rssHub: string
    staleDays: number
    loginHosts?: string[]
}

export const defaultPersonalSettings: PersonalSettings = {
    domainInterval: 5,
    concurrency: 1,
    backupFolder: "",
    backupSchedule: "off",
    backupKeep: 10,
    lastBackup: 0,
    siteRules: [],
    offlineFolder: "",
    removeLaterOnRead: false,
    rssHub: "https://rsshub.app",
    staleDays: 30,
    loginHosts: [],
}

export interface IndexProgress {
    indexed: number
    total: number
    running: boolean
    error?: string
}

export interface SearchHit {
    id: number
    title: string
    excerpt: string
    source: string
    rank: number
    date?: number
}

export interface QueueTask {
    id: number
    label: string
    host: string
    state: "waiting" | "running" | "done" | "failed"
    error?: string
}

export interface QueueSummary {
    waiting: number
    running: number
    failed: number
}

export interface PersonalStatus {
    index: IndexProgress
    tasks: QueueTask[]
    queueSummary?: QueueSummary
    backupRunning: boolean
    backupError: string
    backupWarning?: string
    aiError?: string
    offline: OfflineTask[]
}

export interface OfflineTask {
    id: number
    title: string
    state: "waiting" | "running" | "done" | "failed"
    path?: string
    error?: string
}

export interface FullArticle {
    html: string
    fetchedAt: number
    cached: boolean
}

export interface ExtractionPreview {
    title: string
    html: string
    textLength: number
}

export interface ForumFloor {
    floor: number
    author: string
    createdAt: string
    html: string
    likes: number
}

export interface WebAccountInfo {
    host: string
    count: number
    subscribed?: boolean
    explicit?: boolean
}

export type PersonalReply<T> =
    | { ok: true; data: T }
    | { ok: false; error: string }

export interface DiscoveredFeed {
    url: string
    title: string
}

export interface SourceHealth {
    sid: number
    name: string
    url: string
    failures: number
    lastError: string
    checkedAt: number
    lastFetched: number
    redirect: string
    latest: number
    updates: number
    opened: number
    stale: boolean
    service: boolean
}

export type AIKind = "title" | "summary" | "translation"

export interface AIProfile {
    id: string
    name: string
    baseURL: string
    model: string
    summaryModel?: string
    translateModel?: string
    hasKey: boolean
}

export interface AIConfig {
    baseURL: string
    model: string
    summaryModel?: string
    translateModel?: string
    targetLanguage: string
    dailyBriefing: boolean
    briefingHour: number
    activeProfileId?: string
}

export interface AISettings extends AIConfig {
    hasKey: boolean
    configured: boolean
    profiles?: AIProfile[]
}

export interface BilingualBlock {
    source: string
    target: string
    isCode?: boolean
}

export interface AIResult {
    text: string
    tokens: number | null
    cached: boolean
    original?: string
    blocks?: BilingualBlock[]
}

export interface AIStreamEvent {
    requestId: string
    id: number
    kind: AIKind
    text: string
    chunkIndex?: number
    chunkCount?: number
    done?: boolean
}

export interface AIArticleState {
    summary?: string
    translation?: string
    original?: string
    blocks?: BilingualBlock[]
}

export interface BriefingTopic {
    topic: string
    entries: { id: number; title: string; link: string; summary: string }[]
}

export interface Briefing {
    id: number
    createdAt: number
    topics: BriefingTopic[]
    tokens: number | null
}

export interface AIUsage {
    month: number
    unknownCalls: number
    last: number | null
    error: string
}
