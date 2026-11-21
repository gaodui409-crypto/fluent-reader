# 第三方组件与源码

本自用版基于 Haoyuan Liu 的 Fluent Reader，原项目采用 BSD-3-Clause 许可证，完整文本见安装目录中的 Fluent-Reader-LICENSE.txt。

离线网页保存使用 gildas 的 single-file-core 1.11.0，采用 GNU Affero General Public License v3。完整许可文本见 SingleFile-AGPL-3.0.txt。此自用版包含该组件，向他人提供本版本时应同时保留相应许可证和对应源码。

安装目录中的 Fluent-Reader-Personal-Source.zip 包含本版本应用源码、数据库迁移、构建配置、依赖锁定文件，以及实际使用的 single-file-core 源码。其他依赖与版本见 package.json、package-lock.json，其许可证保留在依赖包中。无需账户凭据即可构建；AI 服务密钥由使用者在运行时自行设置。

构建方法：在已安装 Node.js 和 npm 的 Windows 系统解压源码，依次运行 npm install、npm run build、npx prettier --check .、npm run package-win-ci。single-file-core 可通过锁定文件从 npm 取得；vendor/single-file-core 保存了本版使用的副本。
