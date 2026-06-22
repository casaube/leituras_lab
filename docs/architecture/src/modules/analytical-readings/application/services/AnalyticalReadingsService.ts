import { IReadingsRepository, SyncSummary } from '../ports/IReadingsRepository';
import {
  AuditEvent,
  BatchContext,
  ReadingDraft,
  ReadingKind,
  ReadingRecord,
} from '../../domain/types';
import {
  calculateCorrectedValue,
  isOverCurveLimit,
  validateReadingBeforeSave,
} from '../../domain/readingRules';

export interface IdGenerator {
  newId(): string;
}

export interface Clock {
  now(): string;
}

export interface PersistReadingCommand {
  batch: BatchContext;
  draft: ReadingDraft;
  kind: ReadingKind;
  actor: string;
}

export type PersistReadingResult =
  | { ok: true; reading: ReadingRecord; queuedOffline: boolean }
  | { ok: false; reasons: string[] };

export class AnalyticalReadingsService {
  constructor(
    private readonly repository: IReadingsRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async persistReading(command: PersistReadingCommand): Promise<PersistReadingResult> {
    const validation = validateReadingBeforeSave({
      batch: command.batch,
      rawValue: command.draft.rawValue,
      dilutionFactor: command.draft.dilutionFactor,
      kind: command.kind,
    });

    if (!validation.ok) {
      await this.recordAudit({
        type: 'READING_REJECTED',
        aggregateId: command.batch.batchId,
        actor: command.actor,
        payload: { reasons: validation.reasons, draft: command.draft },
      });

      return { ok: false, reasons: validation.reasons };
    }

    const correctedValue = calculateCorrectedValue(command.draft.rawValue, command.draft.dilutionFactor);
    const status = isOverCurveLimit(command.draft.rawValue, command.batch.analysisCode) ? 'diluted' : 'completed';

    const reading: ReadingRecord = {
      id: this.ids.newId(),
      batchId: command.batch.batchId,
      tubeId: command.draft.tubeId,
      analysisCode: command.batch.analysisCode,
      instrumentModel: command.draft.instrumentModel,
      kind: command.kind,
      rawValue: command.draft.rawValue,
      dilutionFactor: command.draft.dilutionFactor,
      correctedValue,
      status,
      calibrationR2: command.batch.calibrationR2,
      analystName: command.batch.analystName,
      recordedAt: this.clock.now(),
    };

    const readingPersist = await this.repository.appendReading(reading);

    await this.recordAudit({
      type: 'READING_CREATED',
      aggregateId: reading.id,
      actor: command.actor,
      payload: { reading, persistedOnline: readingPersist.persistedOnline },
    });

    return {
      ok: true,
      reading,
      queuedOffline: readingPersist.queuedOffline,
    };
  }

  async recordAudit(input: Omit<AuditEvent, 'id' | 'occurredAt'>): Promise<void> {
    const event: AuditEvent = {
      ...input,
      id: this.ids.newId(),
      occurredAt: this.clock.now(),
    };

    await this.repository.appendAuditEvent(event);
  }

  syncPending(): Promise<SyncSummary> {
    return this.repository.syncPending();
  }
}
