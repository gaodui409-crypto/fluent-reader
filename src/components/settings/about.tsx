import * as React from "react"
import intl from "react-intl-universal"
import { Stack, Link, Separator } from "@fluentui/react"
import { ShortcutsSection } from "./personal/NetworkHealthShortcutsSections"

const AboutTab: React.FC = () => {
    return (
        <div className="tab-body">
            <ShortcutsSection />
            <div style={{ marginTop: 24 }}>
                <Separator>{intl.get("settings.about")}</Separator>
            </div>
            <Stack
                className="settings-about"
                horizontalAlign="center"
                tokens={{ childrenGap: 6 }}>
                <img
                    src="icons/logo.svg"
                    alt="Fluent Reader Logo"
                    style={{ width: 88, height: 88 }}
                />
                <h3 style={{ fontWeight: 600 }}>Fluent Reader Personal</h3>
                <small>
                    {intl.get("settings.version")}{" "}
                    {globalThis.utils.getVersion()}
                </small>
                <p className="settings-hint">
                    Copyright © 2020 Haoyuan Liu. All rights reserved.
                </p>
                <Stack
                    horizontal
                    horizontalAlign="center"
                    tokens={{ childrenGap: 16 }}>
                    <small>
                        <Link
                            onClick={() =>
                                globalThis.utils.openExternal(
                                    "https://github.com/yang991178/fluent-reader"
                                )
                            }>
                            {intl.get("settings.openSource")}
                        </Link>
                    </small>
                    <small>
                        <Link
                            onClick={() =>
                                globalThis.utils.openExternal(
                                    "https://github.com/yang991178/fluent-reader/issues"
                                )
                            }>
                            {intl.get("settings.feedback")}
                        </Link>
                    </small>
                </Stack>
            </Stack>
        </div>
    )
}

export default AboutTab
