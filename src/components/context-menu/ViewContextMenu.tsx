import * as React from "react"
import intl from "react-intl-universal"
import {
    IContextualMenuItem,
    ContextualMenuItemType,
} from "@fluentui/react/lib/ContextualMenu"
import { ViewType } from "../../schema-types"
import { FilterType } from "../../scripts/models/feed"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import {
    switchFilter,
    switchView,
    toggleFilter,
} from "../../scripts/models/page"
import { ContextMenuBase } from "./shared"

export function ViewContextMenu() {
    const dispatch = useAppDispatch()
    const viewType = useAppSelector(state => state.page.viewType)
    const filter = useAppSelector(state => state.page.filter.type)

    const menuItems: IContextualMenuItem[] = [
        {
            key: "section_1",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                title: intl.get("context.view"),
                bottomDivider: true,
                items: [
                    {
                        key: "cardView",
                        text: intl.get("context.cardView"),
                        iconProps: { iconName: "GridViewMedium" },
                        canCheck: true,
                        checked: viewType === ViewType.Cards,
                        onClick: () => dispatch(switchView(ViewType.Cards)),
                    },
                    {
                        key: "listView",
                        text: intl.get("context.listView"),
                        iconProps: { iconName: "BacklogList" },
                        canCheck: true,
                        checked: viewType === ViewType.List,
                        onClick: () => dispatch(switchView(ViewType.List)),
                    },
                    {
                        key: "magazineView",
                        text: intl.get("context.magazineView"),
                        iconProps: { iconName: "Articles" },
                        canCheck: true,
                        checked: viewType === ViewType.Magazine,
                        onClick: () => dispatch(switchView(ViewType.Magazine)),
                    },
                    {
                        key: "compactView",
                        text: intl.get("context.compactView"),
                        iconProps: { iconName: "BulletedList" },
                        canCheck: true,
                        checked: viewType === ViewType.Compact,
                        onClick: () => dispatch(switchView(ViewType.Compact)),
                    },
                ],
            },
        },
        {
            key: "section_2",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                title: intl.get("context.filter"),
                bottomDivider: true,
                items: [
                    {
                        key: "allArticles",
                        text: intl.get("allArticles"),
                        iconProps: { iconName: "ClearFilter" },
                        canCheck: true,
                        checked:
                            (filter & ~FilterType.Toggles) ==
                            FilterType.Default,
                        onClick: () =>
                            dispatch(switchFilter(FilterType.Default)),
                    },
                    {
                        key: "unreadOnly",
                        text: intl.get("context.unreadOnly"),
                        iconProps: {
                            iconName: "RadioBtnOn",
                            style: {
                                fontSize: 14,
                                textAlign: "center",
                            },
                        },
                        canCheck: true,
                        checked:
                            (filter & ~FilterType.Toggles) ==
                            FilterType.UnreadOnly,
                        onClick: () =>
                            dispatch(switchFilter(FilterType.UnreadOnly)),
                    },
                    {
                        key: "starredOnly",
                        text: intl.get("context.starredOnly"),
                        iconProps: { iconName: "FavoriteStarFill" },
                        canCheck: true,
                        checked:
                            (filter & ~FilterType.Toggles) ==
                            FilterType.StarredOnly,
                        onClick: () =>
                            dispatch(switchFilter(FilterType.StarredOnly)),
                    },
                ],
            },
        },
        {
            key: "section_3",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                title: intl.get("search"),
                bottomDivider: true,
                items: [
                    {
                        key: "caseSensitive",
                        text: intl.get("context.caseSensitive"),
                        iconProps: {
                            style: {
                                fontSize: 12,
                                fontStyle: "normal",
                            },
                            children: "Aa",
                        },
                        canCheck: true,
                        checked: !(filter & FilterType.CaseInsensitive),
                        onClick: () =>
                            dispatch(toggleFilter(FilterType.CaseInsensitive)),
                    },
                    {
                        key: "fullSearch",
                        text: intl.get("context.fullSearch"),
                        iconProps: { iconName: "Breadcrumb" },
                        canCheck: true,
                        checked: Boolean(filter & FilterType.FullSearch),
                        onClick: () =>
                            dispatch(toggleFilter(FilterType.FullSearch)),
                    },
                ],
            },
        },
        {
            key: "showHidden",
            text: intl.get("context.showHidden"),
            canCheck: true,
            checked: Boolean(filter & FilterType.ShowHidden),
            onClick: () => dispatch(toggleFilter(FilterType.ShowHidden)),
        },
    ]
    return <ContextMenuBase menuItems={menuItems} />
}
