# Zotero BabelDOC Translator

这是一个只适配 Zotero 10 的本地插件。插件不会安装或升级 BabelDOC，用户需要先在 Zotero 外完成固定版本安装：

```bash
uv tool install --python 3.12 "BabelDOC==0.6.4"
```

安装插件后，在 Zotero 的插件设置中填写 OpenAI-compatible API 的 Base URL、API Key 和模型，使用“测试 Base URL / Key”确认连接，再保存配置。插件会在 Zotero 数据目录的 `babeldoc-translator/babeldoc.toml` 中维护配置，并在翻译任务目录中使用副本执行，避免配置修改影响正在运行的任务。

在文献下选中一个本地 PDF 附件，右键选择“使用 BabelDOC 翻译 PDF”。第一版使用阶段状态显示，不解析或伪造 BabelDOC 的百分比进度；翻译完成后仅导入单语 PDF，并作为同一父文献的子附件保存，原始 PDF 不会被修改。
