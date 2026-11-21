import * as React from "react"
import { useState } from "react"
import intl from "react-intl-universal"
import {
    Button,
    Dropdown,
    Field,
    Input,
    Option,
    OptionGroup,
    Text,
    Textarea,
    ToggleButton,
} from "@fluentui/react-components"
import { ArticleRule, RuleActions } from "../../../scripts/models/rule"
import { FilterType } from "../../../scripts/models/feed"
import { validateRegex } from "../../../scripts/utils"
import { parseKeywords } from "../../../scripts/keywords"
import { actionGroups, actionKeyMap } from "./actions"
import { useStyles } from "./styles"
import { MultipleRuleEditor } from "./multiple-editor"
import type { RuleTarget } from "../../../schema-types"

type RuleEditorProps = {
    target: RuleTarget
    rule?: ArticleRule
    saving: boolean
    onSave: (rule: ArticleRule) => void
    onCancel?: () => void
}

export function RuleEditor({
    target,
    rule,
    saving,
    onSave,
    onCancel,
}: RuleEditorProps) {
    const classes = useStyles()
    const [mode, setMode] = useState(
        rule
            ? rule.conditions
                ? "multiple"
                : rule.filter.type & FilterType.KeywordSearch
                ? rule.match
                    ? "block"
                    : "keep"
                : "regex"
            : "block"
    )
    const keywordMode = mode !== "regex"
    const [matchAll, setMatchAll] = useState(
        !!(rule?.filter.type & FilterType.MatchAll)
    )
    const [regex, setRegex] = useState(rule?.filter.search || "")
    const [touched, setTouched] = useState(false)
    const [searchType, setSearchType] = useState(
        rule?.filter.type & FilterType.FullSearch
            ? "1"
            : rule?.filter.type & FilterType.CreatorSearch
            ? "2"
            : rule?.filter.type & FilterType.BodySearch
            ? "3"
            : "0"
    )
    const [caseSensitive, setCaseSensitive] = useState(
        rule ? !(rule.filter.type & FilterType.CaseInsensitive) : false
    )
    const [match, setMatch] = useState(rule ? rule.match : true)
    const [actionKeys, setActionKeys] = useState<string[]>(
        rule ? RuleActions.toKeys(rule.actions) : []
    )
    const searchOptions = [
        "rules.title",
        "rules.fullSearch",
        "rules.creator",
        "rules.content",
    ]
    const regexError = (
        keywordMode ? parseKeywords(regex).length === 0 : regex.length === 0
    )
        ? intl.get("emptyField")
        : !keywordMode && validateRegex(regex) === null
        ? intl.get("rules.badRegex")
        : ""
    function saveRule() {
        if (regexError || (!keywordMode && actionKeys.length === 0)) return
        let filter = FilterType.Default | FilterType.ShowHidden
        if (!caseSensitive) filter |= FilterType.CaseInsensitive
        if (searchType === "1") filter |= FilterType.FullSearch
        else if (searchType === "2") filter |= FilterType.CreatorSearch
        else if (searchType === "3") filter |= FilterType.BodySearch
        if (keywordMode) filter |= FilterType.KeywordSearch
        if (keywordMode && matchAll) filter |= FilterType.MatchAll
        const next = new ArticleRule(
            regex,
            keywordMode ? ["h-true"] : actionKeys,
            filter,
            keywordMode ? mode === "block" : match
        )
        next.enabled = rule?.enabled !== false
        onSave(next)
    }

    if (mode === "multiple")
        return (
            <MultipleRuleEditor
                rule={rule}
                target={target}
                saving={saving}
                onSave={onSave}
                onCancel={() => (onCancel ? onCancel() : setMode("block"))}
            />
        )
    return (
        <fieldset className={classes.fieldset} disabled={saving}>
            <Text weight="semibold">
                {intl.get(rule !== undefined ? "edit" : "rules.new")}
            </Text>
            <Field label={intl.get("rules.mode")}>
                <Dropdown
                    inlinePopup
                    disabled={saving}
                    selectedOptions={[mode]}
                    value={intl.get(`rules.${mode}`)}
                    onOptionSelect={(_, data) => {
                        setMode(data.optionValue)
                        setTouched(false)
                    }}>
                    {["block", "keep", "regex", "multiple"].map(value => (
                        <Option key={value} value={value}>
                            {intl.get(`rules.${value}`)}
                        </Option>
                    ))}
                </Dropdown>
            </Field>
            {keywordMode && (
                <Text className={classes.hint}>
                    {intl.get(`rules.${mode}Hint`)}
                </Text>
            )}
            <div className={classes.row}>
                <Field
                    className={classes.search}
                    label={intl.get("rules.searchField")}>
                    <Dropdown
                        inlinePopup
                        className={classes.dropdown}
                        disabled={saving}
                        value={intl.get(searchOptions[Number(searchType)])}
                        selectedOptions={[searchType]}
                        onOptionSelect={(_, data) =>
                            setSearchType(data.optionValue)
                        }>
                        {searchOptions.map((key, index) => (
                            <Option key={key} value={String(index)}>
                                {intl.get(key)}
                            </Option>
                        ))}
                    </Dropdown>
                </Field>
                <Field
                    className={classes.match}
                    label={intl.get(
                        keywordMode
                            ? "rules.keywordMatch"
                            : "rules.matchCondition"
                    )}>
                    <Dropdown
                        inlinePopup
                        className={classes.dropdown}
                        disabled={saving}
                        value={intl.get(
                            keywordMode
                                ? matchAll
                                    ? "rules.allWords"
                                    : "rules.anyWords"
                                : match
                                ? "rules.match"
                                : "rules.notMatch"
                        )}
                        selectedOptions={[
                            keywordMode
                                ? matchAll
                                    ? "1"
                                    : "0"
                                : match
                                ? "1"
                                : "0",
                        ]}
                        onOptionSelect={(_, data) =>
                            keywordMode
                                ? setMatchAll(data.optionValue === "1")
                                : setMatch(data.optionValue === "1")
                        }>
                        <Option value="1">
                            {intl.get(
                                keywordMode ? "rules.allWords" : "rules.match"
                            )}
                        </Option>
                        <Option value="0">
                            {intl.get(
                                keywordMode
                                    ? "rules.anyWords"
                                    : "rules.notMatch"
                            )}
                        </Option>
                    </Dropdown>
                </Field>
                <Field
                    className={classes.grow}
                    label={intl.get(
                        keywordMode ? "rules.keywords" : "rules.regex"
                    )}
                    validationState={touched && regexError ? "error" : "none"}
                    validationMessage={touched ? regexError : undefined}>
                    {keywordMode ? (
                        <Textarea
                            value={regex}
                            rows={3}
                            placeholder={intl.get("rules.keywordsPlaceholder")}
                            onChange={(_, data) => {
                                setRegex(data.value)
                                setTouched(true)
                            }}
                        />
                    ) : (
                        <Input
                            value={regex}
                            placeholder={intl.get("rules.regex")}
                            onChange={(_, data) => {
                                setRegex(data.value)
                                setTouched(true)
                            }}
                            contentAfter={
                                <ToggleButton
                                    appearance="transparent"
                                    size="small"
                                    checked={caseSensitive}
                                    title={intl.get("context.caseSensitive")}
                                    aria-label={intl.get(
                                        "context.caseSensitive"
                                    )}
                                    onClick={() =>
                                        setCaseSensitive(value => !value)
                                    }>
                                    Aa
                                </ToggleButton>
                            }
                        />
                    )}
                </Field>
            </div>
            {keywordMode && (
                <div className={classes.row}>
                    <ToggleButton
                        size="small"
                        checked={caseSensitive}
                        onClick={() => setCaseSensitive(value => !value)}>
                        {intl.get("context.caseSensitive")}
                    </ToggleButton>
                    <Text className={classes.hint}>
                        {intl.get("rules.keywordHelp")}
                    </Text>
                </div>
            )}
            {!keywordMode && (
                <Field label={intl.get("rules.action")}>
                    <Dropdown
                        inlinePopup
                        className={classes.dropdown}
                        multiselect
                        disabled={saving}
                        placeholder={intl.get("rules.selectAction")}
                        selectedOptions={actionKeys}
                        value={actionKeys
                            .map(key => intl.get(actionKeyMap[key]))
                            .join(", ")}
                        onOptionSelect={(_, data) => {
                            if (!data.optionValue) return
                            const key = data.optionValue
                            setActionKeys(keys =>
                                data.selectedOptions.includes(key)
                                    ? [
                                          ...keys.filter(
                                              current =>
                                                  !current.startsWith(
                                                      `${key.split("-")[0]}-`
                                                  )
                                          ),
                                          key,
                                      ]
                                    : keys.filter(current => current !== key)
                            )
                        }}>
                        {actionGroups.map(keys => (
                            <OptionGroup key={keys[0]}>
                                {keys.map(key => (
                                    <Option key={key} value={key}>
                                        {intl.get(actionKeyMap[key])}
                                    </Option>
                                ))}
                            </OptionGroup>
                        ))}
                    </Dropdown>
                </Field>
            )}
            <div className={classes.row}>
                <Button
                    appearance="primary"
                    disabled={
                        saving ||
                        !!regexError ||
                        (!keywordMode && actionKeys.length === 0)
                    }
                    onClick={saveRule}>
                    {intl.get("rules.save")}
                </Button>
                {onCancel && (
                    <Button disabled={saving} onClick={onCancel}>
                        {intl.get("cancel")}
                    </Button>
                )}
            </div>
        </fieldset>
    )
}
