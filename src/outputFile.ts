import * as path from 'path';

import { promises as fs } from 'fs';

import type typescript from 'typescript';

import type { ParsedCommandLine } from 'typescript';

import type TSCache from './tscache';

export interface TypescriptSourceDescription {
  code: string | undefined;
  map: string | undefined;
  declarations: string[];
}

/**
 * Checks if the given OutputFile represents some code
 */
export function isCodeOutputFile(name: string): boolean {
  return !isMapOutputFile(name) && !isDeclarationOutputFile(name);
}

/**
 * Checks if the given OutputFile represents some source map
 */
export function isMapOutputFile(name: string): boolean {
  return name.endsWith('.map');
}

/**
 * Checks if the given OutputFile represents some TypeScript source map
 */
export function isTypeScriptMapOutputFile(name: string): boolean {
  return name.endsWith('ts.map');
}

/**
 * Checks if the given OutputFile represents some declaration
 */
export function isDeclarationOutputFile(name: string): boolean {
  return /\.d\.[cm]?ts$/.test(name);
}

/**
 * Returns the content of a filename either from the current
 * typescript compiler instance or from the cached content.
 * @param fileName The filename for the contents to retrieve
 * @param emittedFiles The files emitted in the current typescript instance
 * @param tsCache A cache to files cached by Typescript
 */
export function getEmittedFile(
  fileName: string | undefined,
  emittedFiles: ReadonlyMap<string, string>,
  tsCache: TSCache
): string | undefined {
  let code: string | undefined;
  if (fileName) {
    if (emittedFiles.has(fileName)) {
      code = emittedFiles.get(fileName);
    } else {
      code = tsCache.getCached(fileName);
    }
  }
  return code;
}

/**
 * Finds the corresponding emitted Javascript files for a given Typescript file.
 * @param id Path to the Typescript file.
 * @param emittedFiles Map of file names to source code,
 * containing files emitted by the Typescript compiler.
 */
export default function findTypescriptOutput(
  ts: typeof typescript,
  parsedOptions: ParsedCommandLine,
  id: string,
  emittedFiles: ReadonlyMap<string, string>,
  tsCache: TSCache
): TypescriptSourceDescription {
  const emittedFileNames = ts.getOutputFileNames(
    parsedOptions,
    id,
    !ts.sys.useCaseSensitiveFileNames
  );

  const codeFile = emittedFileNames.find(isCodeOutputFile);
  const mapFile = emittedFileNames.find(isMapOutputFile);

  return {
    code: getEmittedFile(codeFile, emittedFiles, tsCache),
    map: getEmittedFile(mapFile, emittedFiles, tsCache),
    declarations: emittedFileNames.filter((name) => name !== codeFile && name !== mapFile)
  };
}

export function normalizePath(fileName: string) {
  return fileName.split(path.win32.sep).join(path.posix.sep);
}

export async function emitFile(
  filePath: string,
  fileSource: string,
) {
  const normalizedFilePath = normalizePath(filePath);
  await fs.mkdir(path.dirname(normalizedFilePath), { recursive: true });
  await fs.writeFile(normalizedFilePath, fileSource);
}
