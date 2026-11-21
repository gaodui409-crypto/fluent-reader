import type { RuleCondition } from "./schema-types"

export type RuleArticle = {
    title: string
    snippet?: string
    creator?: string
    link: string
}

export function validateConditions(conditions: RuleCondition[]) {
    if (
        !Array.isArray(conditions) ||
        !conditions.length ||
        conditions.length > 30
    )
        throw new Error("A rule needs 1–30 conditions.")
    for (const condition of conditions) {
        if (
            !["title", "body", "author", "link"].includes(condition.field) ||
            !["contains", "notContains", "regex"].includes(
                condition.operator
            ) ||
            typeof condition.value !== "string" ||
            !condition.value.trim() ||
            condition.value.length > 2000
        )
            throw new Error("Invalid rule condition.")
        if (condition.operator === "regex")
            new RegExp(condition.value, condition.caseSensitive ? "" : "i")
    }
}

export function matchesConditions(
    conditions: RuleCondition[],
    logic: "all" | "any",
    article: RuleArticle
): boolean {
    if (!conditions?.length) return false
    const test = (condition: RuleCondition) => {
        let value = String(
            condition.field === "title"
                ? article.title
                : condition.field === "body"
                ? article.snippet || ""
                : condition.field === "author"
                ? article.creator || ""
                : article.link || ""
        )
        if (condition.operator === "regex") {
            try {
                return new RegExp(
                    condition.value,
                    condition.caseSensitive ? "" : "i"
                ).test(value)
            } catch {
                return false
            }
        }
        let needle = condition.value
        if (!condition.caseSensitive) {
            value = value.toLocaleLowerCase()
            needle = needle.toLocaleLowerCase()
        }
        const contains = value.includes(needle)
        return condition.operator === "notContains" ? !contains : contains
    }
    return logic === "any" ? conditions.some(test) : conditions.every(test)
}
