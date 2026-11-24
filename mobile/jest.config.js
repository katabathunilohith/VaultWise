/**
 * Unit and contract tests for the phone (`npm test`). jest-expo is the preset Expo ships for its SDK
 * (58 here); it runs tests in the React Native environment with React Native and Expo modules mocked.
 *
 * Tests live in a `__tests__` folder next to the code they test, named `<what>.test.ts`. Contract
 * tests (`contract-<rule>.test.ts`) read the shared vectors in ../tests/contract/vectors, the same
 * files the server's suite reads (see tests/contract/README.md). Never put a test under src/app:
 * every file there is a screen.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/app/"],
  // tsconfig's `@/assets/*` (the preset maps only `@/*`, which would look in src/).
  moduleNameMapper: { "^@/assets/(.*)$": "<rootDir>/assets/$1" },
  // The preset's list (jest-expo/jest-preset.js), plus phosphor-react-native, whose per-icon files
  // (components/icons.ts) ship as untranspiled TypeScript.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|phosphor-react-native))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
  // Added after the preset's own setup files: in-memory storage (src/test/setup.ts).
  setupFiles: ["<rootDir>/src/test/setup.ts"],
  // Clean mocks between tests; modules with state are re-required per test where it matters.
  clearMocks: true,
};
