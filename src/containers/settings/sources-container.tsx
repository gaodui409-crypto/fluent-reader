import intl from "react-intl-universal"
import { connect } from "react-redux"
import { createSelector } from "reselect"
import { RootState } from "../../scripts/reducer"
import SourcesTab from "../../components/settings/sources"
import {
    addSource,
    RSSSource,
    updateSource,
    deleteSource,
    SourceOpenTarget,
    deleteSources,
    toggleSourceHidden,
} from "../../scripts/models/source"
import { importOPML, exportOPML } from "../../scripts/models/group"
import { AppDispatch, urlTest, validateFavicon } from "../../scripts/utils"
import { saveSettings, toggleSettings } from "../../scripts/models/app"
import { SyncService } from "../../schema-types"
import { resolveSourcePreferences } from "../../source-preferences"
import { savePreferences } from "../../scripts/models/preferences"

const getSources = (state: RootState) => state.sources
const getServiceOn = (state: RootState) =>
    state.service.type !== SyncService.None
const getSIDs = (state: RootState) => state.app.settings.sids

const mapStateToProps = createSelector(
    [
        getSources,
        getServiceOn,
        getSIDs,
        (state: RootState) => state.groups,
        (state: RootState) => state.preferences,
    ],
    (sources, serviceOn, sids, groups, preferences) => ({
        sources: Object.fromEntries(
            Object.entries(sources).map(([id, source]) => {
                const effective = resolveSourcePreferences(
                    source,
                    groups,
                    preferences
                )
                return [
                    id,
                    {
                        ...source,
                        openTarget: effective.openTarget,
                        fetchFrequency: effective.fetchFrequency,
                    },
                ]
            })
        ),
        groups,
        serviceOn: serviceOn,
        sids: sids,
    })
)

const mapDispatchToProps = (dispatch: AppDispatch) => {
    return {
        acknowledgeSIDs: () => dispatch(toggleSettings(true)),
        addSource: (url: string) => dispatch(addSource(url)),
        updateSourceName: (source: RSSSource, name: string) => {
            void dispatch(updateSource({ ...source, name: name } as RSSSource))
        },
        updateSourceUrl: async (
            source: RSSSource,
            url: string
        ): Promise<boolean> => {
            const trimmed = url.trim()
            if (!/^https?:\/\/\S+$/i.test(trimmed) || !urlTest(trimmed)) {
                window.utils.showErrorBox(intl.get("sources.badUrl"), trimmed)
                return false
            }
            let duplicate = false
            dispatch((_, getState) => {
                duplicate = Object.values(getState().sources).some(
                    other =>
                        other.sid !== source.sid &&
                        !other.archived &&
                        other.url === trimmed
                )
            })
            if (duplicate) {
                window.utils.showErrorBox(intl.get("sources.exist"), trimmed)
                return false
            }
            dispatch(saveSettings())
            try {
                await dispatch(
                    updateSource({ ...source, url: trimmed } as RSSSource)
                )
                return true
            } catch (error) {
                const msg = String(error)
                window.utils.showErrorBox(
                    msg.includes("UNIQUE constraint failed")
                        ? intl.get("sources.exist")
                        : intl.get("personal.failed"),
                    msg
                )
                return false
            } finally {
                dispatch(saveSettings())
            }
        },
        updateSourceIcon: async (source: RSSSource, iconUrl: string) => {
            dispatch(saveSettings())
            if (await validateFavicon(iconUrl)) {
                await dispatch(updateSource({ ...source, iconurl: iconUrl }))
            } else {
                window.utils.showErrorBox(intl.get("sources.badIcon"), "")
            }
            dispatch(saveSettings())
        },
        updateSourceOpenTarget: (
            source: RSSSource,
            target: SourceOpenTarget
        ) => {
            void dispatch(
                savePreferences(
                    { sids: [source.sid] },
                    { openTarget: target },
                    []
                )
            ).catch(error =>
                window.utils.showErrorBox(
                    intl.get("personal.failed"),
                    String(error)
                )
            )
        },
        updateFetchFrequency: (source: RSSSource, frequency: number) => {
            void dispatch(
                savePreferences(
                    { sids: [source.sid] },
                    { fetchFrequency: frequency },
                    []
                )
            ).catch(error =>
                window.utils.showErrorBox(
                    intl.get("personal.failed"),
                    String(error)
                )
            )
        },
        deleteSource: (source: RSSSource) => dispatch(deleteSource(source)),
        deleteSources: (sources: RSSSource[]) =>
            dispatch(deleteSources(sources)),
        importOPML: () => dispatch(importOPML()),
        exportOPML: () => dispatch(exportOPML()),
        toggleSourceHidden: (source: RSSSource) =>
            dispatch(toggleSourceHidden(source)),
    }
}

const SourcesTabContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(SourcesTab)
export default SourcesTabContainer
