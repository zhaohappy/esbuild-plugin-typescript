import { relative, dirname } from 'path';

import type { BuildOptions } from 'esbuild';
import type { PluginContext } from '../../types'

import type { CompilerOptions } from './interfaces';
import { DIRECTORY_PROPS } from './normalize';

/**
 * Validate that the `compilerOptions.sourceMap` option matches `outputOptions.sourcemap`.
 * @param context esbuild plugin context used to emit warnings.
 * @param compilerOptions Typescript compiler options.
 * @param outputOptions esbuild output options.
 * @param autoSetSourceMap True if the `compilerOptions.sourceMap` property was set to `true`
 * by the plugin, not the user.
 */
export function validateSourceMap(
  context: PluginContext,
  compilerOptions: CompilerOptions,
  outputOptions: BuildOptions,
  autoSetSourceMap: boolean
) {
  if ((compilerOptions.sourceMap || compilerOptions.inlineSourceMap) && !outputOptions.sourcemap && !autoSetSourceMap) {
    context.warn(
      {
        pluginName: '@libmedia/esbuild-plugin-typescript',
        text: `@libmedia/esbuild-plugin-typescript: esbuild 'sourcemap' option must be set to generate source maps.`
      }
    );
  } else if (!(compilerOptions.sourceMap || compilerOptions.inlineSourceMap) && outputOptions.sourcemap) {
    context.warn(
      {
        pluginName: '@libmedia/esbuild-plugin-typescript',
        text: `@libmedia/esbuild-plugin-typescript: Typescript 'sourceMap' compiler option must be set to generate source maps.`
      }
    );
  }
}

/**
 * Validate that the out directory used by Typescript can be controlled by esbuild.
 * @param context esbuild plugin context used to emit errors.
 * @param compilerOptions Typescript compiler options.
 * @param outputOptions esbuild output options.
 */
export function validatePaths(
  context: PluginContext,
  compilerOptions: CompilerOptions,
  outputOptions: BuildOptions
) {
  if (compilerOptions.out) {
    context.error(
      {
        pluginName: '@libmedia/esbuild-plugin-typescript',
        text: `@libmedia/esbuild-plugin-typescript: Deprecated Typescript compiler option 'out' is not supported. Use 'outDir' instead.`
      }
    );
  } else if (compilerOptions.outFile) {
    context.error(
      {
        pluginName: '@libmedia/esbuild-plugin-typescript',
        text: `@libmedia/esbuild-plugin-typescript: Typescript compiler option 'outFile' is not supported. Use 'outDir' instead.`
      }
    );
  }

  let outputDir: string | undefined = outputOptions.outdir;
  if (outputOptions.outfile) {
    outputDir = dirname(outputOptions.outfile);
  }
  for (const dirProperty of DIRECTORY_PROPS) {
    if (compilerOptions[dirProperty] && outputDir) {
      // Checks if the given path lies within esbuild output dir
      if (outputOptions.outdir) {
        const fromRollupDirToTs = relative(outputDir, compilerOptions[dirProperty]!);
        if (fromRollupDirToTs.startsWith('..')) {
          context.error(
            {
              pluginName: '@libmedia/esbuild-plugin-typescript',
              text: `@libmedia/esbuild-plugin-typescript: Path of Typescript compiler option '${dirProperty}' must be located inside Rollup 'dir' option.`
            }
          );
        }
      } else if (dirProperty === 'outDir') {
        const fromTsDirToRollup = relative(compilerOptions[dirProperty]!, outputDir);
        if (fromTsDirToRollup.startsWith('..')) {
          context.error(
            {
              pluginName: '@libmedia/esbuild-plugin-typescript',
              text: `@libmedia/esbuild-plugin-typescript: Path of Typescript compiler option '${dirProperty}' must be located inside the same directory as the Rollup 'file' option.`
            }
          );
        }
      } else {
        const fromTsDirToRollup = relative(outputDir, compilerOptions[dirProperty]!);
        if (fromTsDirToRollup.startsWith('..')) {
          context.error(
            {
              pluginName: '@libmedia/esbuild-plugin-typescript',
              text: `@libmedia/esbuild-plugin-typescript: Path of Typescript compiler option '${dirProperty}' must be located inside the same directory as the Rollup 'file' option.`
            }
          );
        }
      }
    }
  }

  if (compilerOptions.declaration || compilerOptions.declarationMap || compilerOptions.composite) {
    if (DIRECTORY_PROPS.every((dirProperty) => !compilerOptions[dirProperty])) {
      context.error(
        {
          pluginName: '@libmedia/esbuild-plugin-typescript',
          text: `@libmedia/esbuild-plugin-typescript: You are using one of Typescript's compiler options 'declaration', 'declarationMap' or 'composite'. ` +
          `In this case 'outDir' or 'declarationDir' must be specified to generate declaration files.`
        }
      );
    }
  }
}
