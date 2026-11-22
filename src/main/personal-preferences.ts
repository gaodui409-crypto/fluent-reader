import type Database from "better-sqlite3"
import type Store from "electron-store"
import type { SchemaTypes } from "../schema-types"
import { defaultPersonalSettings, PersonalSettings } from "../personal-types"
import {
    defaultSourcePreferences,
    PreferenceOverrides,
    resolveSourcePreferences,
    SourcePreferences,
    validateSourcePreferences,
} from "../source-preferences"
import { httpURL, normalizeSiteHost } from "./domain-queue"
import { validateCssSelector } from "./web-content"

export class PersonalPreferencesStore {
    constructor(
        private sqlite: Database.Database,
        private store: Store<SchemaTypes>,
        private changed: () => void
    ) {
        this.ensureInitialSourcePreferences()
    }

    ensureInitialSourcePreferences() {
        if (this.store.has("sourcePreferences")) return
        const initial: PreferenceOverrides = { sources: {}, groups: {} }
        const sources = this.sqlite
            .prepare("SELECT sid,openTarget,fetchFrequency FROM sources")
            .all() as {
            sid: number
            openTarget: number
            fetchFrequency: number
        }[]
        for (const source of sources) {
            const values: Partial<SourcePreferences> = {}
            if (source.openTarget) values.openTarget = source.openTarget
            if (source.fetchFrequency)
                values.fetchFrequency = source.fetchFrequency
            if (Object.keys(values).length) initial.sources[source.sid] = values
        }
        this.store.set("sourcePreferences", initial)
    }

    migrateLegacyFolderReadingPreferences() {
        const reading = this.store.get("readingPreferences")
        if (!reading?.collections) return
        const folders = this.sqlite
            .prepare(
                "SELECT id,legacyName FROM article_folders WHERE legacyName IS NOT NULL"
            )
            .all() as { id: number; legacyName: string }[]
        if (!folders.length) return
        const nextCollections = { ...reading.collections }
        let mutated = false
        for (const folder of folders) {
            const old = nextCollections["tag:主题/" + folder.legacyName]
            if (old && !nextCollections["folder:" + folder.id]) {
                nextCollections["folder:" + folder.id] = old
                mutated = true
            }
        }
        if (mutated) {
            this.store.set("readingPreferences", {
                ...reading,
                collections: nextCollections,
            })
        }
    }

    settings = (): PersonalSettings => ({
        ...defaultPersonalSettings,
        ...this.store.get("personal", {} as PersonalSettings),
    })

    preferences = (): PreferenceOverrides =>
        this.store.get("sourcePreferences", { sources: {}, groups: {} })

    sourcePreferences = (sid: number): SourcePreferences => {
        const source = this.sqlite
            .prepare(
                "SELECT sid,openTarget,fetchFrequency FROM sources WHERE sid=?"
            )
            .get(sid) as {
            sid: number
            openTarget: number
            fetchFrequency: number
        }
        if (!source) throw new Error("该订阅源已不存在。")
        return resolveSourcePreferences(
            source,
            this.store.get("sourceGroups", []),
            this.preferences()
        )
    }

    savePreferences(
        target: { sids: number[] } | { gid: number },
        patch: Partial<SourcePreferences>,
        clear: (keyof SourcePreferences)[] = []
    ): PreferenceOverrides {
        const valid = validateSourcePreferences(patch)
        if (
            !Array.isArray(clear) ||
            clear.some(key => !(key in defaultSourcePreferences))
        )
            throw new Error("无效的重置设置项。")
        const stored = this.preferences()
        const next: PreferenceOverrides = {
            sources: { ...stored.sources },
            groups: { ...stored.groups },
        }
        const sids = "sids" in target ? target.sids : null
        if (
            sids &&
            (!Array.isArray(sids) || !sids.length || sids.length > 1000)
        )
            throw new Error("所选订阅源列表无效。")
        const ids = sids || [target["gid"]]
        const map = sids ? next.sources : next.groups
        for (const id of ids) {
            if (
                !Number.isSafeInteger(id) ||
                (sids
                    ? !this.sqlite
                          .prepare("SELECT sid FROM sources WHERE sid=?")
                          .get(id)
                    : !this.store
                          .get("sourceGroups", [])
                          .some(group => group.gid === id && group.isMultiple))
            )
                throw new Error("所选订阅源或分组已不存在。")
            const values = { ...map[id], ...valid }
            for (const key of clear) delete values[key]
            if (Object.keys(values).length > 0) map[id] = values
            else delete map[id]
        }
        this.store.set("sourcePreferences", next)
        this.changed()
        return next
    }

    saveSettings(value: PersonalSettings): PersonalSettings {
        if (
            !value ||
            !Array.isArray(value.siteRules) ||
            value.siteRules.length > 200
        )
            throw new Error("自用功能设置格式无效。")
        const next: PersonalSettings = {
            domainInterval: Number(value.domainInterval),
            concurrency: Number(value.concurrency),
            backupFolder: String(value.backupFolder || ""),
            backupSchedule: value.backupSchedule,
            backupKeep: Number(value.backupKeep),
            lastBackup: this.settings().lastBackup,
            offlineFolder: String(value.offlineFolder || ""),
            removeLaterOnRead: !!value.removeLaterOnRead,
            rssHub: httpURL(
                value.rssHub || defaultPersonalSettings.rssHub
            ).href.replace(/\/$/, ""),
            staleDays: Number(value.staleDays),
            siteRules: value.siteRules.map(rule => ({
                host: normalizeSiteHost(rule.host),
                container: validateCssSelector(
                    String(rule.container || "").slice(0, 2000),
                    "正文选择器"
                ),
                remove: validateCssSelector(
                    String(rule.remove || "").slice(0, 2000),
                    "移除元素选择器"
                ),
                mode: rule.mode,
            })),
        }
        if (
            !Number.isFinite(next.domainInterval) ||
            next.domainInterval < 0 ||
            next.domainInterval > 3600 ||
            !Number.isInteger(next.concurrency) ||
            next.concurrency < 1 ||
            next.concurrency > 8 ||
            !Number.isInteger(next.backupKeep) ||
            !Number.isInteger(next.staleDays) ||
            next.staleDays < 1 ||
            next.staleDays > 3650 ||
            next.backupKeep < 1 ||
            next.backupKeep > 100 ||
            !["off", "daily", "weekly"].includes(next.backupSchedule) ||
            next.siteRules.some(
                rule => !["direct", "rendered", "off"].includes(rule.mode)
            )
        )
            throw new Error("部分设置数值超出支持范围，请检查输入。")
        this.store.set("personal", next)
        this.changed()
        return next
    }
}
