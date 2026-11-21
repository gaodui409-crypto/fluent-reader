import * as React from "react"
import { useState } from "react"
import intl from "react-intl-universal"
import { Button, Text } from "@fluentui/react-components"
import { desc, inArray } from "drizzle-orm"
import type { RuleTarget } from "../../../schema-types"
import { database, itemsTable } from "../../../scripts/db"
import { ArticleRule } from "../../../scripts/models/rule"
import type { RSSItem } from "../../../scripts/models/item"
import { useAppSelector } from "../../../scripts/reducer"

export function RecentRulePreview({
    target,
    rules,
    disabled = false,
}: {
    target: RuleTarget
    rules: ArticleRule[]
    disabled?: boolean
}) {
    const groups = useAppSelector(state => state.groups)
    const [result, setResult] = useState<{ total: number; titles: string[] }>()
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    async function preview() {
        setBusy(true)
        setError("")
        try {
            const sids =
                target.type === "source"
                    ? [target.sid]
                    : target.type === "group"
                    ? groups.find(group => group.gid === target.gid)?.sids || []
                    : null
            const rows = await database
                .select()
                .from(itemsTable)
                .where(sids ? inArray(itemsTable.source, sids) : undefined)
                .orderBy(desc(itemsTable.date), desc(itemsTable._id))
                .limit(100)
            setResult({
                total: rows.length,
                titles: rows
                    .filter(row =>
                        rules.some(rule =>
                            ArticleRule.matches(rule, row as unknown as RSSItem)
                        )
                    )
                    .map(row => row.title),
            })
        } catch (error) {
            setError(String(error))
        } finally {
            setBusy(false)
        }
    }
    return (
        <>
            <Button disabled={disabled || busy} onClick={() => void preview()}>
                {intl.get("personal.preview100")}
            </Button>
            {error && (
                <Text role="alert">
                    {intl.get("personal.failed")} {error}
                </Text>
            )}
            {result && (
                <div role="status">
                    <p>
                        {intl.get("personal.previewCount", {
                            matches: result.titles.length,
                            total: result.total,
                        })}
                    </p>
                    <ul>
                        {result.titles.map((title, index) => (
                            <li key={index}>{title}</li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    )
}
