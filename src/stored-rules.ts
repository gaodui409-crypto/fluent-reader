import type { StoredRules } from "./schema-types"

/** electron-store caches are deeply frozen; migrations always return a copy. */
export function migrateStoredRules(stored: StoredRules): StoredRules {
    if (!stored || typeof stored !== "object" || Array.isArray(stored))
        throw new Error(
            "Invalid stored rules. The original settings have been preserved."
        )
    return Object.fromEntries(
        Object.entries(stored).map(([key, rules]) => {
            if (
                !Array.isArray(rules) ||
                rules.some(rule => !rule || !Array.isArray(rule.actions))
            )
                throw new Error("Invalid stored rule list: " + key)
            return [
                key,
                rules.map(rule => ({
                    ...rule,
                    enabled: rule.enabled !== false,
                })),
            ]
        })
    ) as StoredRules
}
