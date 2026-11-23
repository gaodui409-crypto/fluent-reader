import { ipcRenderer } from "electron"
import type { LinuxDoAccount, LinuxDoChoice } from "../linuxdo"
import type {
    ArchiveAction,
    ArchivePreview,
    ArchiveQuery,
    ArchiveResult,
    ArchiveRule,
    ArticleFolder,
    ArticleNote,
} from "../archive-types"
import type {
    PreferenceOverrides,
    SourcePreferences,
} from "../source-preferences"
import type {
    FullArticle,
    ExtractionPreview,
    ForumFloor,
    WebAccountInfo,
    SiteExtractionRule,
    PersonalReply,
    PersonalSettings,
    PersonalStatus,
    SearchHit,
    DiscoveredFeed,
    SourceHealth,
    AIConfig,
    AISettings,
    AIKind,
    AIResult,
    AIStreamEvent,
    AIArticleState,
    AIUsage,
    Briefing,
    OfflineTask,
} from "../personal-types"

async function invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    const reply: PersonalReply<T> = await ipcRenderer.invoke(
        "personal:" + method,
        ...args
    )
    if (reply.ok === false) throw new Error(reply.error)
    return reply.data
}

const personalBridge = {
    linuxDoCatalog: (kind: "categories" | "tags", query = "") =>
        invoke<LinuxDoChoice[]>("linuxDoCatalog", kind, query),
    linuxDoAccount: () => invoke<LinuxDoAccount>("linuxDoAccount"),
    linuxDoOpen: () => invoke<boolean>("linuxDoOpen"),
    linuxDoReplies: (url: string) =>
        invoke<ForumFloor[]>("linuxDoReplies", url),
    archiveFolders: () => invoke<ArticleFolder[]>("archiveFolders"),
    archiveMemberships: (id: number) =>
        invoke<number[]>("archiveMemberships", id),
    archiveSaveFolder: (folder: {
        id?: number
        name: string
        parentId?: number | null
        position?: number
    }) => invoke<number>("archiveSaveFolder", folder),
    archiveDeleteFolder: (id: number, moveTo: number | null = null) =>
        invoke<boolean>("archiveDeleteFolder", id, moveTo),
    archiveNote: (id: number) => invoke<ArticleNote>("archiveNote", id),
    archiveSaveNote: (id: number, text: string, version: number) =>
        invoke<ArticleNote>("archiveSaveNote", id, text, version),
    archivePreview: (query: ArchiveQuery) =>
        invoke<ArchivePreview>("archivePreview", query),
    archiveApplyPreview: (
        token: string,
        excluded: number[],
        action: ArchiveAction
    ) => invoke<ArchiveResult>("archiveApplyPreview", token, excluded, action),
    archiveApply: (ids: number[], action: ArchiveAction) =>
        invoke<ArchiveResult>("archiveApply", ids, action),
    archiveUndo: (id: string) => invoke<ArchiveResult>("archiveUndo", id),
    archiveRules: () => invoke<ArchiveRule[]>("archiveRules"),
    archiveSaveRule: (rule: ArchiveRule) =>
        invoke<ArchiveRule>("archiveSaveRule", rule),
    archiveDeleteRule: (id: string) => invoke<boolean>("archiveDeleteRule", id),
    archiveRetireSource: (id: number) =>
        invoke<boolean>("archiveRetireSource", id),
    discover: (url: string) => invoke<DiscoveredFeed[]>("discover", url),
    feedText: (url: string) => invoke<string>("feedText", url),
    health: () => invoke<SourceHealth[]>("health"),
    checkHealth: () => invoke<SourceHealth[]>("checkHealth"),
    reportFetch: (sid: number, error = "") =>
        invoke<boolean>("reportFetch", sid, error),
    applyRedirect: (sid: number) => invoke<string>("applyRedirect", sid),
    opened: (id: number) => invoke<boolean>("opened", id),
    aiSettings: () => invoke<AISettings>("aiSettings"),
    saveAI: (config: AIConfig, key?: string) =>
        invoke<AISettings>("saveAI", config, key),
    aiSaveProfile: (
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
    ) => invoke<AISettings>("aiSaveProfile", profile, key, removeKey),
    aiSelectProfile: (id: string) => invoke<AISettings>("aiSelectProfile", id),
    aiDeleteProfile: (id: string) => invoke<AISettings>("aiDeleteProfile", id),
    aiModels: (baseURL: string, key?: string, profileId?: string) =>
        invoke<string[]>("aiModels", baseURL, key, profileId),
    testAI: () => invoke<AIResult>("testAI"),
    aiGenerate: (id: number, kind: AIKind, force = false, requestId = "") =>
        invoke<AIResult>("aiGenerate", id, kind, force, requestId),
    aiCancel: (requestId: string) => invoke<boolean>("aiCancel", requestId),
    onAIStream: (callback: (ev: AIStreamEvent) => void) => {
        const listener = (_: unknown, ev: AIStreamEvent) => callback(ev)
        ipcRenderer.on("personal:aiStream", listener)
        return () => {
            ipcRenderer.removeListener("personal:aiStream", listener)
        }
    },
    aiTranslateSelection: (text: string) =>
        invoke<string>("aiTranslateSelection", text),
    aiArticleState: (id: number) =>
        invoke<AIArticleState>("aiArticleState", id),
    aiUsage: () => invoke<AIUsage>("aiUsage"),
    briefings: () => invoke<Briefing[]>("briefings"),
    createBriefing: () => invoke<Briefing>("createBriefing"),
    deleteBriefing: (id: number) => invoke<boolean>("deleteBriefing", id),
    library: () =>
        invoke<{
            saved: number[]
            notedIds?: number[]
            folderedIds?: number[]
            offlineTasks?: Record<number, OfflineTask>
            removeLaterOnRead: boolean
            aiConfigured: boolean
            titles: Record<number, string>
        }>("library"),
    saveOffline: (id: number) => invoke<string>("saveOffline", id),
    openOffline: (id: number, reveal = false) =>
        invoke<boolean>("openOffline", id, reveal),
    deleteOffline: (id: number) => invoke<boolean>("deleteOffline", id),
    openPath: (targetPath: string) => invoke<boolean>("openPath", targetPath),
    previewExtraction: (url: string, rule?: Partial<SiteExtractionRule>) =>
        invoke<ExtractionPreview>("previewExtraction", url, rule),
    onChanged: (callback: () => void) => {
        const listener = () => callback()
        ipcRenderer.on("personal:changed", listener)
        return () => {
            ipcRenderer.removeListener("personal:changed", listener)
        }
    },
    preferences: () => invoke<PreferenceOverrides>("preferences"),
    savePreferences: (
        target: { sids: number[] } | { gid: number },
        patch: Partial<SourcePreferences>,
        clear: (keyof SourcePreferences)[],
        clearChildSources = false
    ) =>
        invoke<PreferenceOverrides>(
            "savePreferences",
            target,
            patch,
            clear,
            clearChildSources
        ),
    afterInsert: (ids: number[]) => invoke<boolean>("afterInsert", ids),
    notifyItem: (id: number) => invoke<boolean>("notifyItem", id),
    onOpenArticle: (callback: (id: number) => void) => {
        const listener = (_: unknown, id: number) => callback(id)
        ipcRenderer.on("personal:openArticle", listener)
        return () => {
            ipcRenderer.removeListener("personal:openArticle", listener)
        }
    },
    settings: () => invoke<PersonalSettings>("settings"),
    saveSettings: (settings: PersonalSettings) =>
        invoke<PersonalSettings>("saveSettings", settings),
    chooseFolder: () => invoke<string | null>("chooseFolder"),
    status: () => invoke<PersonalStatus>("status"),
    search: (query: string, offset = 0) =>
        invoke<SearchHit[]>("search", query, offset),
    rebuildIndex: () => invoke<boolean>("rebuildIndex"),
    backup: () => invoke<string>("backup"),
    restore: () => invoke<boolean>("restore"),
    fullText: (
        id: number,
        force = false,
        mode?: "direct" | "rendered",
        collection?: string
    ) => invoke<FullArticle>("fullText", id, force, mode, collection),
    accounts: () => invoke<WebAccountInfo[]>("accounts"),
    clearAccount: (host: string) => invoke<boolean>("clearAccount", host),
    login: (url: string) => invoke<boolean>("login", url),
}

declare global {
    interface Window {
        personal: typeof personalBridge
    }
}
export default personalBridge
