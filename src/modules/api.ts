import { TranslatorSettings, validateBaseUrl } from "./settings";

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
      warning: status === 404,
      message:
        status === 404
          ? "服务已响应（HTTP 404），但 /models 不存在；请检查 Base URL 是否需要 /v1。"
          : `服务已响应（HTTP ${status}）。此测试仅检查 /models 是否收到响应。`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "连接测试失败。",
    };
  }
}
