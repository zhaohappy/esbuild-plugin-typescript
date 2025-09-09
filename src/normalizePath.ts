import { win32, posix } from 'path';

const normalizePathRegExp = new RegExp(`\\${win32.sep}`, 'g');

const normalizePath = function normalizePath(filename: string) {
  return filename.replace(normalizePathRegExp, posix.sep);
};

export { normalizePath as default };