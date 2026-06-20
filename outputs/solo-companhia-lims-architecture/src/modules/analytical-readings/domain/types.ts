export const TOTAL_RACK_TUBES = 50 as const;
export const MIN_CALIBRATION_R2 = 0.995;
export const QC_INTERVAL = 20;

export type AnalysisCode = 'PHOSPHORUS' | 'SULFUR' | 'BORON' | 'POTASSIUM';

export type InstrumentModel =
  | 'KASVI_K37_UVVIS0'
  | 'GBC_SAVANT_AA'
  | 'FEMTO_600_PLUS'
  | 'METASH_V5000_VISIBLE'
  | 'ANALYSER_FLAME_910M';

export type TubeStatus = 'pending' | 'reading' | 'completed' | 'overRange' | 'diluted';
export type AlertLevel = 'info' | 'warning' | 'error' | 'success';
export type ReadingKind = 'sample' | 'blank' | 'control';

export interface AnalyticalMethod {
  code: AnalysisCode;
  label: string;
  technique: string;
  maxCurveValue: number;
  methodologicalHint: string;
}

export const ANALYTICAL_METHODS: Record<AnalysisCode, AnalyticalMethod> = {
  PHOSPHORUS: {
    code: 'PHOSPHORUS',
    label: 'Fosforo',
    technique: 'Colorimetria',
    maxCurveValue: 2,
    methodologicalHint: 'Aguardar o tempo de desenvolvimento de cor antes da leitura.',
  },
  SULFUR: {
    code: 'SULFUR',
    label: 'Enxofre',
    technique: 'Turbidimetria',
    maxCurveValue: 2,
    methodologicalHint: 'Verificar particulas em suspensao antes de aspirar.',
  },
  BORON: {
    code: 'BORON',
    label: 'Boro',
    technique: 'Colorimetria/ICP',
    maxCurveValue: 1.5,
    methodologicalHint: 'Confirmar extrator e condicoes do metodo antes da leitura.',
  },
  POTASSIUM: {
    code: 'POTASSIUM',
    label: 'Potassio',
    technique: 'Fotometria de chama',
    maxCurveValue: 100,
    methodologicalHint: 'Conferir estabilidade da chama e padroes antes da sequencia.',
  },
};

export interface RackTube {
  tubeId: number;
  status: TubeStatus;
  value: number | null;
  rawValue: number | null;
  dilutionFactor: number;
}

export interface BatchContext {
  batchId: string;
  analystName: string;
  analysisCode: AnalysisCode;
  calibrationR2: number;
  readingsSinceLastQc: number;
  isQcRequired: boolean;
  createdAt: string;
}

export interface ReadingDraft {
  tubeId: number;
  rawValue: number;
  dilutionFactor: number;
  receivedAt: string;
  instrumentModel: InstrumentModel;
}

export interface ReadingRecord {
  id: string;
  batchId: string;
  tubeId: number;
  analysisCode: AnalysisCode;
  instrumentModel: InstrumentModel;
  kind: ReadingKind;
  rawValue: number;
  dilutionFactor: number;
  correctedValue: number;
  status: Extract<TubeStatus, 'completed' | 'diluted'>;
  calibrationR2: number;
  analystName: string;
  recordedAt: string;
}

export type AuditEventType =
  | 'READING_CREATED'
  | 'READING_REJECTED'
  | 'READING_INVALIDATED'
  | 'SEQUENCE_JUMP_CONFIRMED'
  | 'QUALITY_CONTROL_PERFORMED';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  aggregateId: string;
  actor: string;
  occurredAt: string;
  reason?: string;
  payload: Record<string, unknown>;
}
