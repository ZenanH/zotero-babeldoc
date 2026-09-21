import { TranslatorSettings, validateSettings } from "./settings";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export async function testConnection(
  settings: TranslatorSettings,
): Promise<ConnectionTestResult> {
  try {
    validateSettings(settings);
    const endpoint = `${settings.baseUrl.replace(/\/+$/, "")}/models`;
    const response = await Zotero.HTTP.request("GET", endpoint, {
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
      timeout: 15000,
      successCodes: false,
    });
    const status = Number(response.status || 0);
    if (status === 401 || status === 403) {
      return {
        ok: false,
        message: `服务拒绝请求（HTTP ${status}），请检查 API Key。`,
      };
    }
    if (status === 404 || status === 405) {
      return {
        ok: true,
        message: `服务可达，但该服务不支持 /models 接口（HTTP ${status}）。`,
      };
    }
    if (status < 200 || status >= 300) {
      return { ok: false, message: `服务返回 HTTP ${status}。` };
    }

    let modelWarning = "";
    try {
      const body = JSON.parse(response.responseText || "{}");
      const models = Array.isArray(body.data)
        ? body.data.map((entry: any) => entry?.id).filter(Boolean)
        : [];
      if (models.length > 0 && !models.includes(settings.model)) {
        modelWarning = `服务可达，但模型列表中未找到 ${settings.model}。`;
      }
    } catch {
      modelWarning = "服务可达，但响应不是标准模型列表。";
    }
    return {
      ok: true,
      message: modelWarning || "Base URL 和 API Key 连接正常。",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "连接测试失败。",
    };
  }
}
