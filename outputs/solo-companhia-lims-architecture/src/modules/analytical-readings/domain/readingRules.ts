import {
  ANALYTICAL_METHODS,
  AnalysisCode,
  BatchContext,
  MIN_CALIBRATION_R2,
  QC_INTERVAL,
  RackTube,
  ReadingKind,
  TOTAL_RACK_TUBES,
} from './types';

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

export function createInitialRack(totalTubes = TOTAL_RACK_TUBES): RackTube[] {
  return Array.from({ length: totalTubes }, (_, index) => ({
    tubeId: index + 1,
    status: index === 0 ? 'reading' : 'pending',
    value: null,
    rawValue: null,
    dilutionFactor: 1,
  }));
}

export function isCalibrationApproved(rSquared: number): boolean {
  return rSquared >= MIN_CALIBRATION_R2;
}

export function isOverCurveLimit(rawValue: number, analysisCode: AnalysisCode): boolean {
  return rawValue > ANALYTICAL_METHODS[analysisCode].maxCurveValue;
}

export function calculateCorrectedValue(rawValue: number, dilutionFactor: number): number {
  return Number((rawValue * dilutionFactor).toFixed(3));
}

export function normalizeDilutionFactor(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

export function mustPauseForQualityControl(batch: BatchContext): boolean {
  return batch.isQcRequired || batch.readingsSinceLastQc >= QC_INTERVAL;
}

export function getMethodologicalHint(analysisCode: AnalysisCode): string {
  return ANALYTICAL_METHODS[analysisCode].methodologicalHint;
}

export function validateReadingBeforeSave(input: {
  batch: BatchContext;
  rawValue: number | null;
  dilutionFactor: number;
  kind: ReadingKind;
}): ValidationResult {
  const reasons: string[] = [];

  if (!isCalibrationApproved(input.batch.calibrationR2)) {
    reasons.push('Bloqueio BPL: R2 da calibracao abaixo de 0,995.');
  }

  if (input.rawValue === null || !Number.isFinite(input.rawValue)) {
    reasons.push('Nenhuma leitura valida foi recebida do aparelho.');
  }

  if (input.kind === 'sample' && input.batch.isQcRequired) {
    reasons.push('CQ obrigatorio pendente: registrar Branco e Amostra Controle antes de continuar.');
  }

  if (input.rawValue !== null && isOverCurveLimit(input.rawValue, input.batch.analysisCode) && input.dilutionFactor === 1) {
    reasons.push('Leitura acima da curva: informe o fator de diluicao para liberar o salvamento.');
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function getNextQcStateAfterSample(batch: BatchContext): Pick<BatchContext, 'readingsSinceLastQc' | 'isQcRequired'> {
  const nextCounter = batch.readingsSinceLastQc + 1;

  return {
    readingsSinceLastQc: nextCounter >= QC_INTERVAL ? QC_INTERVAL : nextCounter,
    isQcRequired: nextCounter >= QC_INTERVAL,
  };
}

export function detectSequenceJump(expectedTubeId: number, requestedTubeId: number): boolean {
  return requestedTubeId !== expectedTubeId;
}

