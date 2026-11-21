// Commas, semicolons and newlines separate terms; spaces remain part of a phrase.
export function parseKeywords(value: string): string[] {
    return [
        ...new Set(
            value
                .split(/[,，;；\r\n]+/)
                .map(s => s.trim())
                .filter(Boolean)
        ),
    ]
}

export function keywordPattern(value: string, all = false): string {
    const terms = parseKeywords(value).map(term =>
        term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    if (terms.length === 0) return ""
    return all
        ? "^" +
              terms.map(term => `(?=[\\s\\S]*${term})`).join("") +
              "[\\s\\S]*$"
        : terms.join("|")
}
