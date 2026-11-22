import * as React from "react"
import intl from "react-intl-universal"
import {
    IContextualMenuItem,
    ContextualMenuItemType,
} from "@fluentui/react/lib/ContextualMenu"
import { platformCtrl } from "../../scripts/utils"
import { ImageCallbackTypes } from "../../schema-types"
import { useAppSelector } from "../../scripts/reducer"
import { ContextMenuBase, getSearchItem } from "./shared"

export function TextContextMenu() {
    const target = useAppSelector(state => state.app.contextMenu.target) as [
        string,
        string
    ]
    const text = target?.[0] || ""
    const url = target?.[1] || ""
    const menuItems: IContextualMenuItem[] = text
        ? [
              {
                  key: "copyText",
                  text: intl.get("context.copy"),
                  iconProps: { iconName: "Copy" },
                  onClick: () => {
                      globalThis.utils.writeClipboard(text)
                  },
              },
              getSearchItem(text),
          ]
        : []
    if (url) {
        menuItems.push({
            key: "urlSection",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                topDivider: menuItems.length > 0,
                items: [
                    {
                        key: "openInBrowser",
                        text: intl.get("openExternal"),
                        iconProps: {
                            iconName: "NavigateExternalInline",
                        },
                        onClick: e => {
                            globalThis.utils.openExternal(url, platformCtrl(e))
                        },
                    },
                    {
                        key: "copyURL",
                        text: intl.get("context.copyURL"),
                        iconProps: { iconName: "Link" },
                        onClick: () => {
                            globalThis.utils.writeClipboard(url)
                        },
                    },
                ],
            },
        })
    }
    return <ContextMenuBase menuItems={menuItems} />
}

export function ImageContextMenu() {
    const menuItems: IContextualMenuItem[] = [
        {
            key: "openInBrowser",
            text: intl.get("openExternal"),
            iconProps: { iconName: "NavigateExternalInline" },
            onClick: e => {
                if (platformCtrl(e)) {
                    globalThis.utils.imageCallback(
                        ImageCallbackTypes.OpenExternalBg
                    )
                } else {
                    globalThis.utils.imageCallback(
                        ImageCallbackTypes.OpenExternal
                    )
                }
            },
        },
        {
            key: "saveImageAs",
            text: intl.get("context.saveImageAs"),
            iconProps: { iconName: "SaveTemplate" },
            onClick: () => {
                globalThis.utils.imageCallback(ImageCallbackTypes.SaveAs)
            },
        },
        {
            key: "copyImage",
            text: intl.get("context.copyImage"),
            iconProps: { iconName: "FileImage" },
            onClick: () => {
                globalThis.utils.imageCallback(ImageCallbackTypes.Copy)
            },
        },
        {
            key: "copyImageURL",
            text: intl.get("context.copyImageURL"),
            iconProps: { iconName: "Link" },
            onClick: () => {
                globalThis.utils.imageCallback(ImageCallbackTypes.CopyLink)
            },
        },
    ]
    return <ContextMenuBase menuItems={menuItems} />
}
