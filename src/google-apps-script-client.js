export function hasGoogleIntegrationConfig(config) {
  return Boolean(config?.endpointUrl?.trim());
}

export async function postToAppsScript(config, payload) {
  const endpointUrl = config.endpointUrl.trim();
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      ...payload,
      integrationKey: config.integrationKey || '',
      spreadsheetId: config.spreadsheetId || '',
      sheetName: config.sheetName || 'leituras',
      source: 'solo-companhia-lims',
      sentAt: new Date().toISOString(),
    }),
  });

  const text = await response.text();
  const data = parseJsonResponse(text);

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Apps Script retornou HTTP ${response.status}`);
  }

  return data ?? { ok: true };
}

export function syncQueueToAppsScript(config, items) {
  return postToAppsScript(config, {
    kind: 'sync-batch',
    items,
  });
}

export function testAppsScriptConnection(config) {
  return postToAppsScript(config, {
    kind: 'health-check',
    items: [],
  });
}

function parseJsonResponse(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

