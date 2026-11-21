import { ReadingPreferences } from "../../reading-preferences"
import { AppThunk } from "../utils"
import intl from "react-intl-universal"

let pendingSave: Promise<void> = Promise.resolve()

export function readingReducer(
    state = window.settings.getReadingPreferences(),
    action: { type: string; reading?: ReadingPreferences }
) {
    return action.type === "READING_PREFERENCES" ? action.reading : state
}

export function saveReadingPreferences(
    patch: Partial<ReadingPreferences>
): AppThunk<Promise<void>> {
    return async (dispatch, getState) => {
        const previous = getState().reading
        const reading = { ...previous, ...patch }
        dispatch({ type: "READING_PREFERENCES", reading })
        pendingSave = pendingSave
            .then(() => window.settings.setReadingPreferences(reading))
            .catch(error => {
                if (getState().reading === reading)
                    dispatch({ type: "READING_PREFERENCES", reading: previous })
                void window.utils.showErrorBox(
                    intl.get("personal.failed"),
                    String(error)
                )
            })
        await pendingSave
    }
}
