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
    aiEnabled: false,
    autoTranslateTitle: false,
    autoSummary: false,
}

export function resolveSourcePreferences(
    source: { sid: number; openTarget?: number; fetchFrequency?: number },
    groups: Pick<SourceGroup, "gid" | "isMultiple" | "sids">[],
    overrides: PreferenceOverrides
): SourcePreferences {
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
        throw new Error("Invalid source preferences.")
    const result: Partial<SourcePreferences> = {}
    for (const key of Object.keys(input) as (keyof SourcePreferences)[]) {
        const value = input[key]
        if (value === undefined || value === null) continue
        if (!(key in defaultSourcePreferences))
            throw new Error("Unknown source preference: " + key)
        if (key === "fetchMode") {
            if (!["direct", "rendered", "off"].includes(String(value)))
                throw new Error("Invalid fetching mode.")
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
                throw new Error("Invalid preference: " + key)
        } else if (typeof value !== "boolean")
            throw new Error("Invalid preference: " + key)
        Object.assign(result, { [key]: value })
    }
    return result
}
