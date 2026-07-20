import { z } from "zod";

const STORAGE_KEY = "live-check-in-session";

const memoryEntries = new Map<string, string>();
const memoryStorage: Storage = {
  get length(): number {
    return memoryEntries.size;
  },
  clear(): void {
    memoryEntries.clear();
  },
  getItem(key: string): string | null {
    return memoryEntries.get(key) ?? null;
  },
  key(index: number): string | null {
    return Array.from(memoryEntries.keys())[index] ?? null;
  },
  removeItem(key: string): void {
    memoryEntries.delete(key);
  },
  setItem(key: string, value: string): void {
    memoryEntries.set(key, value);
  },
};

const storedSessionSchema = z.object({
  sessionToken: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  heartbeatIntervalMs: z.number().int().positive(),
});

export type StoredSession = z.infer<typeof storedSessionSchema>;

function getStorage(): Storage {
  try {
    return window.localStorage ?? memoryStorage;
  } catch (error) {
    if (error instanceof DOMException) {
      return memoryStorage;
    }
    throw error;
  }
}

export function readStoredSession(now = Date.now()): StoredSession | null {
  const storage = getStorage();
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    throw error;
  }

  const parsed = storedSessionSchema.safeParse(candidate);
  if (!parsed.success || Date.parse(parsed.data.expiresAt) <= now) {
    storage.removeItem(STORAGE_KEY);
    return null;
  }

  return parsed.data;
}

export function saveStoredSession(session: StoredSession): void {
  getStorage().setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  getStorage().removeItem(STORAGE_KEY);
}
