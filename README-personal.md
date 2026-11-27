# Fluent Reader Personal

自用版 1.3.2-personal.8，基于 Fluent Reader master 5912070。

运行 Setup-x64.exe 安装，或解压 ZIP 后运行 Fluent Reader Personal.exe。应用使用独立数据目录（`local.fluentreader.personal`），卸载默认保留阅读数据。

本版包含单窗口筛选归档工作台、两级文章文件夹、自动保存备注、从订阅流隐藏、统一自动归档规则、侧栏离线网页集合与新增计数（`+N`）、双模型流式 AI 摘要与段落双语对照，以及 Linux.do 论坛深度阅读适配（含主楼下展开后续回复楼层）。

同时内置卡片图片兼容、全文 FTS5 搜索与带 SHA-256 校验的自动 ZIP 备份、登录态正文提取、按源/分组偏好继承、SingleFile 单文件离线保存、稍后读延迟移出与未读自动过期、订阅发现与健康统计，以及直填 HTTP/SOCKS5 代理。

详细中文说明见 docs/USER_GUIDE.md（安装后为“使用指南.md”）；阶段记录见 docs/CHANGELOG.md。首次使用建议先配置备份目录。

原版采用 BSD-3-Clause；离线保存使用 single-file-core（AGPL-3.0），许可证与对应源码随安装包提供，详见第三方组件说明。

源码构建：依次运行 `npm install`、`npm run build`、`npx prettier --check .`、`npm run test:unit`；打包安装包运行 `npm run package-personal`，产物输出位于 `bin/personal.8/`。验证脚本保留在项目相邻的 `fluent-reader-validation` 目录。
