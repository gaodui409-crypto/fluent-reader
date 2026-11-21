# Fluent Reader Personal

自用版 1.3.2-personal.6，基于 Fluent Reader master 5912070。

运行 Setup-x64.exe 安装，或解压 ZIP 后运行 Fluent Reader Personal.exe。应用使用独立数据目录，卸载默认保留数据。

本版新增单窗口筛选归档、两级文章文件夹、自动保存备注、从订阅流隐藏、长期归档规则及 Linux.do 论坛阅读适配。

已加入卡片图片兼容、关键词屏蔽/筛选、全文搜索与 ZIP 备份、登录态全文、按源/分组设置、规则与标签、单文件离线保存、稍后读和自动过期、订阅发现与健康统计、可配置 AI 摘要/翻译/简报。

详细中文说明见 docs/USER_GUIDE.md（安装后为“使用指南.md”）；阶段记录见 docs/CHANGELOG.md。首次使用建议先配置备份目录。

原版采用 BSD-3-Clause；离线保存使用 single-file-core（AGPL-3.0），许可证与对应源码随安装包提供，详见第三方组件说明。

源码构建：依次运行 npm install、npm run build、npx prettier --check .、npm run package-win-ci。输出位于 bin/personal.6/。验证脚本保留在项目相邻的 fluent-reader-validation 目录。
