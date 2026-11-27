import { connect } from "react-redux"
import intl from "react-intl-universal"
import {
    initIntl,
    saveSettings,
    setupAutoFetch,
} from "../../scripts/models/app"
import { database, itemsTable } from "../../scripts/db"
import { lt, sql, and } from "drizzle-orm"
import AppTab from "../../components/settings/app"
import { importAll } from "../../scripts/settings"
import { updateUnreadCounts } from "../../scripts/models/source"
import { AppDispatch } from "../../scripts/utils"

const mapDispatchToProps = (dispatch: AppDispatch) => ({
    setLanguage: (option: string) => {
        window.settings.setLocaleSettings(option)
        dispatch(initIntl())
    },
    setFetchInterval: async (interval: number) => {
        await window.settings.setFetchInterval(interval)
        dispatch(setupAutoFetch())
    },
    deleteArticles: async (days: number) => {
        dispatch(saveSettings())
        try {
            const date = new Date()
            date.setTime(date.getTime() - days * 86400000)
            await database
                .delete(itemsTable)
                .where(
                    and(
                        lt(itemsTable.date, date),
                        sql`${itemsTable.kept}=0 AND ${itemsTable.starred}=0 AND ${itemsTable.readLater}=0 AND NOT EXISTS(SELECT 1 FROM folder_articles f WHERE f.itemId=${itemsTable._id}) AND NOT EXISTS(SELECT 1 FROM article_notes n WHERE n.itemId=${itemsTable._id} AND length(n.text)>0)`
                    )
                )
            // DELETE leaves reusable pages allocated; explicit cleanup should release them.
            await database.run(sql`VACUUM`)
            await dispatch(updateUnreadCounts())
        } catch (error) {
            window.utils.showErrorBox(
                intl.get("personal.failed") || "操作失败",
                String(error)
            )
        } finally {
            dispatch(saveSettings())
        }
    },
    importAll: async () => {
        dispatch(saveSettings())
        let shouldUnlock = true
        try {
            const cancelled = await importAll()
            shouldUnlock = Boolean(cancelled)
        } catch (error) {
            window.utils.showErrorBox(
                intl.get("personal.failed") || "导入失败",
                String(error)
            )
        } finally {
            if (shouldUnlock) dispatch(saveSettings())
        }
    },
})

const AppTabContainer = connect(null, mapDispatchToProps)(AppTab)
export default AppTabContainer
