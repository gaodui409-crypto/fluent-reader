import { ViewType } from "./schema-types"

export type CollectionPreference = { view?: ViewType; openTarget?: number }
export type ReadingPreferences = {
    hoverSummary: boolean
    collapseList: boolean
    collections: Record<string, CollectionPreference>
}
export const defaultReadingPreferences: ReadingPreferences = {
    hoverSummary: false,
    collapseList: false,
    collections: {},
}

export function collectionKey(key: string) {
    return key === "later:" ||
        /^s-\d+$/.test(key) ||
        key === "starred:" ||
        key.startsWith("folder:") ||
        key === "library:"
        ? key
        : ""
}
