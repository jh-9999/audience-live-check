import "@testing-library/jest-dom/vitest";

const entries = new Map<string, string>();
const localStorage: Storage = {
  get length(): number {
    return entries.size;
  },
  clear(): void {
    entries.clear();
  },
  getItem(key: string): string | null {
    return entries.get(key) ?? null;
  },
  key(index: number): string | null {
    return Array.from(entries.keys())[index] ?? null;
  },
  removeItem(key: string): void {
    entries.delete(key);
  },
  setItem(key: string, value: string): void {
    entries.set(key, value);
  },
};

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorage,
  });
}

const values = new Map<string, string>();
const storage: Storage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => values.delete(key),
  setItem: (key, value) => values.set(key, value),
};

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}
