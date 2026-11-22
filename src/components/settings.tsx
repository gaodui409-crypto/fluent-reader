import * as React from "react"
import { useEffect, useRef, useCallback } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { AnimationClassNames } from "@fluentui/react/lib/Styling"
import AboutTab from "./settings/about"
import PersonalTab from "./settings/personal"
import { Pivot, PivotItem, FocusTrapZone } from "@fluentui/react"
import SourcesTabContainer from "../containers/settings/sources-container"
import GroupsTab from "./settings/groups"
import AppTabContainer from "../containers/settings/app-container"
import RulesTab from "./settings/rules"
import ServiceTabContainer from "../containers/settings/service-container"
import { initTouchBarWithTexts } from "../scripts/utils"
import { useAppSelector, useAppDispatch } from "../scripts/reducer"
import { exitSettings } from "../scripts/models/app"
import { makeStyles, Spinner } from "@fluentui/react-components"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"

const useSettingsClasses = makeStyles({
    pivot: { height: "100%" },
    settingsGroup: {
        position: "absolute",
        top: "70px",
        left: "max(12px, calc(50% - 444px))",
        zIndex: 2,
    },
})

const Settings: React.FC = () => {
    const dispatch = useAppDispatch()
    const settingsClasses = useSettingsClasses()
    const [selectedTab, setSelectedTab] = React.useState<string>()

    const display = useAppSelector(s => s.app.settings.display)
    const blocked = useAppSelector(
        s =>
            !s.app.sourceInit ||
            s.app.syncing ||
            s.app.fetchingItems ||
            s.app.settings.saving
    )
    const exitting = useAppSelector(s => s.app.settings.saving)

    const exittingRef = useRef(exitting)
    exittingRef.current = exitting

    const close = useCallback(() => dispatch(exitSettings()), [dispatch])

    useEffect(() => {
        const jumpPersonal = () => setSelectedTab("personal")
        window.addEventListener("open-personal-section", jumpPersonal)
        return () =>
            window.removeEventListener("open-personal-section", jumpPersonal)
    }, [])

    useEffect(() => {
        if (!display) setSelectedTab(undefined)
    }, [display])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || exittingRef.current) return
            if (event.defaultPrevented) return
            // Do not close the entire Settings screen when a visible child Dialog, Modal, or Dropdown Callout is open
            if (
                Array.from(
                    document.querySelectorAll<HTMLElement>(
                        ".ms-Dialog-main, .ms-Modal-scrollableContent, .fui-DialogSurface, .ms-ContextualMenu, .ms-Dropdown-callout, .ms-ComboBox-callout, .ms-DatePicker-callout, .fui-MenuPopover, .fui-Listbox"
                    )
                ).some(
                    el =>
                        el.getClientRects().length > 0 &&
                        getComputedStyle(el).visibility !== "hidden"
                )
            ) {
                return
            }
            close()
        }
        if (display) {
            if (globalThis.utils.platform === "darwin")
                globalThis.utils.destroyTouchBar()
            document.body.addEventListener("keydown", onKeyDown)
        } else if (globalThis.utils.platform === "darwin") {
            initTouchBarWithTexts()
        }
        return () => {
            document.body.removeEventListener("keydown", onKeyDown)
        }
    }, [display, close])

    return (
        display && (
            <div className="settings-container">
                <FlatButtonGroup styleClass={settingsClasses.settingsGroup}>
                    <FlatButton
                        disabled={exitting}
                        title={intl.get("settings.exit")}
                        ariaLabel={intl.get("settings.exit")}
                        onClick={close}>
                        <Icon iconName="Back" />
                    </FlatButton>
                </FlatButtonGroup>
                <div className={"settings " + AnimationClassNames.slideUpIn20}>
                    {blocked && (
                        <FocusTrapZone
                            isClickableOutsideFocusTrap={true}
                            className="loading">
                            <Spinner
                                label={intl.get("settings.fetching")}
                                labelPosition="below"
                                size="tiny"
                                tabIndex={0}
                            />
                        </FocusTrapZone>
                    )}
                    <Pivot
                        className={settingsClasses.pivot}
                        overflowBehavior="menu"
                        selectedKey={selectedTab}
                        onLinkClick={item =>
                            item && setSelectedTab(item.props.itemKey)
                        }>
                        <PivotItem
                            itemKey="sources"
                            headerText={intl.get("settings.sources")}
                            itemIcon="Source">
                            <SourcesTabContainer />
                        </PivotItem>
                        <PivotItem
                            itemKey="grouping"
                            headerText={intl.get("settings.grouping")}
                            itemIcon="GroupList">
                            <GroupsTab />
                        </PivotItem>
                        <PivotItem
                            itemKey="rules"
                            headerText={intl.get("settings.rules")}
                            itemIcon="FilterSettings">
                            <RulesTab />
                        </PivotItem>
                        <PivotItem
                            itemKey="service"
                            headerText={intl.get("settings.service")}
                            itemIcon="CloudImportExport">
                            <ServiceTabContainer />
                        </PivotItem>
                        <PivotItem
                            itemKey="app"
                            headerText={intl.get("settings.app")}
                            itemIcon="Settings">
                            <AppTabContainer />
                        </PivotItem>
                        <PivotItem
                            itemKey="about"
                            headerText={intl.get("settings.about")}
                            itemIcon="Info">
                            <AboutTab />
                        </PivotItem>
                        <PivotItem
                            itemKey="personal"
                            headerText={intl.get("personal.settings")}
                            itemIcon="Library">
                            <PersonalTab />
                        </PivotItem>
                    </Pivot>
                </div>
            </div>
        )
    )
}

export default Settings
