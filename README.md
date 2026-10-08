# Zotero BabelDOC

![Zotero BabelDOC](https://raw.githubusercontent.com/ZenanH/zotero-babeldoc/main/addon/content/icons/favicon.png)

Zotero 10 插件：在本机调用 BabelDOC 翻译 PDF，并把翻译结果作为同一篇文献的子附件保存。原始 PDF 不会被修改。安装包位于 [GitHub Releases](https://github.com/ZenanH/zotero-babeldoc/releases/latest)。

## 功能

- 在 PDF 附件右键菜单中启动翻译，多个 PDF 可以同时处理。
- 在设置页填写完整的模型 Base URL、API Key 和模型名称；测试连接只访问 `/models`。
- 选择源语言、导出语言，以及仅译文或原文 + 译文 PDF。
- 翻译过程在 Zotero 主窗口底部显示当前阶段和活动任务数。
- BabelDOC 使用插件专用的 uv / Python 虚拟环境，不会修改系统环境。

## 配置与使用

1. 从 [Releases](https://github.com/ZenanH/zotero-babeldoc/releases/latest) 下载并安装 XPI。
2. 打开 Zotero BabelDOC 设置页，点击“配置 / 修复环境”，等待状态变为“已完成”并确认环境路径。
3. 填写完整的 Base URL（通常以 `/v1` 结尾，例如 `https://api.openai.com/v1`）、API Key 和模型名称，点击“测试连接”，然后保存设置。纯域名会提示补上 API 路径。
4. 填写源语言和导出语言。导出语言会同时写入 BabelDOC 配置、模型提示和输出文件匹配规则。
5. 在文献下选中本地 PDF 附件，右键选择“使用 BabelDOC 翻译 PDF”。翻译结果会作为子附件导入。

目标语言支持 BabelDOC 语言代码；中文可填写 `zh`、`zh-CN` 或“中文”，插件统一使用 `zh-cn`。输出模式会自动转换为 BabelDOC 的 `no-dual` 和 `no-mono` 选项。插件会绕过旧翻译缓存，避免复用其他语言的结果。
插件会在导入前检查 BabelDOC 的最终翻译记录；如果没有可验证的段落输出，或者结果缺少目标语言内容，会阻止导入未翻译的 PDF。BabelDOC 已成功恢复的中间回退不影响导入。

## 运行时

插件不会在启动时自动安装运行时。用户点击设置页按钮后，插件在 `~/.babeldoc-translator/` 中配置固定版本的 uv、Python 和 BabelDOC，并在校验成功后写入活动运行时清单。当前版本 `0.1.25` 固定：

| 组件                       | 版本                                                     |
| -------------------------- | -------------------------------------------------------- |
| uv                         | `0.12.23`                                                |
| Python                     | `3.12.15`                                                |
| BabelDOC                   | `0.6.4`                                                  |
| 依赖锁文件                 | [`runtime/uv.lock`](runtime/uv.lock)                     |
| 部署清单（版本 + SHA-256） | [`runtime/requirements.lock`](runtime/requirements.lock) |

部署目录使用独立的虚拟环境，活动任务占用的旧环境会在任务结束后再清理。用户已有的 uv、Python 或 BabelDOC 不会被插件升级或修改。

## 开发与发布

```bash
uv lock --directory runtime
uv export --directory runtime --locked --format requirements-txt --no-dev --output-file runtime/requirements.lock
pnpm run python-lock:embed
pnpm run build
```

GitHub Actions 会在 Ubuntu、macOS Apple Silicon 和 Windows 上验证锁定运行时，并在版本标签下发布 XPI。仓库还包含每月一次的上游版本检查。
