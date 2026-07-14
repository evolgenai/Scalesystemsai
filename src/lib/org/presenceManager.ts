export const PRESENCE_TTL_MS = 15_000;

export type PresenceEntry = {
  userId: string;
  name: string;
  lastActive: Date;
  currentActivity: string;
};

type PresenceBucket = Map<string, PresenceEntry>;

const globalPresence = globalThis as unknown as {
  __scaleOrgPresence?: Map<string, PresenceBucket>;
};

function store(): Map<string, PresenceBucket> {
  if (!globalPresence.__scaleOrgPresence) {
    globalPresence.__scaleOrgPresence = new Map();
  }
  return globalPresence.__scaleOrgPresence;
}

function bucketFor(orgId: string): PresenceBucket {
  const key = orgId.trim();
  const map = store();
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Map();
    map.set(key, bucket);
  }
  return bucket;
}

/** Drop entries that missed the 15s heartbeat window. */
export function pruneStalePresence(
  orgId: string,
  now = Date.now()
): number {
  const bucket = store().get(orgId.trim());
  if (!bucket) return 0;

  let removed = 0;
  for (const [userId, entry] of bucket) {
    if (now - entry.lastActive.getTime() > PRESENCE_TTL_MS) {
      bucket.delete(userId);
      removed += 1;
    }
  }

  if (bucket.size === 0) {
    store().delete(orgId.trim());
  }

  return removed;
}

export function upsertPresence(input: {
  orgId: string;
  userId: string;
  name: string;
  currentActivity?: string;
}): PresenceEntry {
  const orgId = input.orgId.trim();
  const userId = input.userId.trim();
  pruneStalePresence(orgId);

  const entry: PresenceEntry = {
    userId,
    name: input.name.trim() || userId,
    lastActive: new Date(),
    currentActivity: (input.currentActivity?.trim() || "online").slice(0, 120),
  };

  bucketFor(orgId).set(userId, entry);
  return entry;
}

/**
 * Active peers for an org (TTL-pruned). Optionally exclude the caller.
 */
export function listActivePresence(
  orgId: string,
  options?: { excludeUserId?: string }
): PresenceEntry[] {
  const key = orgId.trim();
  pruneStalePresence(key);

  const bucket = store().get(key);
  if (!bucket) return [];

  const exclude = options?.excludeUserId?.trim();
  const now = Date.now();
  const rows: PresenceEntry[] = [];

  for (const entry of bucket.values()) {
    if (now - entry.lastActive.getTime() > PRESENCE_TTL_MS) continue;
    if (exclude && entry.userId === exclude) continue;
    rows.push(entry);
  }

  return rows.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
}
