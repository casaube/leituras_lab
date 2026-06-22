import {
  ANALYSES,
  DEVICE_PROFILES,
  MIN_CALIBRATION_R2,
  QC_INTERVAL,
  RACK_TEMPLATES,
  STATUS_LABELS,
  STATUS_ORDER,
  STORAGE_KEY,
} from './data.js';

const app = document.querySelector('#app');

const serialSession = {
  port: null,
  reader: null,
  keepReading: false,
  buffer: '',
  lastLine: '',
  connected: false,
};

const defaultTemplate = RACK_TEMPLATES.RACK_50_5X10;

const state = loadState();

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createRack(rows, columns) {
  return Array.from({ length: rows * columns }, (_, index) => ({
    position: index + 1,
    status: index === 0 ? 'current' : 'pending',
    rawValue: null,
    correctedValue: null,
    dilutionFactor: 1,
    updatedAt: null,
  }));
}

function createBench(input = {}) {
  const template = input.template ?? defaultTemplate;
  const benchId = uid('bench');
  const instrumentCode = input.instrumentCode ?? 'KASVI_K37_UVVIS0';
  const deviceProfile = DEVICE_PROFILES[instrumentCode] ?? DEVICE_PROFILES.KASVI_K37_UVVIS0;

  return {
    id: benchId,
    name: input.name ?? 'Bancada Colorimetria',
    batchId: input.batchId ?? `L-${new Date().getFullYear()}-06`,
    analystName: input.analystName ?? 'Joao Silva',
    analysisCode: input.analysisCode ?? 'PHOSPHORUS',
    instrumentCode,
    baudRate: input.baudRate ?? deviceProfile.defaultBaudRate,
    parserPattern: input.parserPattern ?? deviceProfile.defaultParserPattern,
    calibrationR2: input.calibrationR2 ?? 0.998,
    rows: input.rows ?? template.rows,
    columns: input.columns ?? template.columns,
    currentPosition: 1,
    readingsSinceLastQc: 0,
    qcRequired: false,
    dilutionFactor: 1,
    draftReading: null,
    rack: createRack(input.rows ?? template.rows, input.columns ?? template.columns),
  };
}

function createInitialState() {
  const first = createBench({
    name: 'Bancada 1 - Colorimetria',
    template: RACK_TEMPLATES.RACK_50_5X10,
    analysisCode: 'PHOSPHORUS',
    instrumentCode: 'KASVI_K37_UVVIS0',
  });
  const second = createBench({
    name: 'Bancada 2 - Fotometria',
    template: RACK_TEMPLATES.TRAY_30_3X10,
    analysisCode: 'POTASSIUM',
    instrumentCode: 'FEMTO_600_PLUS',
  });

  return {
    selectedBenchId: first.id,
    sidebarCollapsed: false,
    benches: [first, second],
    alerts: [],
    auditTrail: [],
    syncQueue: [],
    lastSyncAt: null,
    addBenchDraft: {
      name: 'Nova bancada',
      templateCode: 'TRAY_30_3X10',
      rows: 3,
      columns: 10,
    },
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialState();

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.benches) || parsed.benches.length === 0) {
      return createInitialState();
    }

    return {
      ...createInitialState(),
      ...parsed,
      addBenchDraft: parsed.addBenchDraft ?? createInitialState().addBenchDraft,
    };
  } catch {
    return createInitialState();
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function selectedBench() {
  return state.benches.find((bench) => bench.id === state.selectedBenchId) ?? state.benches[0];
}

function selectedAnalysis(bench = selectedBench()) {
  return ANALYSES[bench.analysisCode];
}

function selectedDevice(bench = selectedBench()) {
  return DEVICE_PROFILES[bench.instrumentCode] ?? DEVICE_PROFILES.KASVI_K37_UVVIS0;
}

function addAlert(level, message) {
  state.alerts = [
    {
      id: uid('alert'),
      level,
      message,
      createdAt: nowIso(),
    },
    ...state.alerts,
  ].slice(0, 8);
  persist();
}

function appendAudit(type, payload) {
  state.auditTrail = [
    {
      id: uid('audit'),
      type,
      actor: selectedBench().analystName,
      occurredAt: nowIso(),
      payload,
    },
    ...state.auditTrail,
  ];
  persist();
}

function updateBench(benchId, patcher) {
  state.benches = state.benches.map((bench) => {
    if (bench.id !== benchId) return bench;
    return patcher({ ...bench, rack: bench.rack.map((tube) => ({ ...tube })) });
  });
  persist();
}

function isOverRange(rawValue, bench = selectedBench()) {
  return rawValue > selectedAnalysis(bench).maxCurveValue;
}

function correctedValue(rawValue, dilutionFactor) {
  return Number((rawValue * dilutionFactor).toFixed(3));
}

function remainingQc(bench = selectedBench()) {
  return Math.max(0, QC_INTERVAL - bench.readingsSinceLastQc);
}

function saveBlockReasons(bench = selectedBench()) {
  const reasons = [];

  if (bench.calibrationR2 < MIN_CALIBRATION_R2) {
    reasons.push('R2 da calibracao abaixo de 0,995');
  }

  if (bench.qcRequired) {
    reasons.push('CQ obrigatorio pendente');
  }

  if (!bench.draftReading) {
    reasons.push('Nenhuma leitura recebida');
  }

  if (bench.draftReading && isOverRange(bench.draftReading.rawValue, bench) && bench.dilutionFactor === 1) {
    reasons.push('Informar fator de diluicao');
  }

  return reasons;
}

function setCurrentTubeStatus(bench, status, extra = {}) {
  bench.rack = bench.rack.map((tube) => {
    if (tube.position !== bench.currentPosition) return tube;
    return { ...tube, status, updatedAt: nowIso(), ...extra };
  });
}

function markNextPendingAsCurrent(bench) {
  const next = bench.rack.find((tube) => tube.position > bench.currentPosition && tube.status === 'pending');
  if (!next) {
    bench.draftReading = null;
    bench.dilutionFactor = 1;
    return bench;
  }

  bench.currentPosition = next.position;
  bench.draftReading = null;
  bench.dilutionFactor = 1;
  bench.rack = bench.rack.map((tube) =>
    tube.position === next.position ? { ...tube, status: 'current' } : tube,
  );

  return bench;
}

function ingestReading(rawValue, source) {
  const bench = selectedBench();

  if (!Number.isFinite(rawValue)) {
    addAlert('error', 'Leitura descartada: valor numerico nao identificado.');
    return;
  }

  if (bench.qcRequired) {
    addAlert('warning', 'CQ pendente. Registre Branco e Amostra Controle antes de continuar.');
    return;
  }

  updateBench(bench.id, (draft) => {
    const overRange = isOverRange(rawValue, draft);
    draft.draftReading = {
      rawValue,
      source,
      receivedAt: nowIso(),
      instrumentCode: draft.instrumentCode,
    };
    setCurrentTubeStatus(draft, overRange ? 'overRange' : 'current', {
      rawValue,
      dilutionFactor: draft.dilutionFactor,
    });
    return draft;
  });

  appendAudit('READING_RECEIVED', {
    benchId: bench.id,
    tube: bench.currentPosition,
    rawValue,
    source,
  });

  addAlert(isOverRange(rawValue, bench) ? 'error' : 'success', isOverRange(rawValue, bench)
    ? `Estouro de escala na amostra ${bench.currentPosition}.`
    : `Leitura recebida na amostra ${bench.currentPosition}.`);

  render();
}

function parseDeviceValue(line, bench = selectedBench()) {
  const pattern = bench.parserPattern || selectedDevice(bench).defaultParserPattern;
  const regex = new RegExp(pattern);
  const match = line.match(regex);
  if (!match) return null;
  return Number.parseFloat(match[0].replace(',', '.'));
}

function simulateReading() {
  const bench = selectedBench();
  const max = selectedAnalysis(bench).maxCurveValue;
  const overRange = Math.random() > 0.88;
  const rawValue = overRange
    ? max + Math.random() * max * 0.8 + 0.05
    : Math.random() * max * 0.88 + max * 0.05;

  ingestReading(Number(rawValue.toFixed(3)), 'simulador');
}

function saveReading() {
  const bench = selectedBench();
  const reasons = saveBlockReasons(bench);
  if (reasons.length > 0) {
    addAlert('error', `Bloqueado: ${reasons.join('; ')}.`);
    render();
    return;
  }

  const rawValue = bench.draftReading.rawValue;
  const dilutionFactor = Math.max(1, Number(bench.dilutionFactor) || 1);
  const finalValue = correctedValue(rawValue, dilutionFactor);
  const status = dilutionFactor > 1 ? 'diluted' : 'completed';

  updateBench(bench.id, (draft) => {
    setCurrentTubeStatus(draft, status, {
      rawValue,
      correctedValue: finalValue,
      dilutionFactor,
    });

    const nextCount = draft.readingsSinceLastQc + 1;
    draft.readingsSinceLastQc = Math.min(QC_INTERVAL, nextCount);
    draft.qcRequired = nextCount >= QC_INTERVAL;
    markNextPendingAsCurrent(draft);
    return draft;
  });

  state.syncQueue.push({
    id: uid('reading'),
    type: 'READING_CREATED',
    status: 'pending',
    createdAt: nowIso(),
    payload: {
      benchId: bench.id,
      benchName: bench.name,
      batchId: bench.batchId,
      analysisCode: bench.analysisCode,
      instrumentCode: bench.instrumentCode,
      tube: bench.currentPosition,
      rawValue,
      dilutionFactor,
      finalValue,
    },
  });

  appendAudit('READING_SAVED', {
    benchId: bench.id,
    tube: bench.currentPosition,
    rawValue,
    dilutionFactor,
    finalValue,
  });

  const updated = selectedBench();
  addAlert(updated.qcRequired ? 'warning' : 'success', updated.qcRequired
    ? 'Leitura salva. Pausa de CQ obrigatoria ativada.'
    : updated.rack.some((tube) => tube.status === 'pending')
      ? 'Leitura salva e adicionada a fila de sincronizacao.'
      : 'Lote finalizado e adicionado a fila de sincronizacao.');

  persist();
  render();
}

function completeQualityControl() {
  const bench = selectedBench();

  updateBench(bench.id, (draft) => {
    draft.readingsSinceLastQc = 0;
    draft.qcRequired = false;
    return draft;
  });

  appendAudit('QUALITY_CONTROL_PERFORMED', {
    benchId: bench.id,
    batchId: bench.batchId,
    analysisCode: bench.analysisCode,
  });

  state.syncQueue.push({
    id: uid('qc'),
    type: 'QUALITY_CONTROL_PERFORMED',
    status: 'pending',
    createdAt: nowIso(),
    payload: {
      benchId: bench.id,
      batchId: bench.batchId,
      analysisCode: bench.analysisCode,
    },
  });

  addAlert('success', 'CQ registrado. Bancada liberada.');
  persist();
  render();
}

function jumpToTube(position) {
  const bench = selectedBench();
  if (position === bench.currentPosition) return;

  const tube = bench.rack.find((item) => item.position === position);
  if (!tube || !['pending', 'overRange', 'current'].includes(tube.status)) return;

  const confirmed = window.confirm(`Confirmar salto da amostra ${bench.currentPosition} para ${position}?`);
  if (!confirmed) return;

  beep();

  updateBench(bench.id, (draft) => {
    draft.rack = draft.rack.map((item) => {
      if (item.position === draft.currentPosition && item.status === 'current') {
        return { ...item, status: 'pending' };
      }
      if (item.position === position && ['pending', 'overRange'].includes(item.status)) {
        return { ...item, status: 'current' };
      }
      return item;
    });
    draft.currentPosition = position;
    draft.draftReading = null;
    draft.dilutionFactor = 1;
    return draft;
  });

  appendAudit('SEQUENCE_JUMP_CONFIRMED', {
    benchId: bench.id,
    from: bench.currentPosition,
    to: position,
  });

  addAlert('warning', `Salto de sequencia registrado: ${bench.currentPosition} -> ${position}.`);
  render();
}

function beep() {
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audio.close();
    }, 180);
  } catch {
    // Alguns navegadores exigem permissao de audio; o alerta visual permanece.
  }
}

async function connectSerial() {
  if (!('serial' in navigator)) {
    addAlert('error', 'Web Serial indisponivel neste navegador. Use Chrome/Edge em localhost ou HTTPS.');
    render();
    return;
  }

  try {
    const bench = selectedBench();
    serialSession.port = await navigator.serial.requestPort();
    await serialSession.port.open({ baudRate: Number(bench.baudRate) || 9600 });
    serialSession.keepReading = true;
    serialSession.connected = true;
    addAlert('success', `Aparelho conectado em ${bench.baudRate} baud.`);
    render();
    readSerialLoop();
  } catch (error) {
    addAlert('error', error instanceof Error ? error.message : 'Falha ao conectar aparelho.');
    render();
  }
}

async function disconnectSerial() {
  serialSession.keepReading = false;

  try {
    if (serialSession.reader) {
      await serialSession.reader.cancel();
      serialSession.reader.releaseLock();
    }
    if (serialSession.port) {
      await serialSession.port.close();
    }
  } catch {
    // Porta ja pode ter sido fechada pelo navegador ou pelo cabo.
  } finally {
    serialSession.reader = null;
    serialSession.port = null;
    serialSession.connected = false;
    addAlert('warning', 'Aparelho desconectado.');
    render();
  }
}

async function readSerialLoop() {
  const decoder = new TextDecoder();

  while (serialSession.port?.readable && serialSession.keepReading) {
    serialSession.reader = serialSession.port.readable.getReader();

    try {
      while (serialSession.keepReading) {
        const { value, done } = await serialSession.reader.read();
        if (done) break;
        serialSession.buffer += decoder.decode(value, { stream: true });

        const lines = serialSession.buffer.split(/\r?\n/);
        serialSession.buffer = lines.pop() ?? '';

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned) continue;
          serialSession.lastLine = cleaned;
          const parsed = parseDeviceValue(cleaned);
          if (parsed !== null) {
            ingestReading(parsed, 'serial');
          } else {
            addAlert('warning', `Linha sem valor numerico: ${cleaned.slice(0, 48)}`);
          }
        }

        render();
      }
    } catch (error) {
      if (serialSession.keepReading) {
        addAlert('error', error instanceof Error ? error.message : 'Erro de leitura serial.');
      }
    } finally {
      serialSession.reader?.releaseLock();
      serialSession.reader = null;
    }
  }
}

function syncPending() {
  const pending = state.syncQueue.filter((item) => item.status === 'pending');
  state.syncQueue = state.syncQueue.map((item) =>
    item.status === 'pending'
      ? { ...item, status: 'synced', syncedAt: nowIso() }
      : item,
  );
  state.lastSyncAt = nowIso();

  appendAudit('SYNC_BATCH_SIMULATED', {
    count: pending.length,
    target: 'Google Drive / Sheets API',
  });

  addAlert('success', `${pending.length} registro(s) marcados como sincronizados.`);
  persist();
  render();
}

function addBench() {
  const template = RACK_TEMPLATES[state.addBenchDraft.templateCode] ?? RACK_TEMPLATES.TRAY_30_3X10;
  const rows = Math.max(1, Math.min(12, Number(state.addBenchDraft.rows) || template.rows));
  const columns = Math.max(1, Math.min(20, Number(state.addBenchDraft.columns) || template.columns));
  const bench = createBench({
    name: state.addBenchDraft.name || 'Nova bancada',
    template,
    rows,
    columns,
  });

  state.benches.push(bench);
  state.selectedBenchId = bench.id;
  appendAudit('BENCH_CREATED', { benchId: bench.id, name: bench.name, rows, columns });
  addAlert('success', `${bench.name} criada com ${rows * columns} posicoes.`);
  persist();
  render();
}

function applyLayoutToCurrentBench() {
  const bench = selectedBench();
  const rows = Math.max(1, Math.min(12, Number(document.querySelector('[data-field="rows"]').value) || bench.rows));
  const columns = Math.max(1, Math.min(20, Number(document.querySelector('[data-field="columns"]').value) || bench.columns));
  const hasSavedReadings = bench.rack.some((tube) => ['completed', 'diluted'].includes(tube.status));

  if (hasSavedReadings && !window.confirm('Trocar o layout reinicia o mapa da bancada atual. Confirmar?')) {
    return;
  }

  updateBench(bench.id, (draft) => ({
    ...draft,
    rows,
    columns,
    currentPosition: 1,
    draftReading: null,
    dilutionFactor: 1,
    rack: createRack(rows, columns),
  }));

  appendAudit('RACK_LAYOUT_CHANGED', { benchId: bench.id, rows, columns });
  addAlert('warning', `Layout aplicado: ${rows} fileiras x ${columns} posicoes.`);
  render();
}

function render() {
  const bench = selectedBench();
  const analysis = selectedAnalysis(bench);
  const device = selectedDevice(bench);
  const reasons = saveBlockReasons(bench);
  const pendingSyncCount = state.syncQueue.filter((item) => item.status === 'pending').length;

  app.innerHTML = `
    <div class="layout ${state.sidebarCollapsed ? 'is-collapsed' : ''}">
      <aside class="sidebar">
        <div class="brand">
          <img src="./assets/solo-companhia-logo.svg" alt="Laboratorio Solo & Companhia" />
        </div>
          <button class="icon-button sidebar-toggle" data-action="toggle-sidebar" title="Recolher menu">M</button>
        <nav class="nav-list" aria-label="Modulos LIMS">
          <button class="nav-item is-active" type="button"><span class="nav-icon">LB</span><span>Leitura de Bancada</span></button>
          <button class="nav-item" type="button" disabled><span class="nav-icon">RA</span><span>Recepcao de Amostras</span></button>
          <button class="nav-item" type="button" disabled><span class="nav-icon">ES</span><span>Estoque</span></button>
          <button class="nav-item" type="button" disabled><span class="nav-icon">$</span><span>Faturamento</span></button>
        </nav>
        <div class="sidebar-footer">
          <span class="micro-label">Fila offline</span>
          <strong>${pendingSyncCount}</strong>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div>
            <p class="eyebrow">Middleware LIMS</p>
            <h1>Interface de Aquisicao</h1>
            <span>${bench.analystName} | ${bench.batchId} | ${bench.name}</span>
          </div>
          <div class="topbar-actions">
            <div class="connection-pill ${serialSession.connected ? 'online' : 'offline'}">
              <span class="dot"></span>
              <div>
                <small>${serialSession.connected ? 'Aparelho conectado' : 'Sem porta serial'}</small>
                <strong>${serialSession.connected ? device.label : 'Online local'}</strong>
              </div>
            </div>
            <button class="soft-button" data-action="sync-pending" title="Sincronizar fila local">Sincronizar</button>
          </div>
        </header>

        <section class="bench-strip" aria-label="Bancadas">
          ${state.benches.map((item) => renderBenchTab(item)).join('')}
          <button class="bench-tab add" data-action="open-add-bench" type="button">+ Bancada</button>
        </section>

        <section class="workspace">
          <div class="left-column">
            ${renderRackPanel(bench)}
            ${renderAlertsPanel()}
            ${renderAuditPanel()}
          </div>

          <div class="right-column">
            ${renderBatchPanel(bench, analysis)}
            ${renderDevicePanel(bench, device)}
            ${renderReadingPanel(bench, analysis, reasons)}
            ${renderBenchManager()}
          </div>
        </section>
      </main>
    </div>
  `;

  wireEvents();
}

function renderBenchTab(bench) {
  const completed = bench.rack.filter((tube) => ['completed', 'diluted'].includes(tube.status)).length;
  const total = bench.rows * bench.columns;

  return `
    <button class="bench-tab ${bench.id === state.selectedBenchId ? 'is-active' : ''}" data-action="select-bench" data-id="${bench.id}" type="button">
      <span>${escapeHtml(bench.name)}</span>
      <strong>${completed}/${total}</strong>
    </button>
  `;
}

function renderRackPanel(bench) {
  return `
    <section class="panel rack-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Rack virtual</p>
          <h2>${bench.rows} fileiras x ${bench.columns} posicoes</h2>
        </div>
        <div class="legend">
          ${STATUS_ORDER.map((status) => `<span><i class="status-dot ${status}"></i>${STATUS_LABELS[status]}</span>`).join('')}
        </div>
      </div>
      <div class="rack-grid" style="--rack-columns: ${bench.columns};">
        ${bench.rack.map((tube) => `
          <button
            class="tube ${tube.status}"
            data-action="jump-tube"
            data-position="${tube.position}"
            title="Amostra ${tube.position}${tube.correctedValue ? ` | ${tube.correctedValue}` : ''}"
            type="button"
          >
            <span>${tube.position}</span>
            ${tube.correctedValue ? `<small>${tube.correctedValue}</small>` : ''}
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderBatchPanel(bench, analysis) {
  const calibrationClass = bench.calibrationR2 >= MIN_CALIBRATION_R2 ? 'ok' : 'danger';

  return `
    <section class="panel">
      <div class="panel-heading compact">
        <h2>Configuracao do lote</h2>
      </div>
      <label class="field">
        <span>Analise</span>
        <select data-action="change-analysis">
          ${Object.values(ANALYSES).map((item) => `
            <option value="${item.code}" ${item.code === bench.analysisCode ? 'selected' : ''}>
              ${item.label} (${item.method})
            </option>
          `).join('')}
        </select>
      </label>
      <div class="method-hint">
        <strong>${analysis.label}</strong>
        <span>${analysis.hint}</span>
      </div>
      <label class="field two-cols">
        <span>R2 calibracao</span>
        <input data-action="change-r2" type="number" min="0" max="1" step="0.0001" value="${bench.calibrationR2.toFixed(4)}" />
      </label>
      <div class="gate ${calibrationClass}">
        <span>Gatekeeper BPL</span>
        <strong>R2 = ${bench.calibrationR2.toFixed(4)}</strong>
      </div>
      <div class="qc-box ${bench.qcRequired ? 'danger' : ''}">
        <span>${bench.qcRequired ? 'CQ obrigatorio agora' : 'CQ programado'}</span>
        <strong>${bench.qcRequired ? 'Pausado' : `${remainingQc(bench)} leituras`}</strong>
        <button class="soft-button small" data-action="complete-qc" type="button">Registrar CQ</button>
      </div>
    </section>
  `;
}

function renderDevicePanel(bench, device) {
  return `
    <section class="panel">
      <div class="panel-heading compact">
        <h2>Conexao do aparelho</h2>
        <span class="serial-status ${serialSession.connected ? 'online' : 'offline'}">${serialSession.connected ? 'Serial ativa' : 'Aguardando'}</span>
      </div>
      <label class="field">
        <span>Aparelho</span>
        <select data-action="change-device">
          ${Object.values(DEVICE_PROFILES).map((item) => `
            <option value="${item.code}" ${item.code === bench.instrumentCode ? 'selected' : ''}>
              ${item.label} | ${item.family}
            </option>
          `).join('')}
        </select>
      </label>
      <div class="field-grid">
        <label class="field">
          <span>Baud</span>
          <select data-action="change-baud">
            ${[9600, 19200, 38400, 57600, 115200].map((rate) => `
              <option value="${rate}" ${Number(bench.baudRate) === rate ? 'selected' : ''}>${rate}</option>
            `).join('')}
          </select>
        </label>
        <label class="field">
          <span>Regex valor</span>
          <input data-action="change-parser" value="${escapeHtml(bench.parserPattern)}" />
        </label>
      </div>
      <div class="device-info">
        <span>${escapeHtml(device.preferredTransport)}</span>
        <strong>${escapeHtml(device.physicalPort)}</strong>
        <small>${escapeHtml(device.notes)}</small>
      </div>
      <div class="serial-monitor">
        <span>Ultima linha</span>
        <strong>${escapeHtml(serialSession.lastLine || '---')}</strong>
      </div>
      <div class="button-row">
        <button class="primary-button" data-action="connect-serial" type="button" ${serialSession.connected ? 'disabled' : ''}>Conectar</button>
        <button class="soft-button" data-action="disconnect-serial" type="button" ${serialSession.connected ? '' : 'disabled'}>Desconectar</button>
      </div>
      <div class="manual-entry">
        <input data-field="manual-value" inputmode="decimal" placeholder="Valor manual" />
        <button class="soft-button" data-action="manual-reading" type="button">Receber</button>
      </div>
    </section>
  `;
}

function renderReadingPanel(bench, analysis, reasons) {
  const draft = bench.draftReading;
  const raw = draft?.rawValue ?? null;
  const finalValue = raw !== null ? correctedValue(raw, bench.dilutionFactor) : null;
  const overRange = raw !== null && isOverRange(raw, bench);
  const canSave = reasons.length === 0;

  return `
    <section class="panel reading-panel ${overRange && bench.dilutionFactor === 1 ? 'danger' : ''}">
      <div class="panel-heading compact">
        <h2>Leitura: Amostra ${bench.currentPosition}</h2>
        ${overRange ? '<span class="danger-chip">Estouro</span>' : ''}
      </div>
      <div class="display">
        <span>Valor recebido (${analysis.unit})</span>
        <strong>${raw === null ? '---.---' : raw.toFixed(3)}</strong>
      </div>
      <label class="field two-cols dilution-field">
        <span>Fator de diluicao</span>
        <input data-action="change-dilution" type="number" min="1" step="1" value="${bench.dilutionFactor}" />
      </label>
      <div class="final-value">
        <span>Valor final</span>
        <strong>${finalValue === null ? '---' : finalValue.toFixed(3)}</strong>
      </div>
      ${reasons.length ? `<div class="blockers">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>` : ''}
      <div class="button-row">
        <button class="dark-button" data-action="simulate-reading" type="button">Simular aparelho</button>
        <button class="primary-button" data-action="save-reading" type="button" ${canSave ? '' : 'disabled'}>Salvar leitura</button>
      </div>
    </section>
  `;
}

function renderBenchManager() {
  const draft = state.addBenchDraft;
  const template = RACK_TEMPLATES[draft.templateCode] ?? RACK_TEMPLATES.TRAY_30_3X10;
  const bench = selectedBench();

  return `
    <section class="panel">
      <div class="panel-heading compact">
        <h2>Bancadas e bandejas</h2>
      </div>
      <div class="field-grid">
        <label class="field">
          <span>Fileiras atuais</span>
          <input data-field="rows" type="number" min="1" max="12" value="${bench.rows}" />
        </label>
        <label class="field">
          <span>Posicoes por fileira</span>
          <input data-field="columns" type="number" min="1" max="20" value="${bench.columns}" />
        </label>
      </div>
      <button class="soft-button full" data-action="apply-layout" type="button">Aplicar layout na bancada atual</button>
      <hr />
      <label class="field">
        <span>Nova bancada</span>
        <input data-action="draft-bench-name" value="${escapeHtml(draft.name)}" />
      </label>
      <label class="field">
        <span>Modelo</span>
        <select data-action="draft-template">
          ${Object.values(RACK_TEMPLATES).map((item) => `
            <option value="${item.code}" ${item.code === draft.templateCode ? 'selected' : ''}>
              ${item.label} | ${item.rows} x ${item.columns}
            </option>
          `).join('')}
        </select>
      </label>
      <div class="field-grid">
        <label class="field">
          <span>Fileiras</span>
          <input data-action="draft-rows" type="number" min="1" max="12" value="${draft.rows || template.rows}" />
        </label>
        <label class="field">
          <span>Por fileira</span>
          <input data-action="draft-columns" type="number" min="1" max="20" value="${draft.columns || template.columns}" />
        </label>
      </div>
      <button class="primary-button full" data-action="add-bench" type="button">Adicionar bancada</button>
    </section>
  `;
}

function renderAlertsPanel() {
  return `
    <section class="panel">
      <div class="panel-heading compact">
        <h2>Alertas e auditoria rapida</h2>
      </div>
      <div class="alerts">
        ${state.alerts.length === 0
          ? '<p class="empty">Nenhum alerta recente.</p>'
          : state.alerts.map((alert) => `
            <article class="alert ${alert.level}">
              <strong>${alert.level.toUpperCase()}</strong>
              <span>${escapeHtml(alert.message)}</span>
            </article>
          `).join('')}
      </div>
    </section>
  `;
}

function renderAuditPanel() {
  return `
    <section class="panel audit-panel">
      <div class="panel-heading compact">
        <h2>Trilha imutavel</h2>
        <span>${state.auditTrail.length} eventos</span>
      </div>
      <div class="audit-list">
        ${state.auditTrail.slice(0, 7).map((event) => `
          <article>
            <strong>${escapeHtml(event.type)}</strong>
            <span>${new Date(event.occurredAt).toLocaleString('pt-BR')}</span>
          </article>
        `).join('') || '<p class="empty">Sem eventos registrados.</p>'}
      </div>
    </section>
  `;
}

function wireEvents() {
  app.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', handleClick);
    element.addEventListener('change', handleChange);
    element.addEventListener('input', handleInput);
  });
}

function handleClick(event) {
  const target = event.currentTarget;
  const action = target.dataset.action;

  if (action === 'toggle-sidebar') {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    persist();
    render();
  }

  if (action === 'select-bench') {
    state.selectedBenchId = target.dataset.id;
    persist();
    render();
  }

  if (action === 'open-add-bench') {
    const field = app.querySelector('[data-action="draft-bench-name"]');
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field?.focus();
  }

  if (action === 'jump-tube') jumpToTube(Number(target.dataset.position));
  if (action === 'simulate-reading') simulateReading();
  if (action === 'save-reading') saveReading();
  if (action === 'complete-qc') completeQualityControl();
  if (action === 'connect-serial') connectSerial();
  if (action === 'disconnect-serial') disconnectSerial();
  if (action === 'sync-pending') syncPending();
  if (action === 'add-bench') addBench();
  if (action === 'apply-layout') applyLayoutToCurrentBench();

  if (action === 'manual-reading') {
    const input = app.querySelector('[data-field="manual-value"]');
    const value = Number.parseFloat(String(input.value).replace(',', '.'));
    ingestReading(value, 'manual');
    input.value = '';
  }
}

function handleChange(event) {
  const target = event.currentTarget;
  const action = target.dataset.action;
  const bench = selectedBench();

  if (action === 'change-analysis') {
    updateBench(bench.id, (draft) => ({ ...draft, analysisCode: target.value }));
    addAlert('info', ANALYSES[target.value].hint);
    render();
  }

  if (action === 'change-device') {
    const profile = DEVICE_PROFILES[target.value] ?? DEVICE_PROFILES.KASVI_K37_UVVIS0;
    updateBench(bench.id, (draft) => ({
      ...draft,
      instrumentCode: target.value,
      baudRate: profile.defaultBaudRate,
      parserPattern: profile.defaultParserPattern,
    }));
    render();
  }

  if (action === 'change-baud') {
    updateBench(bench.id, (draft) => ({ ...draft, baudRate: Number(target.value) }));
    render();
  }

  if (action === 'draft-template') {
    const template = RACK_TEMPLATES[target.value];
    state.addBenchDraft.templateCode = target.value;
    state.addBenchDraft.rows = template.rows;
    state.addBenchDraft.columns = template.columns;
    persist();
    render();
  }
}

function handleInput(event) {
  const target = event.currentTarget;
  const action = target.dataset.action;
  const bench = selectedBench();

  if (action === 'change-r2') {
    updateBench(bench.id, (draft) => ({ ...draft, calibrationR2: Number(target.value) || 0 }));
    if (Number(target.value) < MIN_CALIBRATION_R2) {
      addAlert('error', 'Calibracao reprovada pelo Gatekeeper BPL.');
    }
    render();
  }

  if (action === 'change-dilution') {
    updateBench(bench.id, (draft) => ({
      ...draft,
      dilutionFactor: Math.max(1, Math.trunc(Number(target.value) || 1)),
    }));
    render();
  }

  if (action === 'change-parser') {
    updateBench(bench.id, (draft) => ({ ...draft, parserPattern: target.value }));
  }

  if (action === 'draft-bench-name') {
    state.addBenchDraft.name = target.value;
    persist();
  }

  if (action === 'draft-rows') {
    state.addBenchDraft.rows = Number(target.value);
    persist();
  }

  if (action === 'draft-columns') {
    state.addBenchDraft.columns = Number(target.value);
    persist();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.addEventListener('online', () => {
  addAlert('success', 'Conexao restabelecida.');
  render();
});
window.addEventListener('offline', () => {
  addAlert('warning', 'Modo offline ativo. Registros seguem na fila local.');
  render();
});

render();
