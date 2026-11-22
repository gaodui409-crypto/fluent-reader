import * as React from "react"
import { ContextMenuType } from "../scripts/models/app"
import { useAppSelector } from "../scripts/reducer"
import { ItemContextMenu } from "./context-menu/ItemContextMenu"
import {
    ImageContextMenu,
    TextContextMenu,
} from "./context-menu/WebviewContextMenus"
import { ViewContextMenu } from "./context-menu/ViewContextMenu"
import {
    GroupContextMenu,
    MarkReadContextMenu,
} from "./context-menu/FeedScopeContextMenus"

export { renderShareQR, shareSubmenu } from "./context-menu/shared"

export function ContextMenu() {
    const { type } = useAppSelector(state => state.app.contextMenu)

    switch (type) {
        case ContextMenuType.Hidden:
            return null
        case ContextMenuType.Item:
            return <ItemContextMenu />
        case ContextMenuType.Text:
            return <TextContextMenu />
        case ContextMenuType.Image:
            return <ImageContextMenu />
        case ContextMenuType.View:
            return <ViewContextMenu />
        case ContextMenuType.Group:
            return <GroupContextMenu />
        case ContextMenuType.MarkRead:
            return <MarkReadContextMenu />
    }
}
