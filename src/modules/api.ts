import { TranslatorSettings, validateBaseUrl } from "./settings";

export interface ConnectionTestResult {
  ok: boolean;
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
      message: `连接成功（HTTP ${status}）。`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "连接测试失败。",
    };
  }
}
