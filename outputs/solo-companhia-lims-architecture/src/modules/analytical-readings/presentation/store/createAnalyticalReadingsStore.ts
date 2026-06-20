import { create, StoreApi, UseBoundStore } from 'zustand';
import { AnalyticalReadingsService } from '../../application/services/AnalyticalReadingsService';
import {
  ANALYTICAL_METHODS,
  AlertLevel,
  AnalysisCode,
  BatchContext,
  InstrumentModel,
  RackTube,
  ReadingDraft,
} from '../../domain/types';
import {
  createInitialRack,
  detectSequenceJump,
  getMethodologicalHint,
  getNextQcStateAfterSample,
  isOverCurveLimit,
  normalizeDilutionFactor,
  validateReadingBeforeSave,
} from '../../domain/readingRules';

export interface BenchAlert {
  id: string;
  level: AlertLevel;
  message: string;
  createdAt: string;
}

interface SyncViewState {
  isSyncing: boolean;
  pending: number;
  lastSyncAt: string | null;
}

export interface AnalyticalReadingsStore {
  batch: BatchContext;
  rack: RackTube[];
  currentTubeId: number;
  currentReading: ReadingDraft | null;
  dilutionFactor: number;
  alerts: BenchAlert[];
  sync: SyncViewState;

  selectAnalysis(analysisCode: AnalysisCode): void;
  setCalibrationR2(rSquared: number): void;
  receiveInstrumentReading(rawValue: number, instrumentModel: InstrumentModel): void;
  setDilutionFactor(value: number): void;
  getSaveBlockReasons(): string[];
  saveCurrentReading(actor: string): Promise<void>;
  jumpToTube(tubeId: number, actor: string): Promise<void>;
  completeQualityControl(actor: string): Promise<void>;
  invalidateReading(tubeId: number, reason: string, actor: string): Promise<void>;
  syncPending(): Promise<void>;
  addAlert(level: AlertLevel, message: string): void;
}

interface StoreDependencies {
  service: AnalyticalReadingsService;
  newId: () => string;
  now: () => string;
  notifySequenceJump?: () => void;
}

const initialBatch = (now: string): BatchContext => ({
  batchId: 'L-2026-06',
  analystName: 'Joao Silva',
  analysisCode: 'PHOSPHORUS',
  calibrationR2: 0.998,
  readingsSinceLastQc: 0,
  isQcRequired: false,
  createdAt: now,
});

export function createAnalyticalReadingsStore(
  deps: StoreDependencies,
): UseBoundStore<StoreApi<AnalyticalReadingsStore>> {
  return create<AnalyticalReadingsStore>()((set, get) => ({
    batch: initialBatch(deps.now()),
    rack: createInitialRack(),
    currentTubeId: 1,
    currentReading: null,
    dilutionFactor: 1,
    alerts: [],
    sync: {
      isSyncing: false,
      pending: 0,
      lastSyncAt: null,
    },

    addAlert(level, message) {
      set((state) => ({
        alerts: [
          { id: deps.newId(), level, message, createdAt: deps.now() },
          ...state.alerts,
        ].slice(0, 8),
      }));
    },

    selectAnalysis(analysisCode) {
      set((state) => ({
        batch: { ...state.batch, analysisCode },
        currentReading: null,
        dilutionFactor: 1,
      }));

      get().addAlert(
        'info',
        `${ANALYTICAL_METHODS[analysisCode].label}: ${getMethodologicalHint(analysisCode)}`,
      );
    },

    setCalibrationR2(rSquared) {
      set((state) => ({
        batch: { ...state.batch, calibrationR2: rSquared },
      }));

      if (rSquared < 0.995) {
        get().addAlert('error', 'Bloqueio BPL: calibracao reprovada. Recalibre antes de continuar.');
      }
    },

    receiveInstrumentReading(rawValue, instrumentModel) {
      const state = get();

      if (state.batch.isQcRequired) {
        state.addAlert('warning', 'CQ obrigatorio pendente. Registre Branco e Amostra Controle antes da proxima amostra.');
        return;
      }

      const draft: ReadingDraft = {
        tubeId: state.currentTubeId,
        rawValue,
        dilutionFactor: state.dilutionFactor,
        receivedAt: deps.now(),
        instrumentModel,
      };

      const overRange = isOverCurveLimit(rawValue, state.batch.analysisCode);

      set((current) => ({
        currentReading: draft,
        rack: current.rack.map((tube) =>
          tube.tubeId === current.currentTubeId
            ? {
                ...tube,
                status: overRange ? 'overRange' : 'reading',
                rawValue,
                dilutionFactor: current.dilutionFactor,
              }
            : tube,
        ),
      }));

      if (overRange) {
        state.addAlert('error', 'Estouro de escala: informe o fator de diluicao para salvar.');
      }
    },

    setDilutionFactor(value) {
      const dilutionFactor = normalizeDilutionFactor(value);

      set((state) => ({
        dilutionFactor,
        currentReading: state.currentReading
          ? { ...state.currentReading, dilutionFactor }
          : null,
      }));
    },

    getSaveBlockReasons() {
      const state = get();

      return validateReadingBeforeSave({
        batch: state.batch,
        rawValue: state.currentReading?.rawValue ?? null,
        dilutionFactor: state.dilutionFactor,
        kind: 'sample',
      }).reasons;
    },

    async saveCurrentReading(actor) {
      const state = get();

      if (!state.currentReading) {
        state.addAlert('warning', 'Nenhuma leitura recebida para salvar.');
        return;
      }

      const result = await deps.service.persistReading({
        batch: state.batch,
        draft: { ...state.currentReading, dilutionFactor: state.dilutionFactor },
        kind: 'sample',
        actor,
      });

      if (!result.ok) {
        result.reasons.forEach((reason) => state.addAlert('error', reason));
        return;
      }

      const nextQc = getNextQcStateAfterSample(state.batch);
      const nextTubeId = Math.min(state.currentTubeId + 1, state.rack.length);

      set((current) => ({
        batch: { ...current.batch, ...nextQc },
        rack: current.rack.map((tube) => {
          if (tube.tubeId === result.reading.tubeId) {
            return {
              ...tube,
              status: result.reading.status,
              value: result.reading.correctedValue,
              rawValue: result.reading.rawValue,
              dilutionFactor: result.reading.dilutionFactor,
            };
          }

          if (tube.tubeId === nextTubeId && tube.status === 'pending') {
            return { ...tube, status: 'reading' };
          }

          return tube;
        }),
        currentTubeId: nextTubeId,
        currentReading: null,
        dilutionFactor: 1,
      }));

      get().addAlert(
        result.queuedOffline ? 'warning' : 'success',
        result.queuedOffline ? 'Leitura salva no cache local para sincronizacao.' : 'Leitura salva com sucesso.',
      );

      if (nextQc.isQcRequired) {
        get().addAlert('warning', 'Pausa BPL: hora do CQ. Registrar Branco e Amostra Controle.');
      }
    },

    async jumpToTube(tubeId, actor) {
      const state = get();

      if (!detectSequenceJump(state.currentTubeId, tubeId)) return;

      deps.notifySequenceJump?.();

      await deps.service.recordAudit({
        type: 'SEQUENCE_JUMP_CONFIRMED',
        aggregateId: state.batch.batchId,
        actor,
        reason: 'Salto manual confirmado pelo tecnico.',
        payload: { fromTubeId: state.currentTubeId, toTubeId: tubeId },
      });

      set((current) => ({
        currentTubeId: tubeId,
        currentReading: null,
        dilutionFactor: 1,
        rack: current.rack.map((tube) => {
          if (tube.tubeId === current.currentTubeId && tube.status === 'reading') {
            return { ...tube, status: 'pending' };
          }

          if (tube.tubeId === tubeId && tube.status === 'pending') {
            return { ...tube, status: 'reading' };
          }

          return tube;
        }),
      }));

      get().addAlert('warning', `Salto de sequencia confirmado: amostra ${state.currentTubeId} para ${tubeId}.`);
    },

    async completeQualityControl(actor) {
      const state = get();

      await deps.service.recordAudit({
        type: 'QUALITY_CONTROL_PERFORMED',
        aggregateId: state.batch.batchId,
        actor,
        payload: { batchId: state.batch.batchId, analysisCode: state.batch.analysisCode },
      });

      set((current) => ({
        batch: {
          ...current.batch,
          readingsSinceLastQc: 0,
          isQcRequired: false,
        },
      }));

      get().addAlert('success', 'CQ registrado. Sequencia de bancada liberada.');
    },

    async invalidateReading(tubeId, reason, actor) {
      const state = get();

      await deps.service.recordAudit({
        type: 'READING_INVALIDATED',
        aggregateId: `${state.batch.batchId}:${tubeId}`,
        actor,
        reason,
        payload: { tubeId, previousTube: state.rack.find((tube) => tube.tubeId === tubeId) },
      });

      set((current) => ({
        rack: current.rack.map((tube) =>
          tube.tubeId === tubeId
            ? { ...tube, status: 'pending', value: null, rawValue: null, dilutionFactor: 1 }
            : tube,
        ),
      }));

      get().addAlert('warning', `Leitura da amostra ${tubeId} invalidada e auditada.`);
    },

    async syncPending() {
      set((state) => ({ sync: { ...state.sync, isSyncing: true } }));

      try {
        const summary = await deps.service.syncPending();
        set({
          sync: {
            isSyncing: false,
            pending: summary.pending,
            lastSyncAt: summary.lastSyncAt,
          },
        });

        get().addAlert('success', `Sincronizacao concluida: ${summary.sent} itens enviados.`);
      } catch (error) {
        set((state) => ({ sync: { ...state.sync, isSyncing: false } }));
        get().addAlert('error', error instanceof Error ? error.message : 'Falha ao sincronizar.');
      }
    },
  }));
}

