// Stub for Node.js path module in browser environments
export function join(...args) {
  return args.filter(Boolean).join('/');
}

export function resolve(...args) {
  return args.filter(Boolean).join('/');
}

export function dirname(p) {
  if (!p) return '.';
  const parts = p.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function basename(p, ext) {
  if (!p) return '';
  const base = p.split('/').pop() || '';
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length);
  }
  return base;
}

export function extname(p) {
  if (!p) return '';
  const base = p.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx) : '';
}

export function normalize(p) {
  return p;
}

export function isAbsolute(p) {
  return p && p.startsWith('/');
}

export const sep = '/';
export const delimiter = ':';

export default {
  join,
  resolve,
  dirname,
  basename,
  extname,
  normalize,
  isAbsolute,
  sep,
  delimiter,
};
