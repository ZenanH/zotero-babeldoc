# Zotero BabelDOC

![Zotero BabelDOC](https://raw.githubusercontent.com/ZenanH/zotero-babeldoc/main/addon/content/icons/favicon.png)

Zotero 10 插件：从 Zotero 中直接调用本机的 BabelDOC 翻译 PDF，并把翻译结果作为同一篇文献的子附件保存。原始 PDF 不会被修改。项目主页和安装包位于 [GitHub](https://github.com/ZenanH/zotero-babeldoc)，最新安装包可从 [Releases](https://github.com/ZenanH/zotero-babeldoc/releases/latest) 下载。

## 功能

- 在 PDF 附件右键菜单中启动翻译。
- 在 Zotero 主窗口底部使用固定状态栏显示阶段和活动任务数，不伪造百分比进度；新增任务会更新同一状态栏，全部任务结束后自动收起。
- 支持仅中文翻译 PDF，或原文 + 中文左右分页 PDF。
- API Base URL、API Key、模型和翻译参数保存在 Zotero 插件设置中。
- BabelDOC 使用插件专用的 uv / Python 虚拟环境，不会修改用户已有的 BabelDOC。
- 翻译结果自动添加到原文献下。

## 部署 BabelDOC

插件不会在启动时自动联网安装运行时。打开 Zotero BabelDOC 设置页，点击“部署 / 修复 BabelDOC”。插件会先检测固定版本的 uv；如果系统中没有合适版本，就把它安装到插件专用目录，然后用 uv 管理固定版本的 Python、BabelDOC 和依赖。

运行时目录为：

```text
~/.babeldoc-translator/
├── uv/0.12.13/                  # 插件专用 uv
├── runtimes/runtime-<runtime-id>-<deployment>/venv/ # 已验证的 Python 环境
└── active-runtime.json          # 已验证并正在使用的运行时
```

部署过程先在新目录完成安装和 `babeldoc --version` 校验，成功后才切换 `active-runtime.json`，再清理未使用的旧环境。翻译任务正在使用旧环境时，旧环境会等任务结束后再清理。

## 固定版本与依赖

当前插件 `0.1.12` 的运行时约束如下：

| 组件                       | 固定版本                                                 |
| -------------------------- | -------------------------------------------------------- |
| uv                         | `0.12.13`                                                |
| Python                     | `3.12.13`                                                |
| BabelDOC                   | `0.6.4`                                                  |
| 依赖锁文件                 | [`runtime/uv.lock`](runtime/uv.lock)                     |
| 部署清单（版本 + SHA-256） | [`runtime/requirements.lock`](runtime/requirements.lock) |

锁文件包含 BabelDOC 的完整传递依赖、平台标记和包哈希；插件构建时会把部署清单嵌入 XPI，因此用户不需要手工复制 Python 配置文件。当前锁定的主要依赖包括：

直接依赖为 `BabelDOC==0.6.4`；锁定的主要传递依赖包括：`numpy==2.5.3`、`scipy==1.18.1`、`scikit-image==0.26.0`、`scikit-learn==1.9.1`、`onnx==1.23.0`、`onnxruntime==1.30.0`、`opencv-python-headless==5.0.0.93`、`PyMuPDF==1.28.2`、`pydantic==2.13.5`、`openai==3.19.2`、`httpx==0.28.1`、`huggingface-hub==2.0.0`、`tiktoken==0.14.0`、`cryptography==50.0.1`、`freetype-py==2.5.1`、`uharfbuzz==0.56.2`、`xsdata==26.2`。完整依赖的版本、平台标记和 SHA-256 哈希以 `runtime/requirements.lock` 为准。

用户自己的 uv、Python 或 BabelDOC 不会被插件复用或升级。插件只有在发布了声明新运行时的新版插件后，才会要求重新部署。

## BabelDOC 版本升级

插件会严格检查运行时 ID、uv、Python 和 BabelDOC 版本。如果未来插件支持新版本，设置页的检测按钮会提示运行时不匹配；用户点击“部署 / 修复 BabelDOC”后，插件会部署新环境，验证成功后再清理旧环境。

## 配置与使用

1. 从 [Releases](https://github.com/ZenanH/zotero-babeldoc/releases/latest) 下载并安装 XPI。
2. 打开 Zotero 插件设置，点击“部署 / 修复 BabelDOC”，等待部署完成。
3. 填写 OpenAI-compatible API 的 Base URL、API Key 和模型。
4. 点击“测试服务器连接”，确认服务器可达后保存配置。此轻量测试不验证 API Key 或模型，也不会发起计费的模型请求。
5. 在文献下选中一个本地 PDF 附件，右键选择“使用 BabelDOC 翻译 PDF”。
6. 在设置页选择输出类型：
   - **仅中文翻译 PDF**：只导入单语翻译结果，默认选项。
   - **原文 + 中文（左右分页）**：导入 BabelDOC 的双语结果。

插件会在 Zotero 数据目录的 `babeldoc-translator/babeldoc.toml` 中维护 TOML，并在每个翻译任务中使用配置副本。输出模式会自动转换为 BabelDOC 的 `no-dual` 和 `no-mono` 选项，不需要手工编辑 TOML。

## 兼容性

当前版本只适配 Zotero 10，并固定 uv `0.12.13`、Python `3.12.13`、BabelDOC `0.6.4`。GitHub Actions 会构建 XPI，并在 Ubuntu、macOS Apple Silicon 和 Windows 上验证运行时锁文件。仓库中的每个版本标签都会自动发布 XPI。

## 上游版本提醒

仓库包含每月运行一次的 GitHub Actions 检查：如果 Zotero 出现新的大版本，或 PyPI 上的 BabelDOC 版本高于插件固定版本，工作流会创建提醒 Issue 并提及仓库维护者。请在 GitHub 中 Watch 此仓库的 Issues，GitHub 才能按账户通知设置发送邮件提醒。
