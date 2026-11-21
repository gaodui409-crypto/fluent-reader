import { FeedFilter, FilterType } from "./feed"
import { RSSItem } from "./item"
import {
    getRuleTargetKey,
    RuleTarget,
    RuleTargetKey,
    SourceGroup,
    StoredRule,
    RuleCondition,
} from "../../schema-types"
import { matchesConditions } from "../../rule-conditions"
import type { AppThunk } from "../utils"
import intl from "react-intl-universal"

export const enum ItemAction {
    Read = "r",
    Star = "s",
    Hide = "h",
    Notify = "n",
    Later = "l",
    Offline = "o",
}

export type RuleActions = {
    [type in ItemAction]: boolean
}
export namespace RuleActions {
    export function toKeys(actions: RuleActions): string[] {
        return Object.entries(actions).map(([t, f]) => `${t}-${f}`)
    }

    export function fromKeys(strs: string[]): RuleActions {
        const fromKey = (str: string): [ItemAction, boolean] => {
            let [t, f] = str.split("-") as [ItemAction, string]
            if (f) return [t, f === "true"]
            else return [t, true]
        }
        return Object.fromEntries(strs.map(fromKey)) as RuleActions
    }
}

type ActionTransformType = {
    [type in ItemAction]: (i: RSSItem, f: boolean) => void
}
const actionTransform: ActionTransformType = {
    [ItemAction.Read]: (i, f) => {
        i.hasRead = f
    },
    [ItemAction.Star]: (i, f) => {
        i.starred = f
    },
    [ItemAction.Hide]: (i, f) => {
        i.hidden = f
    },
    [ItemAction.Notify]: (i, f) => {
        i.notify = f
    },
    [ItemAction.Later]: (i, f) => {
        i.readLater = f
    },
    [ItemAction.Offline]: (i, f) => {
        i.saveRequested = f
    },
}

export class ArticleRule {
    filter: FeedFilter
    match: boolean
    actions: RuleActions
    enabled = true
    conditions?: RuleCondition[]
    logic: "all" | "any" = "all"
    highlight = ""
    tags: string[] = []

    constructor(
        regex: string,
        actions: string[],
        filter: FilterType,
        match: boolean
    ) {
        this.filter = new FeedFilter(filter, regex)
        this.match = match
        this.actions = RuleActions.fromKeys(actions)
    }

    static fromStored(rule: StoredRule): ArticleRule {
        const result = new ArticleRule(
            rule.search,
            rule.actions,
            rule.filter,
            rule.match
        )
        result.enabled = rule.enabled !== false
        result.conditions = rule.conditions
        result.logic = rule.logic || "all"
        result.highlight = rule.highlight || ""
        result.tags = rule.tags || []
        return result
    }

    static toStored(rule: ArticleRule): StoredRule {
        return {
            filter: rule.filter.type,
            search: rule.filter.search,
            match: rule.match,
            actions: RuleActions.toKeys(rule.actions),
            enabled: rule.enabled,
            conditions: rule.conditions,
            logic: rule.logic,
            highlight: rule.highlight,
            tags: rule.tags,
        }
    }

    static matches(rule: ArticleRule, item: RSSItem) {
        if (rule.enabled === false) return false
        let result = rule.conditions
            ? matchesConditions(rule.conditions, rule.logic, item)
            : FeedFilter.testItem(rule.filter, item)
        return result === rule.match
    }

    static apply(rule: ArticleRule, item: RSSItem) {
        if (ArticleRule.matches(rule, item)) {
            for (let [action, flag] of Object.entries(rule.actions)) {
                actionTransform[action]?.(item, flag)
            }
            if (rule.highlight) item.highlight = rule.highlight
            if (rule.tags.length)
                item.tags = [...new Set([...(item.tags || []), ...rule.tags])]
        }
    }

    static applyAll(rules: ArticleRule[], item: RSSItem) {
        for (let rule of rules) {
            this.apply(rule, item)
        }
    }
}

export type RuleState = Partial<Record<RuleTargetKey, ArticleRule[]>>

const INIT_RULES = "INIT_RULES"
const UPDATE_RULES = "UPDATE_RULES"

type RuleAction =
    | { type: typeof INIT_RULES; rules: RuleState }
    | { type: typeof UPDATE_RULES; key: RuleTargetKey; rules: ArticleRule[] }

export function ruleReducer(
    state: RuleState = {},
    action: RuleAction
): RuleState {
    switch (action.type) {
        case INIT_RULES:
            return action.rules
        case UPDATE_RULES: {
            const rules = { ...state }
            if (action.rules.length > 0) rules[action.key] = action.rules
            else delete rules[action.key]
            return rules
        }
        default:
            return state
    }
}

export function initRules(): AppThunk {
    return dispatch => {
        try {
            const rules = Object.fromEntries(
                Object.entries(window.settings.getAllRules()).map(
                    ([key, rules]) => [key, rules.map(ArticleRule.fromStored)]
                )
            ) as RuleState
            dispatch({ type: INIT_RULES, rules })
        } catch (error) {
            dispatch({ type: INIT_RULES, rules: {} })
            window.utils.showErrorBox(
                intl.get("personal.rulesLoadError"),
                String(error)
            )
        }
    }
}

export function updateRulesForTarget(
    target: RuleTarget,
    rules: ArticleRule[]
): AppThunk<Promise<void>> {
    return async dispatch => {
        await window.settings.setRulesForTarget(
            target,
            rules.map(ArticleRule.toStored)
        )
        dispatch({ type: UPDATE_RULES, key: getRuleTargetKey(target), rules })
    }
}

// The editor's preview and every fetch path share the same scope precedence.
export function getRulesForTarget(
    rules: RuleState,
    groups: SourceGroup[],
    target: RuleTarget
): ArticleRule[] {
    const result = [...(rules.all || [])]
    if (target.type === "all") return result
    if (target.type === "source") {
        const group = groups.find(
            g => g.isMultiple && g.sids.includes(target.sid)
        )
        if (group) result.push(...(rules[`group:${group.gid}`] || []))
    }
    result.push(...(rules[getRuleTargetKey(target)] || []))
    return result
}
