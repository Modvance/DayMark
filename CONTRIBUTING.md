# 参与 Daymark 开发

## 本地开发

使用 Node.js 24，在仓库根目录执行 `npm ci`、`npm test`、`npm start`。Windows PowerShell 中可将 `npm` 写成 `npm.cmd`。

任务与长期目标的数据规则集中在 `src/domain.js`，主窗口与桌面组件共用。修改数据结构时，需要兼容旧版本、保留迁移备份并验证导入导出。不要更改 `package.json` 中既有的应用名称与 `build.appId`，以免影响原数据位置和安装升级识别。

修改窗口或组件行为后，请在 Windows 实机检查普通桌面模式、置顶模式、Win+D、缩放、多屏与重启恢复。浏览器预览及模拟测试不能替代 Win32 行为验证。

## 构建与发布

- `main` 的提交及面向 `main` 的 PR 会运行测试并生成 Windows x64 安装包。
- 在 Actions 对应成功运行中下载 `Daymark-Windows-x64` 构建产物。
- 更新 `package.json` / `package-lock.json` 版本、安装说明与变更记录后，推送对应的 `v版本号` 标签，例如 `v0.5.1`。
- 标签版本必须与 `package.json` 一致。工作流通过后会创建包含安装包和校验文件的 **Draft Release**。
- 维护者完成 Windows 安装、升级、卸载、开机启动、通知和桌面组件实测后，再发布 Release。工作流不会覆盖已发布版本的资产。

当前默认构建未签名安装包。`npm run release:win` 负责测试、预览生成、构建与包内容验证；所有构建命令都禁止 electron-builder 自行发布，分发由独立的标签发布步骤完成。

## 问题反馈

请提供 Daymark 版本、Windows 版本、复现步骤、期望与实际结果，以及相关组件模式。请使用示例任务描述问题，不要在公开 Issue 中上传个人日程备份、凭据或签名证书。

## 许可证

沿用仓库已有的 MIT 许可证，版权声明以根目录 `LICENSE` 为准。Electron / Chromium 的第三方许可随安装包分发。
