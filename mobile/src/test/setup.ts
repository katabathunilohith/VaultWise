/**
 * Jest setup for every phone test (jest.config.js `setupFiles`, after jest-expo's own). Never
 * imported by the app.
 *
 * Storage is in memory, so lib/storage.ts (and the Practice save on top of it) runs for real:
 * AsyncStorage uses the package's own Jest mock, and expo-secure-store a Map. Each test file gets
 * fresh copies (Jest's module registry is per file).
 */
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    isAvailableAsync: jest.fn(async () => true),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  };
});
