# Zotero BabelDOC

Zotero 10 插件：从 Zotero 中直接调用本机的 BabelDOC 翻译 PDF，并把翻译结果作为同一篇文献的子附件保存。原始 PDF 不会被修改。项目主页和安装包位于 [GitHub](https://github.com/ZenanH/zotero-babeldoc)，最新安装包可从 [Releases](https://github.com/ZenanH/zotero-babeldoc/releases/latest) 下载。

## 功能

- 在 PDF 附件右键菜单中启动翻译。
- 在右下角显示阶段状态，不伪造百分比进度。
- 支持仅中文翻译 PDF，或原文 + 中文左右分页 PDF。
- API Base URL、API Key、模型和翻译参数保存在 Zotero 插件设置中。
- BabelDOC 使用独立的 uv 虚拟环境，不会修改用户已有的 BabelDOC。
- 翻译结果自动添加到原文献下。

## 安装 BabelDOC

请先在 Zotero 外安装 [uv](https://docs.astral.sh/uv/)，再创建插件专用环境。插件当前固定使用 `BabelDOC==0.6.4`。

macOS/Linux：

```bash
uv venv --no-project --allow-existing --python 3.12 "$HOME/.babeldoc-translator/venv"
uv pip install --python "$HOME/.babeldoc-translator/venv/bin/python" --upgrade "BabelDOC==0.6.4"
```

Windows PowerShell：

```powershell
$BabelDocVenv = Join-Path $HOME ".babeldoc-translator\venv"
$BabelDocPython = Join-Path $BabelDocVenv "Scripts\python.exe"
uv venv --no-project --allow-existing --python 3.12 $BabelDocVenv
uv pip install --python $BabelDocPython --upgrade "BabelDOC==0.6.4"
```

安装插件后，也可以直接复制 Zotero 设置页显示的对应命令。插件只检测这个独立环境中的 BabelDOC；用户之后升级自己的全局 BabelDOC，不会影响 Zotero 翻译环境。

## 配置与使用

1. 从 [Releases](https://github.com/ZenanH/zotero-babeldoc/releases/latest) 下载并安装 XPI。
2. 打开 Zotero 插件设置，填写 OpenAI-compatible API 的 Base URL、API Key 和模型。
3. 点击“测试 Base URL / Key”，确认连接正常后保存配置。
4. 在文献下选中一个本地 PDF 附件，右键选择“使用 BabelDOC 翻译 PDF”。
5. 在设置页选择输出类型：
   - **仅中文翻译 PDF**：只导入单语翻译结果，默认选项。
   - **原文 + 中文（左右分页）**：导入 BabelDOC 的双语结果。

插件会在 Zotero 数据目录的 `babeldoc-translator/babeldoc.toml` 中维护 TOML，并在每个翻译任务中使用配置副本。输出模式会自动转换为 BabelDOC 的 `no-dual` 和 `no-mono` 选项，不需要手工编辑 TOML。

## 兼容性

当前版本只适配 Zotero 10，并固定 BabelDOC 版本为 `0.6.4`。仓库中的每个版本标签都会由 GitHub Actions 自动构建并发布 XPI。

## 上游版本提醒

仓库包含每月运行一次的 GitHub Actions 检查：如果 Zotero 出现新的大版本，或 PyPI 上的 BabelDOC 版本高于插件固定版本，工作流会创建提醒 Issue 并提及仓库维护者。请在 GitHub 中 Watch 此仓库的 Issues，GitHub 才能按账户通知设置发送邮件提醒。
