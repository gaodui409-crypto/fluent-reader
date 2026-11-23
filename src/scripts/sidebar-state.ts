import type { UnseenDelta } from "../schema-types"
import { normalizeOpenFolders, normalizeUnseenDelta } from "../sidebar-state"

function loadState<T>(
    key: string,
    read: () => T | null,
    write: (value: T) => Promise<void>,
    normalize: (value: unknown) => T
): T {
    try {
        const stored = read()
        if (stored !== null && stored !== undefined) return normalize(stored)
    } catch {
        // A failed read must not overwrite a potentially valid persisted value.
        return normalize(undefined)
    }
    let value = normalize(undefined)
    try {
        value = normalize(JSON.parse(localStorage.getItem(key) || "null"))
    } catch {
        // Missing or corrupt legacy data uses the safe default.
    }
    // Invoke immediately so later user changes are queued after this migration.
    try {
        void write(value)
            .then(() => {
                try {
                    localStorage.removeItem(key)
                } catch {
                    /* Storage may be unavailable. */
                }
            })
            .catch(() => {})
    } catch {
        /* Preserve legacy data when the bridge is unavailable. */
    }
    return value
}

export function loadStoredUnseen(): UnseenDelta {
    return loadState(
        "personal:unseenDelta",
        () => window.settings.getUnseenDelta(),
        value => window.settings.setUnseenDelta(value),
        normalizeUnseenDelta
    )
}

export function saveStoredUnseen(
    bySource: Record<number, number>,
    all: number
) {
    try {
        void window.settings
            .setUnseenDelta(normalizeUnseenDelta({ bySource, all }))
            .catch(() => {})
    } catch {
        /* Preserve the in-memory state if persistence is unavailable. */
    }
}

export function loadOpenFolders(): Set<string> {
    return new Set(
        loadState(
            "personal:openFolders",
            () => window.settings.getOpenFolders(),
            value => window.settings.setOpenFolders(value),
            normalizeOpenFolders
        )
    )
}

export function saveOpenFolders(folders: Set<string>) {
    try {
        void window.settings
            .setOpenFolders(normalizeOpenFolders([...folders]))
            .catch(() => {})
    } catch {
        /* Preserve the in-memory state if persistence is unavailable. */
    }
}
