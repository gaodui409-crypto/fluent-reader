import * as React from "react"
import { useState } from "react"
import intl from "react-intl-universal"
import {
    Button,
    Checkbox,
    Dropdown,
    Field,
    Input,
    Option,
    Switch,
    Text,
} from "@fluentui/react-components"
import { ArticleRule } from "../../../scripts/models/rule"
import { FilterType } from "../../../scripts/models/feed"
import { RuleCondition, RuleTarget } from "../../../schema-types"
import { validateConditions } from "../../../rule-conditions"
import { useStyles } from "./styles"
import { RecentRulePreview } from "./recent-preview"

export function MultipleRuleEditor({
    rule,
    target,
    saving,
    onSave,
    onCancel,
}: {
    rule?: ArticleRule
    target: RuleTarget
    saving: boolean
    onSave: (rule: ArticleRule) => void
    onCancel: () => void
}) {
    const classes = useStyles()
    const [enabled, setEnabled] = useState(rule?.enabled ?? true)
    const [conditions, setConditions] = useState<RuleCondition[]>(
        rule?.conditions || [
            { field: "title", operator: "contains", value: "" },
        ]
    )
    const [logic, setLogic] = useState<"all" | "any">(rule?.logic || "all")
    const [actions, setActions] = useState<string[]>(
        rule
            ? Object.entries(rule.actions)
                  .filter(([, flag]) => flag)
                  .map(([key]) => key)
            : []
    )
    const [highlight, setHighlight] = useState(rule?.highlight || "")
    const [tags, setTags] = useState((rule?.tags || []).join(", "))
    const [error, setError] = useState("")
    const build = () => {
        const next = new ArticleRule(
            "",
            actions.map(action => action + "-true"),
            FilterType.Default | FilterType.ShowHidden,
            true
        )
        next.enabled = enabled
        next.conditions = conditions
        next.logic = logic
        next.highlight = highlight
        next.tags = [
            ...new Set(
                tags
                    .split(/[,，;；\n]/u)
                    .map(tag => tag.trim())
                    .filter(Boolean)
            ),
        ]
        return next
    }
    const draft = build()
    let valid = true
    try {
        validateConditions(conditions)
    } catch {
        valid = false
    }
    const change = (index: number, patch: Partial<RuleCondition>) =>
        setConditions(
            conditions.map((condition, i) =>
                i === index ? { ...condition, ...patch } : condition
            )
        )
    const actionOptions = [
        ["h", "hideAction"],
        ["r", "readAction"],
        ["s", "starAction"],
        ["l", "laterAction"],
        ["n", "notifyAction"],
        ["o", "offlineAction"],
    ]
    return (
        <fieldset className={classes.fieldset} disabled={saving}>
            <Text weight="semibold">{intl.get("rules.multiple")}</Text>
            <Switch
                checked={enabled}
                label={intl.get("personal.enabled")}
                onChange={(_, data) => setEnabled(data.checked)}
            />
            <Field label={intl.get("personal.conditionLogic")}>
                <Dropdown
                    inlinePopup
                    selectedOptions={[logic]}
                    value={intl.get("personal." + logic)}
                    onOptionSelect={(_, data) =>
                        setLogic(data.optionValue as typeof logic)
                    }>
                    {["all", "any"].map(key => (
                        <Option key={key} value={key}>
                            {intl.get("personal." + key)}
                        </Option>
                    ))}
                </Dropdown>
            </Field>
            {conditions.map((condition, index) => (
                <div key={index} className={classes.fieldset}>
                    <div className={classes.row}>
                        <Field
                            label={intl.get("personal.conditionField")}
                            className={classes.search}>
                            <Dropdown
                                inlinePopup
                                selectedOptions={[condition.field]}
                                value={intl.get(
                                    "personal.field_" + condition.field
                                )}
                                onOptionSelect={(_, data) =>
                                    change(index, {
                                        field: data.optionValue as RuleCondition["field"],
                                    })
                                }>
                                {["title", "body", "author", "link"].map(
                                    key => (
                                        <Option key={key} value={key}>
                                            {intl.get("personal.field_" + key)}
                                        </Option>
                                    )
                                )}
                            </Dropdown>
                        </Field>
                        <Field
                            label={intl.get("personal.conditionOperator")}
                            className={classes.grow}>
                            <Dropdown
                                inlinePopup
                                selectedOptions={[condition.operator]}
                                value={intl.get(
                                    "personal." + condition.operator
                                )}
                                onOptionSelect={(_, data) =>
                                    change(index, {
                                        operator:
                                            data.optionValue as RuleCondition["operator"],
                                    })
                                }>
                                {["contains", "notContains", "regex"].map(
                                    key => (
                                        <Option key={key} value={key}>
                                            {intl.get("personal." + key)}
                                        </Option>
                                    )
                                )}
                            </Dropdown>
                        </Field>
                        <Button
                            disabled={conditions.length === 1}
                            onClick={() =>
                                setConditions(
                                    conditions.filter((_, i) => i !== index)
                                )
                            }>
                            {intl.get("delete")}
                        </Button>
                    </div>
                    <Field label={intl.get("personal.conditionValue")}>
                        <Input
                            value={condition.value}
                            onChange={(_, data) =>
                                change(index, { value: data.value })
                            }
                        />
                    </Field>
                    <Checkbox
                        checked={!!condition.caseSensitive}
                        label={intl.get("context.caseSensitive")}
                        onChange={(_, data) =>
                            change(index, { caseSensitive: !!data.checked })
                        }
                    />
                </div>
            ))}
            <Button
                disabled={conditions.length >= 30}
                onClick={() =>
                    setConditions([
                        ...conditions,
                        { field: "title", operator: "contains", value: "" },
                    ])
                }>
                {intl.get("personal.addCondition")}
            </Button>
            <Text weight="semibold">{intl.get("rules.action")}</Text>
            {actionOptions.map(([key, label]) => (
                <Checkbox
                    key={key}
                    checked={actions.includes(key)}
                    label={intl.get("personal." + label)}
                    onChange={(_, data) =>
                        setActions(
                            data.checked
                                ? [...actions, key]
                                : actions.filter(action => action !== key)
                        )
                    }
                />
            ))}
            <Field label={intl.get("personal.highlight")}>
                <Dropdown
                    inlinePopup
                    selectedOptions={[highlight]}
                    value={intl.get("personal.color_" + (highlight || "none"))}
                    onOptionSelect={(_, data) =>
                        setHighlight(data.optionValue)
                    }>
                    {[
                        "",
                        "#e3a008",
                        "#2684ff",
                        "#2e9d66",
                        "#cf4a76",
                        "#9366cc",
                    ].map(color => (
                        <Option key={color} value={color}>
                            {intl.get("personal.color_" + (color || "none"))}
                        </Option>
                    ))}
                </Dropdown>
            </Field>
            <Field label={intl.get("personal.tagsInput")}>
                <Input
                    value={tags}
                    onChange={(_, data) => setTags(data.value)}
                />
            </Field>
            {error && <Text role="alert">{error}</Text>}
            <div className={classes.row}>
                <Button
                    appearance="primary"
                    disabled={
                        !valid ||
                        (!actions.length && !highlight && !tags.trim())
                    }
                    onClick={() => {
                        try {
                            validateConditions(conditions)
                            onSave(draft)
                        } catch (error) {
                            setError(String(error))
                        }
                    }}>
                    {intl.get("rules.save")}
                </Button>
                <Button onClick={onCancel}>{intl.get("cancel")}</Button>
            </div>
            <RecentRulePreview
                target={target}
                rules={[draft]}
                disabled={!valid}
            />
        </fieldset>
    )
}
