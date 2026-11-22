const fs = require("node:fs")
const path = require("node:path")
const AdmZip = require("adm-zip")

const root = path.resolve(__dirname, "..")
const zip = new AdmZip()
const rootFiles = new Set([
    "package.json",
    "package-lock.json",
    "webpack.config.js",
    "tsconfig.json",
    "drizzle.config.ts",
    "electron-builder.yml",
    "electron-builder-personal.yml",
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
    "tests/personal-unit.cjs",
    "dist/index.css",
    "dist/fonts.vbs",
    "dist/fontlist",
]
function walk(relative) {
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
    if (/\.(zip|exe|pfx|p12|pem|provisionprofile)$/i.test(file)) continue
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
