import * as React from "react"
import { useMemo, useRef } from "react"
import intl from "react-intl-universal"
import {
    createTableColumn,
    DataGrid,
    DataGridBody,
    DataGridCell,
    DataGridHeader,
    DataGridHeaderCell,
    DataGridRow,
    Switch,
} from "@fluentui/react-components"
import {
    Add16Regular,
    Delete16Regular,
    Edit16Regular,
} from "@fluentui/react-icons"
import { ArticleRule, RuleActions } from "../../../scripts/models/rule"
import { FilterType } from "../../../scripts/models/feed"
import { FlatButton } from "../../utils/FlatButton"
import { FlatButtonGroup } from "../../utils/FlatButtonGroup"
import { FlatButtonSeparator } from "../../utils/FlatButtonSeparator"
import { actionKeyMap } from "./actions"
import { useStyles } from "./styles"

type RuleListProps = {
    rules: ArticleRule[]
    saving: boolean
    selected: Set<number>
    onSelectionChange: (selected: Set<number>) => void
    onNew: () => void
    onEdit: (index: number) => void
    onChange: (rules: ArticleRule[]) => void
}

export function RuleList({
    rules,
    saving,
    selected,
    onSelectionChange,
    onNew,
    onEdit,
    onChange,
}: RuleListProps) {
    const classes = useStyles()
    const dragged = useRef<number[]>([])
    const columns = useMemo(
        () => [
            createTableColumn<ArticleRule>({
                columnId: "enabled",
                renderHeaderCell: () => intl.get("personal.enabled"),
                renderCell: rule => (
                    <Switch
                        checked={rule.enabled !== false}
                        disabled={saving}
                        aria-label={intl.get("personal.enabled")}
                        onChange={(_, data) =>
                            onChange(
                                rules.map(item =>
                                    item === rule
                                        ? Object.assign(
                                              ArticleRule.fromStored(
                                                  ArticleRule.toStored(item)
                                              ),
                                              { enabled: data.checked }
                                          )
                                        : item
                                )
                            )
                        }
                    />
                ),
            }),
            createTableColumn<ArticleRule>({
                columnId: "regex",
                renderHeaderCell: () => intl.get("rules.condition"),
                renderCell: rule =>
                    rule.conditions
                        ? rule.conditions
                              .map(
                                  condition =>
                                      `${intl.get(
                                          "personal.field_" + condition.field
                                      )} ${intl.get(
                                          "personal." + condition.operator
                                      )} ${condition.value}`
                              )
                              .join(rule.logic === "all" ? " ∧ " : " ∨ ")
                        : rule.filter.type & FilterType.KeywordSearch
                        ? `${intl.get(
                              rule.match ? "rules.block" : "rules.keep"
                          )} · ${intl.get(
                              rule.filter.type & FilterType.MatchAll
                                  ? "rules.allWords"
                                  : "rules.anyWords"
                          )}: ${rule.filter.search}`
                        : rule.filter.search,
            }),
            createTableColumn<ArticleRule>({
                columnId: "actions",
                renderHeaderCell: () => intl.get("rules.action"),
                renderCell: rule =>
                    [
                        ...RuleActions.toKeys(rule.actions).map(key =>
                            intl.get(
                                actionKeyMap[key] ||
                                    (key.startsWith("l-")
                                        ? "personal.laterAction"
                                        : "personal.offlineAction")
                            )
                        ),
                        ...(rule.highlight
                            ? [intl.get("personal.highlight")]
                            : []),
                        ...(rule.tags || []).map(tag => "#" + tag),
                    ].join(", "),
            }),
        ],
        [rules, saving, onChange]
    )

    function reorder(insertIndex: number) {
        const indices = dragged.current
        dragged.current = []
        if (saving || indices.length === 0 || indices.includes(insertIndex))
            return
        const moved = indices.map(index => rules[index])
        const remaining = rules.filter((_, index) => !indices.includes(index))
        const index =
            insertIndex - indices.filter(index => index < insertIndex).length
        remaining.splice(index, 0, ...moved)
        onChange(remaining)
    }

    return (
        <>
            <FlatButtonGroup styleClass={classes.toolbar}>
                <FlatButton
                    disabled={saving}
                    title={intl.get("rules.new")}
                    styleClass={classes.toolbarButton}
                    onClick={onNew}>
                    <Add16Regular />
                    {intl.get("rules.new")}
                </FlatButton>
                {selected.size > 0 && (
                    <FlatButtonSeparator
                        styleClass={classes.toolbarSeparator}
                    />
                )}
                {selected.size === 1 && (
                    <FlatButton
                        disabled={saving}
                        title={intl.get("edit")}
                        styleClass={classes.toolbarButton}
                        onClick={() => onEdit([...selected][0])}>
                        <Edit16Regular />
                        {intl.get("edit")}
                    </FlatButton>
                )}
                {selected.size > 0 && (
                    <FlatButton
                        disabled={saving}
                        title={intl.get("delete")}
                        styleClass={classes.toolbarButton}
                        onClick={() =>
                            onChange(
                                rules.filter((_, index) => !selected.has(index))
                            )
                        }>
                        <Delete16Regular className={classes.delete} />
                        {intl.get("delete")}
                    </FlatButton>
                )}
            </FlatButtonGroup>
            <div
                className={classes.grid}
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                    event.preventDefault()
                    reorder(rules.length)
                }}>
                <DataGrid
                    items={rules}
                    columns={columns}
                    selectionMode="multiselect"
                    selectedItems={selected}
                    onSelectionChange={(_, data) => {
                        if (!saving)
                            onSelectionChange(data.selectedItems as Set<number>)
                    }}>
                    <DataGridHeader>
                        <DataGridRow
                            selectionCell={{
                                checkboxIndicator: {
                                    "aria-label": intl.get("rules.selectAll"),
                                },
                            }}>
                            {({ renderHeaderCell }) => (
                                <DataGridHeaderCell>
                                    {renderHeaderCell()}
                                </DataGridHeaderCell>
                            )}
                        </DataGridRow>
                    </DataGridHeader>
                    <DataGridBody<ArticleRule>>
                        {({ item, rowId }) => (
                            <DataGridRow<ArticleRule>
                                key={rowId}
                                className={classes.ruleRow}
                                draggable={!saving}
                                selectionCell={{
                                    checkboxIndicator: {
                                        "aria-label":
                                            intl.get("rules.selectRule"),
                                    },
                                }}
                                onDoubleClick={() => onEdit(Number(rowId))}
                                onDragStart={event => {
                                    dragged.current = selected.has(
                                        Number(rowId)
                                    )
                                        ? [...selected].sort((a, b) => a - b)
                                        : [Number(rowId)]
                                    event.dataTransfer.effectAllowed = "move"
                                    event.dataTransfer.setData(
                                        "text/plain",
                                        String(rowId)
                                    )
                                }}
                                onDragEnd={() => {
                                    dragged.current = []
                                }}
                                onDragOver={event => event.preventDefault()}
                                onDrop={event => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    reorder(Number(rowId))
                                }}>
                                {({ columnId, renderCell }) => (
                                    <DataGridCell
                                        role={
                                            columnId === "regex"
                                                ? "rowheader"
                                                : "gridcell"
                                        }>
                                        {renderCell(item)}
                                    </DataGridCell>
                                )}
                            </DataGridRow>
                        )}
                    </DataGridBody>
                </DataGrid>
            </div>
        </>
    )
}
