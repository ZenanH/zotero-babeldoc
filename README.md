# Zotero BabelDOC Translator

这是一个只适配 Zotero 10 的本地插件。插件使用独立的 Python 虚拟环境，不会使用或升级用户已有的 BabelDOC。用户需要先在 Zotero 外完成固定版本安装。

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

插件只会检测上述独立环境中的 BabelDOC。即使用户之后升级自己的全局 BabelDOC，也不会影响 Zotero 翻译环境。

安装插件后，在 Zotero 的插件设置中填写 OpenAI-compatible API 的 Base URL、API Key 和模型，使用“测试 Base URL / Key”确认连接，再保存配置。插件会在 Zotero 数据目录的 `babeldoc-translator/babeldoc.toml` 中维护配置，并在翻译任务目录中使用副本执行，避免配置修改影响正在运行的任务。

在文献下选中一个本地 PDF 附件，右键选择“使用 BabelDOC 翻译 PDF”。第一版使用阶段状态显示，不解析或伪造 BabelDOC 的百分比进度；翻译完成后会把结果作为同一父文献的子附件保存，原始 PDF 不会被修改。

设置页中的“翻译结果”可以选择：

- **仅中文翻译 PDF**：只导入单语翻译结果，默认选项。
- **原文 + 中文（左右分页）**：导入 BabelDOC 的双语结果，在同一页左右排列原文和译文。

插件会根据选择自动维护 TOML 中的 `no-dual` 和 `no-mono`，不需要用户手工编辑配置文件。
