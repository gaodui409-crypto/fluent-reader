import * as React from "react"
import intl from "react-intl-universal"
import { QRCodeSVG } from "qrcode.react"
import {
    ContextualMenu,
    IContextualMenuItem,
    DirectionalHint,
} from "@fluentui/react/lib/ContextualMenu"
import { cutText, webSearch, getSearchEngineName } from "../../scripts/utils"
import { closeContextMenu } from "../../scripts/models/app"
import { RSSItem } from "../../scripts/models/item"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"

export const renderShareQR = (item: IContextualMenuItem) => (
    <div className="qr-container">
        <QRCodeSVG value={item.url} size={150} />
    </div>
)

export const shareSubmenu = (item: RSSItem): IContextualMenuItem[] => [
    { key: "qr", url: item.link, onRender: renderShareQR },
]

export function getSearchItem(text: string): IContextualMenuItem {
    const engine = globalThis.settings.getSearchEngine()
    return {
        key: "searchText",
        text: intl.get("context.search", {
            text: cutText(text, 15),
            engine: getSearchEngineName(engine),
        }),
        iconProps: { iconName: "Search" },
        onClick: () => webSearch(text, engine),
    }
}

export function ContextMenuBase({
    menuItems,
}: Readonly<{ menuItems: IContextualMenuItem[] }>) {
    const { event, position } = useAppSelector(state => state.app.contextMenu)
    const dispatch = useAppDispatch()

    return (
        <ContextualMenu
            directionalHint={DirectionalHint.bottomLeftEdge}
            items={menuItems}
            target={
                event ||
                (position && {
                    left: position[0],
                    top: position[1],
                })
            }
            onDismiss={() => dispatch(closeContextMenu())}
        />
    )
}
