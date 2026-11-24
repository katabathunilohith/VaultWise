/**
 * The Practice save (persist.ts) on the in-memory storage from src/test/setup.ts. Each test loads
 * fresh copies of persist.ts and the storage behind it, so slices and saved data never leak between tests.
 */
import type { PracticeSlice } from "../persist";

type Persist = typeof import("../persist");
type Storage = typeof import("../../../storage");

interface Kit {
  persist: Persist;
  storage: Storage;
  bulk: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };
}

const BULK_KEY = "vw.bulk.practice";

function fresh(): Kit {
  let kit!: Kit;
  jest.isolateModules(() => {
    kit = {
      persist: require("../persist"),
      storage: require("../../../storage"),
      bulk: require("@react-native-async-storage/async-storage"),
    };
  });
  return kit;
}

/** A slice holding one number; `load` refuses anything that isn't one, like the real slices do. */
function slice(key: string, sensitive = false) {
  const s = { value: 0, loads: 0, resets: 0 };
  const def: PracticeSlice<{ n: number }> = {
    key,
    sensitive,
    save: () => ({ n: s.value }),
    load: (saved) => {
      if (typeof saved?.n !== "number") throw new Error(`Not a ${key}`);
      s.value = saved.n;
      s.loads += 1;
    },
    reset: () => {
      s.value = 0;
      s.resets += 1;
    },
  };
  return { s, def };
}

/** Lets the writes persist.ts starts without awaiting (chunked secure writes take a few turns) finish. */
async function flush() {
  for (let i = 0; i < 25; i++) await new Promise((r) => setTimeout(r, 0));
}

// A restore ends with writes it doesn't wait for: let them finish inside the test.
afterEach(flush);

describe("restorePracticeData", () => {
  it("does nothing when there is no save", async () => {
    const { persist } = fresh();
    const a = slice("a");
    persist.registerPracticeSlice(a.def);
    await persist.restorePracticeData();
    expect(a.s).toEqual({ value: 0, loads: 0, resets: 0 });
  });

  it("loads a good save, the sensitive slice from secure storage", async () => {
    const { persist, storage, bulk } = fresh();
    const a = slice("a");
    const pin = slice("pin", true);
    persist.registerPracticeSlice(a.def);
    persist.registerPracticeSlice(pin.def);
    await bulk.setItem(BULK_KEY, JSON.stringify({ format: 1, slices: { a: { n: 7 } } }));
    await storage.setSecureChunked("vw.practice.pin", JSON.stringify({ format: 1, data: { n: 42 } }));
    await persist.restorePracticeData();
    expect(a.s).toMatchObject({ value: 7, loads: 1, resets: 0 });
    expect(pin.s).toMatchObject({ value: 42, loads: 1, resets: 0 });
  });

  it.each([
    ["not JSON", "{oops"],
    ["an older format", JSON.stringify({ format: 0, slices: { a: { n: 1 } } })],
    ["no slices", JSON.stringify({ format: 1 })],
    ["a slice that doesn't fit", JSON.stringify({ format: 1, slices: { a: { n: "seven" } } })],
  ])("starts every slice over from a damaged save (%s), and forgets it", async (_why, raw) => {
    const { persist, storage, bulk } = fresh();
    const a = slice("a");
    const b = slice("b");
    const pin = slice("pin", true);
    for (const x of [a, b, pin]) persist.registerPracticeSlice(x.def);
    await bulk.setItem(BULK_KEY, raw);
    await storage.setSecureChunked("vw.practice.pin", JSON.stringify({ format: 1, data: { n: 42 } }));
    await persist.restorePracticeData();
    for (const x of [a, b, pin]) expect(x.s.resets).toBe(1);
    expect(pin.s.value).toBe(0);
    expect(await bulk.getItem(BULK_KEY)).toBeNull();
    expect(await storage.getSecureChunked("vw.practice.pin")).toBeNull();
  });

  it("starts over when only the secure part is from another version", async () => {
    const { persist, storage, bulk } = fresh();
    const a = slice("a");
    const pin = slice("pin", true);
    persist.registerPracticeSlice(a.def);
    persist.registerPracticeSlice(pin.def);
    await bulk.setItem(BULK_KEY, JSON.stringify({ format: 1, slices: { a: { n: 7 } } }));
    await storage.setSecureChunked("vw.practice.pin", JSON.stringify({ format: 99, data: { n: 42 } }));
    await persist.restorePracticeData();
    expect(a.s.resets).toBe(1);
    expect(a.s.value).toBe(0);
    expect(await storage.getSecureChunked("vw.practice.pin")).toBeNull();
  });

  it("moves a sensitive slice out of an older bulk save into secure storage", async () => {
    const { persist, storage, bulk } = fresh();
    const a = slice("a");
    const pin = slice("pin", true);
    persist.registerPracticeSlice(a.def);
    persist.registerPracticeSlice(pin.def);
    await bulk.setItem(BULK_KEY, JSON.stringify({ format: 1, slices: { a: { n: 7 }, pin: { n: 42 } } }));
    await persist.restorePracticeData();
    expect(pin.s).toMatchObject({ value: 42, loads: 1 });
    await flush();
    expect(JSON.parse((await storage.getSecureChunked("vw.practice.pin")) ?? "null")).toEqual({ format: 1, data: { n: 42 } });
    // The bulk save no longer holds it.
    expect(JSON.parse((await bulk.getItem(BULK_KEY)) ?? "null")).toEqual({ format: 1, slices: { a: { n: 7 } } });
  });
});

describe("savingAfterEachCall", () => {
  it("keeps each call's own result, sync or async, and saves soon after", async () => {
    jest.useFakeTimers();
    try {
      const { persist, bulk } = fresh();
      // Not a fresh install (that would wipe the device first: lib/storage.ts).
      await bulk.setItem("vw.install", "1");
      const a = slice("a");
      persist.registerPracticeSlice(a.def);
      const api = persist.savingAfterEachCall({ two: () => 2, later: async () => "x", label: "kept" });
      expect(api.two()).toBe(2);
      await expect(api.later()).resolves.toBe("x");
      expect(api.label).toBe("kept");
      a.s.value = 5;
      // One save for the burst, half a second later (then real timers, so its storage writes can finish).
      await jest.advanceTimersByTimeAsync(600);
      jest.useRealTimers();
      await flush();
      expect(JSON.parse((await bulk.getItem(BULK_KEY)) ?? "null")).toEqual({ format: 1, slices: { a: { n: 5 } } });
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
