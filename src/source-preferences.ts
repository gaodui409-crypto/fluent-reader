import type { SourceGroup } from "./schema-types"
import type { FetchMode } from "./personal-types"

export interface SourcePreferences {
    openTarget: number
    fetchMode: FetchMode
    autoFullText: boolean
    offlineEnabled: boolean
    autoOffline: boolean
    fetchFrequency: number
    unreadExpiryDays: number
    aiEnabled: boolean
    autoTranslateTitle: boolean
    autoSummary: boolean
}

export interface PreferenceOverrides {
    sources: Record<number, Partial<SourcePreferences>>
    groups: Record<number, Partial<SourcePreferences>>
}

export const defaultSourcePreferences: SourcePreferences = {
    openTarget: 0,
    fetchMode: "direct",
    autoFullText: false,
    offlineEnabled: true,
    autoOffline: false,
    fetchFrequency: 0,
    unreadExpiryDays: 0,
    aiEnabled: true,
    autoTranslateTitle: false,
    autoSummary: false,
}

export function resolveSourcePreferences(
    source: { sid: number; openTarget?: number; fetchFrequency?: number },
    groups: Pick<SourceGroup, "gid" | "isMultiple" | "sids">[],
    overrides: PreferenceOverrides
): SourcePreferences {
    if (!source) return { ...defaultSourcePreferences }
    const group = groups.find(
        group => group.isMultiple && group.sids.includes(source.sid)
    )
    return {
        ...defaultSourcePreferences,
        // Existing choices remain the baseline; new explicit overrides win.
        openTarget: source.openTarget ?? 0,
        fetchFrequency: source.fetchFrequency ?? 0,
        ...(group ? overrides.groups[group.gid] : {}),
        ...overrides.sources[source.sid],
    }
}

export function validateSourcePreferences(
    input: Partial<SourcePreferences>
): Partial<SourcePreferences> {
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("源设置格式无效。")
    const result: Partial<SourcePreferences> = {}
    for (const key of Object.keys(input) as (keyof SourcePreferences)[]) {
        const value = input[key]
        if (value === undefined || value === null) continue
        if (!(key in defaultSourcePreferences))
            throw new Error("未知的设置项：" + key)
        if (key === "fetchMode") {
            if (!["direct", "rendered", "off"].includes(String(value)))
                throw new Error("抓取方式无效。")
        } else if (
            ["openTarget", "fetchFrequency", "unreadExpiryDays"].includes(key)
        ) {
            const maximum =
                key === "openTarget"
                    ? 3
                    : key === "fetchFrequency"
                    ? 43200
                    : 36500
            if (
                typeof value !== "number" ||
                !Number.isInteger(value) ||
                value < 0 ||
                value > maximum
            )
                throw new Error("设置数值超出允许范围：" + key)
        } else if (typeof value !== "boolean")
            throw new Error("开关设置无效：" + key)
        Object.assign(result, { [key]: value })
    }
    return result
}
