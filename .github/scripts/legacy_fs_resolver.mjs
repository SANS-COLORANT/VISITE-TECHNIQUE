// Node-based test compatibility only. Android/Metro use the real Expo module.
// Expo SDK 54 moved the old FileSystem API to a package subdirectory without an
// ESM package export; Node cannot load the directory, but Metro can.
// This resolver is loaded only from the legacy REMAR/SQLite test command.
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const stubUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'legacy_fs_stub.mjs')).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-file-system/legacy') {
      return { url: stubUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
