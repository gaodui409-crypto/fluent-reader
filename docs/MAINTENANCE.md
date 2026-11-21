# Fluent Reader Personal 维护入口

2026-11-16，按用户要求从中转区转入持续维护。当前交付版本为 1.3.2-personal.6。

## 目录与启动

| 内容 | 位置 |
|---|---|
| 唯一源码主目录 | `D:/8.Project/0_0_维护/fluent-reader` |
| 配套验收、独立测试资料与恢复备份 | `../fluent-reader-validation` |
| 当前便携程序 | `bin/personal.6/win-unpacked/Fluent Reader Personal.exe` |
| 安装包与便携 ZIP | `bin/personal.6` |
| 日常阅读库 | `%APPDATA%/Fluent Reader Personal`，保留在原处 |
| 使用说明 | [USER_GUIDE.md](USER_GUIDE.md) |
| 版本记录 | [CHANGELOG.md](CHANGELOG.md) |
| 最近验收与待办 | [维护接续](../../fluent-reader-validation/MAINTENANCE-STATUS.md) |

开始维护先读根目录 AGENTS.md；保持现有未提交改动，不重置、合并或发布。构建前按项目要求 npm install，再完成 build 与格式检查。无代码变化的目录迁移不重新打包。

真实阅读资料与独立测试资料分开。验收目录的 local-library-backups 含用户本地库的恢复副本，不是测试垃圾。运行会重写数据库、安装目录或用户设置的历史修复脚本前，重新核对范围。

## 迁移说明

源码与验收目录保持相邻，原有相对路径继续有效。两目录迁移前后 87,167 个文件、11,127 个子目录逐项比对 SHA-256、大小及路径一致，Git 未提交状态一致。桌面、开始菜单及本软件卸载登记已改到新目录。

旧日志、测试快照和压缩包保留当时路径，不全盘替换历史内容。重跑历史脚本时先将其显式旧根路径映射到新根目录，避免在中转区重新生成副本。原位置没有留下第二份工作目录。

完整清单、哈希、快捷方式和登记备份位于 `D:/8.Project/8.其他/项目整理记录/2026-11-16-Fluent-Reader迁入维护`。
