import { TranslatorSettings, validateBaseUrl } from "./settings";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function testConnection(
  settings: TranslatorSettings,
): Promise<ConnectionTestResult> {
  try {
    validateBaseUrl(settings.baseUrl);
    const endpoint = `${settings.baseUrl.replace(/\/+$/, "")}/models`;
    const headers: Record<string, string> = {};
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    const response = await Zotero.HTTP.request("GET", endpoint, {
      headers,
      timeout: 15000,
      successCodes: false,
    });
    const status = Number(response.status || 0);
    return {
      ok: true,
      message: `服务器可达（HTTP ${status}）。此测试不验证 API Key 或模型。`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "连接测试失败。",
    };
  }
}

export async function requestChatCompletion(
  settings: TranslatorSettings,
  messages: ChatMessage[],
): Promise<string> {
  validateBaseUrl(settings.baseUrl);
  if (!settings.apiKey) throw new Error("请填写 API Key。");
  if (!settings.model) throw new Error("请填写模型名称。");

  const endpoint = `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  let response: any;
  try {
    response = await Zotero.HTTP.request("POST", endpoint, {
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: settings.model, messages }),
      timeout: 120000,
      successCodes: false,
      errorDelayIntervals: [],
      errorDelayMax: 0,
      logBodyLength: 0,
    });
  } catch (error) {
    throw new Error(redactApiKey(errorMessage(error), settings.apiKey), {
      cause: error,
    });
  }

  const status = Number(response.status || 0);
  const responseText = String(response.responseText || "");
  if (status < 200 || status >= 300) {
    let message = responseText;
    try {
      const body = JSON.parse(responseText);
      message = body?.error?.message || body?.message || responseText;
    } catch {
      // Keep the server's plain-text error response.
    }
    throw new Error(
      `模型 API 请求失败（HTTP ${status}）。${redactApiKey(message, settings.apiKey).slice(0, 600)}`,
    );
  }

  let body: any;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error("模型 API 返回的不是有效 JSON。");
  }
  const content = body?.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part: any) =>
              typeof part?.text === "string" ? part.text : "",
            )
            .filter(Boolean)
            .join("\n")
        : "";
  if (!text.trim()) {
    const detail = body?.error?.message || "响应中没有可用的总结文本";
    throw new Error(
      redactApiKey(String(detail), settings.apiKey).slice(0, 600),
    );
  }
  return text.trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactApiKey(message: string, apiKey: string): string {
  return apiKey ? message.replaceAll(apiKey, "[API_KEY]") : message;
}
