import { ViewType } from "./schema-types"

export type ReaderWidthMode = "narrow" | "standard" | "wide"
export type CollectionPreference = { view?: ViewType; openTarget?: number }
export type ReadingPreferences = {
    hoverSummary: boolean
    collapseList: boolean
    readerWidth?: ReaderWidthMode
    lineHeight?: number
    collections: Record<string, CollectionPreference>
}
export const defaultReadingPreferences: ReadingPreferences = {
    hoverSummary: false,
    collapseList: false,
    readerWidth: "standard",
    lineHeight: 1.82,
    collections: {},
}

export function collectionKey(key: string) {
    return key === "later:" ||
        key === "starred:" ||
        key === "saved:" ||
        key === "library:" ||
        /^s-\d+$/.test(key) ||
        /^g-\d+$/.test(key) ||
        key.startsWith("folder:")
        ? key
        : ""
}
