import intl from "react-intl-universal"
import { ContextualMenuItemType, IContextualMenuProps } from "@fluentui/react"
import { RSSItem } from "../../scripts/models/item"
import { RSSSource, SourceTextDirection } from "../../scripts/models/source"
import { shareSubmenu } from "../context-menu"
import { openOffline } from "../../scripts/models/library"
import { platformCtrl } from "../../scripts/utils"

export const FONT_SIZE_OPTIONS = [13, 14, 15, 16, 17, 18, 19, 20, 22, 24]

export function buildMoreMenuProps(opts: {
    item: RSSItem
    source: RSSSource
    savedOffline: boolean
    canFetchFull: boolean
    loadFull: boolean
    loadWebpage: boolean
    fontFamily: string
    fontSize: number
    onRefetchFull: () => void
    onToggleHidden: () => void
    onUpdateFont: (font: string) => void
    onUpdateFontSize: (size: number) => void
    onUpdateDirection: (dir: SourceTextDirection) => void
    onDeleteOffline: () => void
    onOpenSiteRules: () => void
}): IContextualMenuProps {
    const {
        item,
        source,
        savedOffline,
        canFetchFull,
        loadFull,
        loadWebpage,
        fontFamily,
        fontSize,
        onRefetchFull,
        onToggleHidden,
        onUpdateFont,
        onUpdateFontSize,
        onUpdateDirection,
        onDeleteOffline,
        onOpenSiteRules,
    } = opts

    const hasHttpLink = /^https?:\/\//i.test(item.link)

    const fontSizeMenuProps: IContextualMenuProps = {
        items: FONT_SIZE_OPTIONS.map(size => ({
            key: String(size),
            text: `${size} px`,
            canCheck: true,
            checked: size === fontSize,
            onClick: () => onUpdateFontSize(size),
        })),
    }

    const fontFamilyMenuProps: IContextualMenuProps = {
        items: (window.fontList || [""]).map((font, idx) => ({
            key: String(idx),
            text: font === "" ? intl.get("default") : font,
            canCheck: true,
            checked: fontFamily === font,
            onClick: () => onUpdateFont(font),
        })),
    }

    const directionMenuProps: IContextualMenuProps = {
        items: [
            {
                key: "LTR",
                text: intl.get("article.LTR"),
                iconProps: { iconName: "Forward" },
                canCheck: true,
                checked: source.textDir === SourceTextDirection.LTR,
                onClick: () => onUpdateDirection(SourceTextDirection.LTR),
            },
            {
                key: "RTL",
                text: intl.get("article.RTL"),
                iconProps: { iconName: "Back" },
                canCheck: true,
                checked: source.textDir === SourceTextDirection.RTL,
                onClick: () => onUpdateDirection(SourceTextDirection.RTL),
            },
            {
                key: "Vertical",
                text: intl.get("article.Vertical"),
                iconProps: { iconName: "Down" },
                canCheck: true,
                checked: source.textDir === SourceTextDirection.Vertical,
                onClick: () => onUpdateDirection(SourceTextDirection.Vertical),
            },
        ],
    }

    return {
        items: [
            ...(savedOffline
                ? [
                      {
                          key: "local",
                          text: intl.get("personal.openOffline"),
                          iconProps: { iconName: "OfflineStorage" },
                          onClick: () => openOffline(item._id),
                      },
                      {
                          key: "folder",
                          text: intl.get("personal.showFile"),
                          iconProps: { iconName: "FolderOpen" },
                          onClick: () => openOffline(item._id, true),
                      },
                      {
                          key: "deleteOffline",
                          text: "删除本地副本",
                          iconProps: { iconName: "Delete" },
                          onClick: onDeleteOffline,
                      },
                      {
                          key: "divider_offline",
                          itemType: ContextualMenuItemType.Divider,
                      },
                  ]
                : []),
            {
                key: "refetch",
                text: intl.get("personal.refetch"),
                disabled: !hasHttpLink || (!canFetchFull && !loadFull),
                iconProps: { iconName: "Refresh" },
                onClick: onRefetchFull,
            },
            {
                key: "loginSite",
                text: "登录此网站…",
                disabled: !hasHttpLink,
                iconProps: { iconName: "Permissions" },
                onClick: () => {
                    void window.personal
                        .login(item.link)
                        .catch(err =>
                            window.utils.showErrorBox(
                                intl.get("personal.failed"),
                                String(err)
                            )
                        )
                },
            },
            {
                key: "siteRules",
                text: "配置此站正文提取规则…",
                disabled: !hasHttpLink,
                iconProps: { iconName: "Settings" },
                onClick: onOpenSiteRules,
            },
            {
                key: "divider_site",
                itemType: ContextualMenuItemType.Divider,
            },
            {
                key: "openInBrowser",
                text: intl.get("openExternal"),
                iconProps: { iconName: "NavigateExternalInline" },
                onClick: e => {
                    void window.personal.opened?.(item._id).catch(console.error)
                    window.utils.openExternal(item.link, platformCtrl(e))
                },
            },
            {
                key: "copyURL",
                text: intl.get("context.copyURL"),
                iconProps: { iconName: "Link" },
                onClick: () => {
                    window.utils.writeClipboard(item.link)
                },
            },
            {
                key: "toggleHidden",
                text: item.hidden
                    ? intl.get("article.unhide")
                    : intl.get("article.hide"),
                iconProps: {
                    iconName: item.hidden ? "View" : "Hide3",
                },
                onClick: onToggleHidden,
            },
            {
                key: "fontMenu",
                text: intl.get("article.font"),
                iconProps: { iconName: "Font" },
                disabled: loadWebpage,
                subMenuProps: fontFamilyMenuProps,
            },
            {
                key: "fontSizeMenu",
                text: intl.get("article.fontSize"),
                iconProps: { iconName: "FontSize" },
                disabled: loadWebpage,
                subMenuProps: fontSizeMenuProps,
            },
            {
                key: "directionMenu",
                text: intl.get("article.textDir"),
                iconProps: { iconName: "ChangeEntitlements" },
                disabled: loadWebpage,
                subMenuProps: directionMenuProps,
            },
            {
                key: "divider_1",
                itemType: ContextualMenuItemType.Divider,
            },
            ...shareSubmenu(item),
        ],
    }
}
