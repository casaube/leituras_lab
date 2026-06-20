import Dexie, { Table } from 'dexie';
import { IReadingsRepository, PersistResult, SyncSummary } from '../../application/ports/IReadingsRepository';
import { AuditEvent, ReadingRecord } from '../../domain/types';

type QueueKind = 'reading' | 'audit';

interface QueueItem {
  id: string;
  kind: QueueKind;
  payload: ReadingRecord | AuditEvent;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

class AnalyticalReadingsDb extends Dexie {
  queue!: Table<QueueItem, string>;

  constructor() {
    super('solo_companhia_analytical_readings');
    this.version(1).stores({
      queue: 'id, kind, createdAt, attempts',
    });
  }
}

// Repositorio offline-first. Ele tenta enviar ao Google; se falhar, coloca na
// fila local IndexedDB. O restante do sistema continua dependendo da mesma porta.
export class OfflineFirstReadingsRepository implements IReadingsRepository {
  constructor(
    private readonly remote: IReadingsRepository,
    private readonly db = new AnalyticalReadingsDb(),
    private readonly isOnline = () => typeof navigator === 'undefined' || navigator.onLine,
  ) {}

  appendReading(reading: ReadingRecord): Promise<PersistResult> {
    return this.persistOrQueue('reading', reading);
  }

  appendAuditEvent(event: AuditEvent): Promise<PersistResult> {
    return this.persistOrQueue('audit', event);
  }

  async syncPending(): Promise<SyncSummary> {
    if (!this.isOnline()) {
      return {
        sent: 0,
        failed: 0,
        pending: await this.db.queue.count(),
        lastSyncAt: null,
      };
    }

    const items = await this.db.queue.orderBy('createdAt').toArray();
    let sent = 0;
    let failed = 0;

    for (const item of items) {
      try {
        if (item.kind === 'reading') {
          await this.remote.appendReading(item.payload as ReadingRecord);
        } else {
          await this.remote.appendAuditEvent(item.payload as AuditEvent);
        }

        await this.db.queue.delete(item.id);
        sent += 1;
      } catch (error) {
        failed += 1;
        await this.db.queue.update(item.id, {
          attempts: item.attempts + 1,
          lastError: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    return {
      sent,
      failed,
      pending: await this.db.queue.count(),
      lastSyncAt: new Date().toISOString(),
    };
  }

  private async persistOrQueue(kind: QueueKind, payload: ReadingRecord | AuditEvent): Promise<PersistResult> {
    if (!this.isOnline()) {
      await this.enqueue(kind, payload);
      return { persistedOnline: false, queuedOffline: true };
    }

    try {
      return kind === 'reading'
        ? await this.remote.appendReading(payload as ReadingRecord)
        : await this.remote.appendAuditEvent(payload as AuditEvent);
    } catch {
      await this.enqueue(kind, payload);
      return { persistedOnline: false, queuedOffline: true };
    }
  }

  private async enqueue(kind: QueueKind, payload: ReadingRecord | AuditEvent): Promise<void> {
    await this.db.queue.put({
      id: `${kind}:${payload.id}`,
      kind,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
  }
}

