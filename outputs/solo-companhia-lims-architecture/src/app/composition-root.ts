import { AnalyticalReadingsService } from '../modules/analytical-readings/application/services/AnalyticalReadingsService';
import { GoogleSheetsReadingsRepository } from '../modules/analytical-readings/infrastructure/repositories/GoogleSheetsReadingsRepository';
import { OfflineFirstReadingsRepository } from '../modules/analytical-readings/infrastructure/repositories/OfflineFirstReadingsRepository';
import { createAnalyticalReadingsStore } from '../modules/analytical-readings/presentation/store/createAnalyticalReadingsStore';

const ids = {
  newId: () => crypto.randomUUID(),
};

const clock = {
  now: () => new Date().toISOString(),
};

const googleSheetsRepository = new GoogleSheetsReadingsRepository({
  endpointUrl: import.meta.env.VITE_GOOGLE_SHEETS_ENDPOINT,
  getAccessToken: async () => {
    // Em producao, obter token via OAuth/Identity Platform ou backend proprio.
    return import.meta.env.VITE_GOOGLE_ACCESS_TOKEN;
  },
});

const offlineFirstRepository = new OfflineFirstReadingsRepository(googleSheetsRepository);

const analyticalReadingsService = new AnalyticalReadingsService(
  offlineFirstRepository,
  ids,
  clock,
);

export const useAnalyticalReadingsStore = createAnalyticalReadingsStore({
  service: analyticalReadingsService,
  newId: ids.newId,
  now: clock.now,
  notifySequenceJump: () => {
    // A UI pode substituir por Web Audio API, toast sonoro ou vibracao em tablet.
    new Audio('/alerts/sequence-jump.mp3').play().catch(() => undefined);
  },
});

