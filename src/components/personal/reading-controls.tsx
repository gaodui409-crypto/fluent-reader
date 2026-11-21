import * as React from "react"
import intl from "react-intl-universal"
import { Dropdown } from "@fluentui/react"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { collectionKey } from "../../reading-preferences"
import { saveReadingPreferences } from "../../scripts/models/reading"
import { toggleFilter } from "../../scripts/models/page"
import { FilterType } from "../../scripts/models/feed"
import { FlatButton } from "../utils/FlatButton"
import { makeStyles } from "@griffel/react"

const useStyles = makeStyles({
    button: {
        width: "auto",
        paddingLeft: "10px",
        paddingRight: "10px",
        whiteSpace: "nowrap",
        fontSize: "12px",
    },
})
export function ReadingControls() {
    const dispatch = useAppDispatch()
    const classes = useStyles()
    const key = useAppSelector(s => collectionKey(s.app.menuKey))
    const collections = useAppSelector(s => s.reading.collections)
    const unread = useAppSelector(
        s => !(s.page.filter.type & FilterType.ShowRead)
    )
    return (
        <>
            <FlatButton
                styleClass={classes.button}
                title={intl.get("organize.filterHint")}
                onClick={() => dispatch(toggleFilter(FilterType.ShowRead))}>
                {intl.get(
                    unread ? "organize.unreadOnly" : "organize.allStates"
                )}
            </FlatButton>
            {key && (
                <Dropdown
                    ariaLabel={intl.get("organize.openMode")}
                    selectedKey={collections[key]?.openTarget ?? "inherit"}
                    styles={{
                        root: {
                            width: 132,
                            display: "inline-block",
                            verticalAlign: "top",
                        },
                    }}
                    options={[
                        {
                            key: "inherit",
                            text: intl.get("organize.followSource"),
                        },
                        { key: 0, text: intl.get("organize.rss") },
                        { key: 1, text: intl.get("organize.webpage") },
                        { key: 3, text: intl.get("organize.fullContent") },
                    ]}
                    onChange={(_, value) =>
                        void dispatch(
                            saveReadingPreferences({
                                collections: {
                                    ...collections,
                                    [key]: {
                                        ...collections[key],
                                        openTarget:
                                            value.key === "inherit"
                                                ? undefined
                                                : Number(value.key),
                                    },
                                },
                            })
                        )
                    }
                />
            )}
        </>
    )
}
