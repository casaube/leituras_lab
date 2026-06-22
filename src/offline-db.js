import Dexie from './vendor/dexie.min.mjs';

const MIGRATION_KEY = 'soloCompanhia.lims.indexedDbMigrated.v1';

export const offlineDb = new Dexie('solo_companhia_lims_offline');

offlineDb.version(1).stores({
  syncQueue: 'id, status, type, createdAt, syncedAt, attempts',
  auditEvents: 'id, type, actor, occurredAt',
});

export async function enqueueSyncItem(item) {
  const queuedItem = {
    attempts: 0,
    lastError: null,
    ...item,
    status: item.status ?? 'pending',
    createdAt: item.createdAt ?? new Date().toISOString(),
  };

  await offlineDb.syncQueue.put(queuedItem);
  return queuedItem;
}

export async function listSyncQueue(limit = 250) {
  return offlineDb.syncQueue
    .orderBy('createdAt')
    .reverse()
    .limit(limit)
    .toArray();
}

export async function getPendingSyncItems() {
  return offlineDb.syncQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt');
}

export async function markSyncItemsSynced(ids, syncedAt = new Date().toISOString()) {
  await offlineDb.transaction('rw', offlineDb.syncQueue, async () => {
    await Promise.all(ids.map((id) =>
      offlineDb.syncQueue.update(id, {
        status: 'synced',
        syncedAt,
        lastError: null,
      }),
    ));
  });
}

export async function markSyncItemsFailed(ids, errorMessage) {
  await offlineDb.transaction('rw', offlineDb.syncQueue, async () => {
    await Promise.all(ids.map(async (id) => {
      const item = await offlineDb.syncQueue.get(id);
      await offlineDb.syncQueue.update(id, {
        status: 'pending',
        attempts: (item?.attempts ?? 0) + 1,
        lastError: errorMessage,
      });
    }));
  });
}

export async function countPendingSyncItems() {
  return offlineDb.syncQueue
    .where('status')
    .equals('pending')
    .count();
}

export async function recordAuditEvent(event) {
  await offlineDb.auditEvents.put(event);
  return event;
}

export async function getRecentAuditEvents(limit = 100) {
  return offlineDb.auditEvents
    .orderBy('occurredAt')
    .reverse()
    .limit(limit)
    .toArray();
}

export async function migrateLegacyOfflineRecords(legacyState) {
  if (localStorage.getItem(MIGRATION_KEY) === 'done') return;

  const legacyQueue = Array.isArray(legacyState?.syncQueue) ? legacyState.syncQueue : [];
  const legacyAuditTrail = Array.isArray(legacyState?.auditTrail) ? legacyState.auditTrail : [];

  await offlineDb.transaction('rw', offlineDb.syncQueue, offlineDb.auditEvents, async () => {
    if (legacyQueue.length > 0) {
      await offlineDb.syncQueue.bulkPut(legacyQueue.map((item) => ({
        attempts: 0,
        lastError: null,
        ...item,
        status: item.status ?? 'pending',
        createdAt: item.createdAt ?? new Date().toISOString(),
      })));
    }

    if (legacyAuditTrail.length > 0) {
      await offlineDb.auditEvents.bulkPut(legacyAuditTrail.map((event) => ({
        ...event,
        occurredAt: event.occurredAt ?? new Date().toISOString(),
      })));
    }
  });

  localStorage.setItem(MIGRATION_KEY, 'done');
}
