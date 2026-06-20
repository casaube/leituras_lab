import { IReadingsRepository, PersistResult, SyncSummary } from '../../application/ports/IReadingsRepository';
import { AuditEvent, ReadingRecord } from '../../domain/types';

export interface GoogleSheetsRepositoryConfig {
  endpointUrl: string;
  getAccessToken: () => Promise<string>;
}

// Adaptador de infraestrutura. Pode usar Google Sheets API diretamente ou um
// Google Apps Script publicado como endpoint seguro no Workspace do laboratorio.
export class GoogleSheetsReadingsRepository implements IReadingsRepository {
  constructor(private readonly config: GoogleSheetsRepositoryConfig) {}

  appendReading(reading: ReadingRecord): Promise<PersistResult> {
    return this.post('/readings', reading);
  }

  appendAuditEvent(event: AuditEvent): Promise<PersistResult> {
    return this.post('/audit-events', event);
  }

  async syncPending(): Promise<SyncSummary> {
    return {
      sent: 0,
      failed: 0,
      pending: 0,
      lastSyncAt: new Date().toISOString(),
    };
  }

  private async post(path: string, body: unknown): Promise<PersistResult> {
    const token = await this.config.getAccessToken();
    const response = await fetch(`${this.config.endpointUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Falha ao persistir no Google Sheets: ${response.status}`);
    }

    const data = (await response.json()) as { id?: string };

    return {
      persistedOnline: true,
      queuedOffline: false,
      externalId: data.id,
    };
  }
}

