import type { UnseenDelta } from "./schema-types"

export function normalizeUnseenDelta(value: unknown): UnseenDelta {
    const result: UnseenDelta = { bySource: {}, all: 0 }
    if (!value || typeof value !== "object" || Array.isArray(value))
        return result
    const input = value as Partial<UnseenDelta>
    if (Number.isSafeInteger(input.all) && input.all >= 0)
        result.all = input.all
    if (
        input.bySource &&
        typeof input.bySource === "object" &&
        !Array.isArray(input.bySource)
    ) {
        for (const [key, count] of Object.entries(input.bySource)) {
            const sid = Number(key)
            if (
                String(sid) === key &&
                Number.isSafeInteger(sid) &&
                sid >= 0 &&
                Number.isSafeInteger(count) &&
                count > 0
            )
                result.bySource[sid] = count
        }
    }
    return result
}

export function normalizeOpenFolders(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return [
        ...new Set(
            value.filter(
                (key): key is string =>
                    typeof key === "string" &&
                    /^folder:[1-9]\d*$/.test(key) &&
                    Number.isSafeInteger(Number(key.slice(7)))
            )
        ),
    ]
}
