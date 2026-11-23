import * as React from "react"
import { RSSSource, SourceOpenTarget } from "../../scripts/models/source"
import { RSSItem } from "../../scripts/models/item"
import { platformCtrl } from "../../scripts/utils"
import { FeedFilter } from "../../scripts/models/feed"
import { ViewConfigs } from "../../schema-types"
import { rootStore } from "../../scripts/reducer"
import { resolveSourcePreferences } from "../../source-preferences"

export namespace Card {
    export type Props = {
        feedId: string
        item: RSSItem
        source: RSSSource
        filter: FeedFilter
        selected?: boolean
        viewConfigs?: ViewConfigs
        shortcuts: (item: RSSItem, e: KeyboardEvent) => void
        markRead: (item: RSSItem) => void
        contextMenu: (feedId: string, item: RSSItem, e) => void
        showItem: (fid: string, item: RSSItem) => void
    }

    const openInBrowser = (props: Props, e: React.MouseEvent) => {
        void window.personal.opened?.(props.item._id).catch(console.error)
        props.markRead(props.item)
        window.utils.openExternal(props.item.link, platformCtrl(e))
    }

    export const bindEventsToProps = (props: Props) => ({
        style: props.item.highlight
            ? { boxShadow: `inset 4px 0 ${props.item.highlight}` }
            : undefined,
        onClick: (e: React.MouseEvent) => onClick(props, e),
        onMouseUp: (e: React.MouseEvent) => onMouseUp(props, e),
        onKeyDown: (e: React.KeyboardEvent) => onKeyDown(props, e),
    })

    const onClick = (props: Props, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const state = rootStore.getState()
        switch (
            state.reading.collections[state.app.menuKey]?.openTarget ??
            resolveSourcePreferences(
                props.source,
                state.groups,
                state.preferences
            ).openTarget
        ) {
            case SourceOpenTarget.External: {
                openInBrowser(props, e)
                break
            }
            default: {
                // Set active itemId first so markRead defers removeLaterOnRead
                // until the user finishes reading and moves away from this item.
                props.showItem(props.feedId, props.item)
                props.markRead(props.item)
                break
            }
        }
    }

    const onMouseUp = (props: Props, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        switch (e.button) {
            case 1:
                openInBrowser(props, e)
                break
            case 2:
                props.contextMenu(props.feedId, props.item, e)
        }
    }

    const onKeyDown = (props: Props, e: React.KeyboardEvent) => {
        props.shortcuts(props.item, e.nativeEvent)
    }
}
