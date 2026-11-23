import * as React from "react"
import { makeStyles, mergeClasses } from "@fluentui/react-components"

const useStyles = makeStyles({
    root: {
        "display": "inline-block",
        "width": "14px",
        "height": "var(--navHeight)",
        "lineHeight": "var(--navHeight)",
        "fontSize": "12px",
        "color": "var(--neutralQuaternary)",
        "textAlign": "center",
        "verticalAlign": "top",
        "::before": {
            content: '"|"',
        },
    },
})

export interface FlatButtonSeparatorProps {
    styleClass?: string
}

export const FlatButtonSeparator: React.FC<FlatButtonSeparatorProps> = ({
    styleClass,
}) => {
    const classes = useStyles()

    return (
        <span
            role="separator"
            aria-orientation="vertical"
            className={mergeClasses(classes.root, styleClass)}></span>
    )
}
