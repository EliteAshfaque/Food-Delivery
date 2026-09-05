const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * Expo SDK 57 flat-config linting for app and component source. Keeping this
 * local to the mobile workspace avoids applying browser/mobile globals to the
 * Nest API package.
 */
module.exports = defineConfig([
  expoConfig,
  globalIgnores(['.expo/**', 'dist/**', 'node_modules/**']),
]);
