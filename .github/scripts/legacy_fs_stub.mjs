// Legacy Expo FileSystem stub for Node-only, real-SQLite and in-memory
// Excel roundtrip tests. Calls that touch the device filesystem MUST fail
// loudly instead of creating a false success.
export const EncodingType = Object.freeze({ Base64: 'base64', UTF8: 'utf8' });
export const cacheDirectory = '/tmp/metra-qa-cache/';
export const documentDirectory = '/tmp/metra-qa-docs/';
export const StorageAccessFramework = Object.freeze({});
const unsupported = async () => { throw new Error('Node REMAR test cannot access native Expo FileSystem'); };
export const readAsStringAsync = unsupported;
export const writeAsStringAsync = unsupported;
export const copyAsync = unsupported;
export const moveAsync = unsupported;
export const getInfoAsync = unsupported;
export const deleteAsync = unsupported;
export const makeDirectoryAsync = unsupported;
