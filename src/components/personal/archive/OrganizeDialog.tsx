import * as React from "react"
import {
    DefaultButton,
    Dialog,
    DialogFooter,
    MessageBar,
    MessageBarType,
    PrimaryButton,
} from "@fluentui/react"
import { makeStyles } from "@griffel/react"
import { useOrganizeState } from "./useOrganizeState"
import { ArchiveQueryForm } from "./ArchiveQueryForm"
import { ArchivePreviewList } from "./ArchivePreviewList"
import { ArchiveActionForm } from "./ArchiveActionForm"

const useStyles = makeStyles({
    form: {
        display: "grid",
        gap: "12px",
    },
})

export default function OrganizeDialog() {
    const c = useStyles()
    const s = useOrganizeState()

    const needsFolder = s.kind === "folder" && !s.folderId

    return (
        <Dialog
            hidden={!s.open}
            onDismiss={() => !s.busy && s.setOpen(false)}
            minWidth={560}
            maxWidth={760}
            modalProps={{
                isBlocking: s.busy,
                styles: {
                    main: {
                        maxHeight: "90vh",
                        minWidth: "min(560px, calc(100vw - 24px))",
                        maxWidth: "min(760px, calc(100vw - 24px))",
                    },
                },
            }}
            dialogContentProps={{ title: "筛选归档" }}>
            <div className={c.form}>
                <ArchiveQueryForm
                    title={s.title}
                    scope={s.scope}
                    onScopeChange={s.setScope}
                    query={s.query}
                    onChange={s.change}
                    advanced={s.advanced}
                    onToggleAdvanced={() => s.setAdvanced(!s.advanced)}
                    busy={s.busy}
                />
                <ArchivePreviewList
                    loading={s.loading}
                    waitingForCriteria={s.waitingForCriteria}
                    preview={s.preview}
                    excluded={s.excluded}
                    onChangeExcluded={s.setExcluded}
                    page={s.page}
                    onPageChange={s.setPage}
                    total={s.total}
                    busy={s.busy}
                    onRefreshPreview={s.triggerPreview}
                />
                <ArchiveActionForm
                    kind={s.kind}
                    onKindChange={s.setKind}
                    folderId={s.folderId}
                    onFolderChange={s.setFolderId}
                    suggestion={s.query.include}
                    hide={s.hide}
                    onHideChange={s.setHide}
                    future={s.future}
                    onFutureChange={s.setFuture}
                    ruleName={s.ruleName}
                    onRuleNameChange={s.setRuleName}
                    onSaveOnly={() => void s.saveOnly()}
                    busy={s.busy}
                />
                {needsFolder && s.preview && s.preview.rows.length > 0 && (
                    <small style={{ color: "var(--neutralSecondary)" }}>
                        提示：请先在上方选择或新建一个目标文件夹，即可执行归档。
                    </small>
                )}
                {!!s.message && (
                    <MessageBar
                        messageBarType={
                            s.message.startsWith("本次已处理") ||
                            s.message.startsWith("规则已保存") ||
                            s.message.startsWith("已撤销")
                                ? MessageBarType.success
                                : MessageBarType.error
                        }>
                        {s.message}
                    </MessageBar>
                )}
            </div>
            <DialogFooter>
                {s.result && s.result.count > 0 && (
                    <DefaultButton
                        disabled={s.busy}
                        onClick={() => void s.undo()}>
                        撤销本次整理
                    </DefaultButton>
                )}
                <PrimaryButton
                    disabled={s.busy || s.loading || !s.preview || needsFolder}
                    onClick={() => void s.execute()}>
                    {s.kind === "view"
                        ? "查看结果"
                        : `执行本次整理（${s.total} 篇）`}
                </PrimaryButton>
                <DefaultButton
                    disabled={s.busy}
                    onClick={() => s.setOpen(false)}>
                    关闭
                </DefaultButton>
            </DialogFooter>
        </Dialog>
    )
}
