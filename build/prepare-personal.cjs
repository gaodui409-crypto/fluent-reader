const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const AdmZip = require("adm-zip")

const root = path.resolve(__dirname, "..")

const requiredBuiltFiles = [
    "dist/electron.js",
    "dist/archive-worker.js",
    "dist/preload.js",
    "dist/offline-preload.js",
    "dist/index.js",
    "dist/griffel.css",
    "dist/index.html",
    "node_modules/single-file-core/single-file.js",
    "node_modules/single-file-core/LICENSE",
]
for (const rel of requiredBuiltFiles) {
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        throw new Error(
            `Missing required build/vendor artifact before packaging: ${rel}. Run "npm run build" and "npm install" first.`
        )
    }
}

const articleJsBuf = fs.readFileSync(path.join(root, "dist/article/article.js"))
const articleHtmlBuf = fs.readFileSync(
    path.join(root, "dist/article/article.html")
)
if (articleJsBuf.includes("\r\n") || articleHtmlBuf.includes("\r\n")) {
    throw new Error(
        "dist/article/article.js and dist/article/article.html must use LF line endings."
    )
}
const articleHash =
    "sha256-" +
    crypto.createHash("sha256").update(articleJsBuf).digest("base64")
const articleHtmlText = articleHtmlBuf.toString("utf8")
if (
    !articleHtmlText.includes(`script-src-elem '${articleHash}'`) ||
    !articleHtmlText.includes(`integrity="${articleHash}"`)
) {
    throw new Error(
        `SRI/CSP SHA-256 mismatch in dist/article/article.html (expected ${articleHash}).`
    )
}

const zip = new AdmZip()
const rootFiles = new Set([
    "package.json",
    "package-lock.json",
    "webpack.config.js",
    "tsconfig.json",
    "drizzle.config.ts",
    "electron-builder.yml",
    "electron-builder-mas.yml",
    "electron-builder-personal.yml",
    ".gitignore",
    ".prettierrc.yml",
    ".prettierignore",
    ".gitattributes",
    "LICENSE",
    "README.md",
    "README-personal.md",
    "AGENTS.md",
])
// Also works from the distributed source ZIP, which has no .git directory.
const files = [
    ...rootFiles,
    "dist/index.css",
    "dist/fonts.vbs",
    "dist/fontlist",
]
function walk(relative) {
    if (relative === "tests/e2e") return
    const directory = path.join(root, relative)
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = relative + "/" + entry.name
        if (entry.isDirectory()) walk(file)
        else if (entry.isFile()) files.push(file)
    }
}
for (const directory of [
    "src",
    "docs",
    "build",
    "tests",
    "dist/article",
    "dist/drizzle",
    "dist/icons",
    "dist/styles",
])
    walk(directory)
let count = 0
for (const file of new Set(files)) {
    if (
        !(
            rootFiles.has(file) ||
            /^(src|docs|build|tests)\//.test(file) ||
            /^dist\/(article|drizzle|icons|styles)\//.test(file) ||
            /^dist\/(index\.css|fonts\.vbs|fontlist)$/.test(file)
        )
    )
        continue
    if (
        /\.(zip|exe|pfx|p12|pem|provisionprofile|bak|tmp|log|db|db-wal|db-shm)$/i.test(
            file
        )
    )
        continue
    const source = path.join(root, file)
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue
    zip.addFile(file, fs.readFileSync(source))
    count++
}
// Include the AGPL component source actually bundled in the offline preload.
zip.addLocalFolder(
    path.join(root, "node_modules/single-file-core"),
    "vendor/single-file-core"
)
zip.writeZip(path.join(__dirname, "personal-source.zip"))
console.log(
    `Prepared corresponding source archive (${count} project files plus SingleFile).`
)
