import type {
    PreferenceOverrides,
    SourcePreferences,
} from "../../source-preferences"
import { resolveSourcePreferences } from "../../source-preferences"
import type { AppThunk } from "../utils"
import { useSelector } from "react-redux"
import type { RootState } from "../reducer"
import type { RSSSource } from "./source"

const SET_PREFERENCES = "SET_PREFERENCES"
export const emptyPreferences: PreferenceOverrides = { sources: {}, groups: {} }

export function preferencesReducer(
    state: PreferenceOverrides = emptyPreferences,
    action: { type: string; preferences?: PreferenceOverrides }
) {
    return action.type === SET_PREFERENCES ? action.preferences : state
}

export function loadPreferences(): AppThunk<Promise<void>> {
    return async dispatch => {
        const preferences = await window.personal.preferences()
        dispatch({ type: SET_PREFERENCES, preferences })
    }
}

export function savePreferences(
    target: { sids: number[] } | { gid: number },
    patch: Partial<SourcePreferences>,
    clear: (keyof SourcePreferences)[]
): AppThunk<Promise<void>> {
    return async dispatch => {
        const preferences = await window.personal.savePreferences(
            target,
            patch,
            clear
        )
        dispatch({ type: SET_PREFERENCES, preferences })
    }
}

export function useSourcePreferences(source: RSSSource) {
    const groups = useSelector((state: RootState) => state.groups)
    const overrides = useSelector((state: RootState) => state.preferences)
    return resolveSourcePreferences(source, groups, overrides)
}

export function openSourcePreferences(
    target: { sids: number[] } | { gid: number }
) {
    window.dispatchEvent(
        new CustomEvent("source-preferences", { detail: target })
    )
}
