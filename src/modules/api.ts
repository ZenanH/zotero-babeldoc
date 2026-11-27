import {
  getApiBaseUrl,
  TranslatorSettings,
  usesResponsesApi,
  validateBaseUrl,
} from "./settings";

export interface ConnectionTestResult {
  ok: boolean;
  warning?: boolean;
  message: string;
}

export async function testConnection(
  settings: TranslatorSettings,
): Promise<ConnectionTestResult> {
  try {
    validateBaseUrl(settings.baseUrl);
    const endpoint = usesResponsesApi(settings)
      ? `${getApiBaseUrl(settings.baseUrl)}/responses`
      : `${getApiBaseUrl(settings.baseUrl)}/chat/completions`;
    const headers: Record<string, string> = {};
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    const testWords = ["hello", "world", "PDF"];
    for (let index = 0; index < testWords.length; index += 1) {
      const response = await Zotero.HTTP.request("POST", endpoint, {
        body: JSON.stringify(buildTestPayload(settings, testWords[index])),
        headers: { ...headers, "Content-Type": "application/json" },
        timeout: 15000,
        successCodes: false,
        errorDelayMax: 0,
      });
      const status = Number(response.status || 0);
      const responseText = String(
        response.responseText || response.response || "",
      );
      if (status < 200 || status >= 300) {
        return {
          ok: false,
          message: `第 ${index + 1}/3 次请求失败：HTTP ${status}。${getApiError(responseText)}`,
        };
      }
      if (!responseText) {
        return {
          ok: false,
          message: `第 ${index + 1}/3 次请求失败：服务返回内容为空。`,
        };
      }
      if (!hasTranslationText(settings, responseText)) {
        return {
          ok: false,
          message: `第 ${index + 1}/3 次请求失败：返回内容不符合所选 API 格式。`,
        };
      }
    }
    return {
      ok: true,
      message: `测试成功：已通过 ${usesResponsesApi(settings) ? "Responses" : "Chat Completions"} 完成 3 次短文本翻译请求。`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "连接测试失败。",
    };
  }
}

function buildTestPayload(
  settings: TranslatorSettings,
  word: string,
): Record<string, unknown> {
  const prompt = `Translate the word: ${word}`;
  const reasoning =
    settings.reasoningEffort === "omit"
      ? {}
      : { reasoning: { effort: settings.reasoningEffort } };
  return usesResponsesApi(settings)
    ? {
        model: settings.model,
        input: prompt,
        ...reasoning,
        store: false,
      }
    : {
        model: settings.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        ...reasoning,
      };
}

function hasTranslationText(
  settings: TranslatorSettings,
  responseText: string,
): boolean {
  try {
    const payload = JSON.parse(responseText) as {
      output_text?: unknown;
      output?: Array<{ type?: string; content?: Array<{ text?: unknown }> }>;
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    if (usesResponsesApi(settings)) {
      if (typeof payload.output_text === "string") {
        return payload.output_text.trim().length > 0;
      }
      return Boolean(
        payload.output?.some((item) =>
          item.content?.some(
            (content) =>
              typeof content.text === "string" &&
              content.text.trim().length > 0,
          ),
        ),
      );
    }
    return Boolean(
      payload.choices?.some(
        (choice) =>
          typeof choice.message?.content === "string" &&
          choice.message.content.trim().length > 0,
      ),
    );
  } catch {
    return false;
  }
}

function getApiError(responseText: string): string {
  try {
    const payload = JSON.parse(responseText) as {
      error?: { message?: string };
      message?: string;
    };
    const message = payload.error?.message || payload.message;
    return message ? `原因：${message}` : "";
  } catch {
    return "";
  }
}
