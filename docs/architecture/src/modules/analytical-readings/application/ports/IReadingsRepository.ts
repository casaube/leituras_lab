import { AuditEvent, ReadingRecord } from '../../domain/types';

export interface PersistResult {
  persistedOnline: boolean;
  queuedOffline: boolean;
  externalId?: string;
}

export interface SyncSummary {
  sent: number;
  failed: number;
  pending: number;
  lastSyncAt: string | null;
}

// Porta de persistencia do modulo. A regra de negocio nao sabe se isto e Google,
// PostgreSQL, SQL Server, arquivo local ou outro barramento.
export interface IReadingsRepository {
  appendReading(reading: ReadingRecord): Promise<PersistResult>;
  appendAuditEvent(event: AuditEvent): Promise<PersistResult>;
  syncPending(): Promise<SyncSummary>;
}

