import * as React from "react"
import {
    createFocusOutlineStyle,
    makeStyles,
    mergeClasses,
    shorthands,
} from "@fluentui/react-components"

const useStyles = makeStyles({
    root: {
        ...createFocusOutlineStyle({
            style: {
                outlineOffset: "-2px",
            },
        }),
        "position": "relative",
        "display": "inline-block",
        "width": "44px",
        "height": "var(--navHeight, 32px)",
        "textDecorationLine": "none",
        "textAlign": "center",
        "lineHeight": "var(--navHeight, 32px)",
        "color": "var(--black)",
        "fontSize": "14px",
        "verticalAlign": "top",
        "backgroundColor": "transparent",
        ...shorthands.borderStyle("none"),
        "paddingLeft": 0,
        "paddingRight": 0,
        "paddingTop": 0,
        "paddingBottom": 0,
        "marginLeft": 0,
        "marginRight": 0,
        "marginTop": 0,
        "marginBottom": 0,
        "cursor": "inherit",
        "fontFamily": "inherit",
        ":hover": {
            backgroundColor: "rgba(127, 127, 127, 0.12)",
        },
        ":active": {
            backgroundColor: "rgba(127, 127, 127, 0.2)",
        },
    },
    disabled: {
        "backgroundColor": "unset !important",
        "color": "var(--neutralSecondaryAlt)",
        ":hover": {
            backgroundColor: "unset !important",
        },
        ":active": {
            backgroundColor: "unset !important",
        },
    },
    fetching: {
        "backgroundColor": "unset !important",
        "color": "var(--neutralSecondaryAlt)",
        "& i, & svg": {
            display: "inline-block",
            animationName: {
                from: { transform: "rotate(0deg)" },
                to: { transform: "rotate(360deg)" },
            },
            animationDuration: "1.2s",
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
        },
        ":hover": {
            backgroundColor: "unset !important",
        },
        ":active": {
            backgroundColor: "unset !important",
        },
    },
    close: {
        ":hover": {
            backgroundColor: "#e81123",
            color: "var(--whiteConstant)",
        },
        ":active": {
            backgroundColor: "#f1707a",
            color: "var(--whiteConstant)",
        },
    },
})

export type FlatButtonVariant = "default" | "system" | "close"

export interface FlatButtonProps {
    children: React.ReactNode
    title?: string
    ariaLabel?: string
    id?: string
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    onMouseDown?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
    fetching?: boolean
    variant?: FlatButtonVariant
    styleClass?: string
}

export const FlatButton: React.FC<FlatButtonProps> = ({
    children,
    title,
    ariaLabel,
    id,
    onClick,
    onMouseDown,
    disabled,
    fetching,
    variant = "default",
    styleClass,
}) => {
    const classes = useStyles()

    return (
        <button
            type="button"
            className={mergeClasses(
                classes.root,
                variant === "close" && classes.close,
                disabled && classes.disabled,
                fetching && classes.fetching,
                styleClass
            )}
            title={title}
            aria-label={ariaLabel || title}
            id={id}
            onClick={disabled ? undefined : onClick}
            onMouseDown={disabled ? undefined : onMouseDown}
            disabled={disabled}>
            {children}
        </button>
    )
}
