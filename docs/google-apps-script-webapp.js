/**
 * Solo & Companhia - Web App Google Apps Script
 *
 * Como usar:
 * 1. Crie uma planilha Google com abas "leituras", "cq", "auditoria" e "sync_log".
 * 2. Cole este script no Apps Script vinculado a planilha.
 * 3. Ajuste INTEGRATION_KEY.
 * 4. Publique como Web App.
 * 5. Configure a URL /exec na interface de bancada.
 */

const INTEGRATION_KEY = 'troque-esta-chave';

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    validateRequest_(request);

    if (request.kind === 'health-check') {
      return json_({
        ok: true,
        message: 'Apps Script online',
        receivedAt: new Date().toISOString(),
      });
    }

    if (request.kind !== 'sync-batch') {
      throw new Error(`Tipo de requisicao nao suportado: ${request.kind}`);
    }

    const spreadsheet = request.spreadsheetId
      ? SpreadsheetApp.openById(request.spreadsheetId)
      : SpreadsheetApp.getActiveSpreadsheet();

    const items = Array.isArray(request.items) ? request.items : [];
    const result = appendItems_(spreadsheet, items, request);

    appendRows_(getSheet_(spreadsheet, 'sync_log', [
      'received_at',
      'source',
      'count',
      'reading_rows',
      'qc_rows',
    ]), [[
      new Date(),
      request.source || '',
      items.length,
      result.readingRows,
      result.qcRows,
    ]]);

    return json_({
      ok: true,
      received: items.length,
      readingRows: result.readingRows,
      qcRows: result.qcRows,
    });
  } catch (error) {
    return json_({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
}

function validateRequest_(request) {
  if (!INTEGRATION_KEY || INTEGRATION_KEY === 'troque-esta-chave') {
    throw new Error('Configure INTEGRATION_KEY no Apps Script antes de usar.');
  }

  if (request.integrationKey !== INTEGRATION_KEY) {
    throw new Error('Chave de integracao invalida.');
  }
}

function appendItems_(spreadsheet, items, request) {
  const readingsSheetName = request.sheetName || 'leituras';
  const readings = [];
  const qcs = [];
  const audits = [];

  items.forEach((item) => {
    const payload = item.payload || {};
    const common = [
      item.id,
      item.type,
      item.createdAt,
      request.sentAt,
      request.source || '',
      JSON.stringify(payload),
    ];

    audits.push(common);

    if (item.type === 'READING_CREATED') {
      readings.push([
        item.id,
        payload.batchId || '',
        payload.benchId || '',
        payload.benchName || '',
        payload.tube || '',
        payload.analysisCode || '',
        payload.instrumentCode || '',
        payload.rawValue || '',
        payload.dilutionFactor || '',
        payload.finalValue || '',
        item.createdAt || '',
        request.sentAt || '',
      ]);
    }

    if (item.type === 'QUALITY_CONTROL_PERFORMED') {
      qcs.push([
        item.id,
        payload.batchId || '',
        payload.benchId || '',
        payload.analysisCode || '',
        item.createdAt || '',
        request.sentAt || '',
      ]);
    }
  });

  appendRows_(getSheet_(spreadsheet, readingsSheetName, [
    'reading_id',
    'batch_id',
    'bench_id',
    'bench_name',
    'sample_position',
    'analysis_code',
    'instrument_code',
    'raw_value',
    'dilution_factor',
    'corrected_value',
    'created_at',
    'synced_at',
  ]), readings);

  appendRows_(getSheet_(spreadsheet, 'cq', [
    'qc_id',
    'batch_id',
    'bench_id',
    'analysis_code',
    'created_at',
    'synced_at',
  ]), qcs);

  appendRows_(getSheet_(spreadsheet, 'auditoria', [
    'event_id',
    'event_type',
    'created_at',
    'synced_at',
    'source',
    'payload_json',
  ]), audits);

  return {
    readingRows: readings.length,
    qcRows: qcs.length,
  };
}

function getSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
    .setValues(rows);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

