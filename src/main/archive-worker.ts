import { parentPort } from "node:worker_threads"
import {
    ArchiveQuery,
    ArchiveRow,
    archiveExcerpt,
    archiveMatches,
} from "../archive-types"

interface WorkerRequest {
    jobId: number
    query: ArchiveQuery
    rows: ArchiveRow[]
    preview: boolean
}

parentPort?.on("message", (payload: WorkerRequest) => {
    const { jobId, query, rows, preview } = payload
    try {
        const matches = rows
            .filter(row => archiveMatches(query, row))
            .map(row => ({
                id: row.id,
                excerpt: preview ? archiveExcerpt(query, row) : undefined,
            }))
        parentPort?.postMessage({ jobId, matches })
    } catch (error) {
        parentPort?.postMessage({ jobId, error: String(error) })
    }
})
