// Stub for Node.js fs module in browser environments
export function readFileSync() {
  throw new Error('readFileSync is not available in browser');
}

export function writeFileSync() {
  throw new Error('writeFileSync is not available in browser');
}

export function existsSync() {
  return false;
}

export function mkdirSync() {
  throw new Error('mkdirSync is not available in browser');
}

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
};
