// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
  },
  {
    rules: {
      // React Native loads images, fonts and per-file icons with require(); that's the platform idiom.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
