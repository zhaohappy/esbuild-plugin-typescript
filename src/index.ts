import * as path from 'path';
import * as fs from 'fs'

import createFilter from './createFilter';

import type { PartialMessage, Plugin } from 'esbuild';
import type { Watch } from 'typescript';

import type { EsbuildTypescriptOptions, PluginContext } from '../types';

import createFormattingHost from './diagnostics/host';
import createModuleResolver from './moduleResolution';
import { getPluginOptions } from './options/plugin';
import { emitParsedOptionsErrors, parseTypescriptConfig } from './options/tsconfig';
import { validatePaths, validateSourceMap } from './options/validate';
import findTypescriptOutput, {
  getEmittedFile,
  normalizePath,
  emitFile,
  isDeclarationOutputFile,
  isTypeScriptMapOutputFile
} from './outputFile';
import { preflight } from './preflight';
import createWatchProgram, { WatchProgramHelper } from './watchProgram';
import TSCache from './tscache';

export default function typescript(options: EsbuildTypescriptOptions = {}): Plugin {
  const {
    cacheDir,
    compilerOptions,
    exclude,
    filterRoot,
    include,
    noForceEmit,
    transformers,
    tsconfig,
    tslib,
    typescript: ts
  } = getPluginOptions(options);
  const tsCache = new TSCache(cacheDir);
  const emittedFiles = new Map<string, string>();
  const watchProgramHelper = new WatchProgramHelper();

  const parsedOptions = parseTypescriptConfig(ts, tsconfig, compilerOptions, noForceEmit);

  if (parsedOptions.options.sourceMap) {
    parsedOptions.options.sourceMap = false;
    parsedOptions.options.inlineSources = true;
    parsedOptions.options.inlineSourceMap = true;
  }

  const filter = createFilter(include || '{,**/}*.(cts|mts|ts|tsx)', exclude, {
    resolve: filterRoot ?? parsedOptions.options.rootDir
  });
  parsedOptions.fileNames = parsedOptions.fileNames.filter(filter);

  const formatHost = createFormattingHost(ts, parsedOptions.options);
  const resolveModule = createModuleResolver(ts, formatHost, filter);

  let program: Watch<unknown> | null = null;

  const errors: PartialMessage[] = [];
  const warnings: PartialMessage[] = [];

  const context: PluginContext = {
    error(message) {
      errors.push(message);
    },
    warn(message) {
      warnings.push(message);
    }
  }

  return {
    name: 'typescript',

    setup(build) {
      build.onStart(() => {
        emitParsedOptionsErrors(ts, context, parsedOptions);

        preflight({
          config: parsedOptions,
          context,
          inputPreserveModules: (build.initialOptions as unknown as { preserveModules: boolean })
            .preserveModules,
          tslib
        });
        if (!program) {
          program = createWatchProgram(ts, context, {
            formatHost,
            resolveModule,
            parsedOptions,
            writeFile(fileName, data) {
              if (parsedOptions.options.composite || parsedOptions.options.incremental) {
                tsCache.cacheCode(fileName, data);
              }
              emittedFiles.set(fileName, data);
            },
            status(diagnostic) {
              watchProgramHelper.handleStatus(diagnostic);
            },
            transformers
          });
        }
        else {
          watchProgramHelper.watch();
        }
        validateSourceMap(context, parsedOptions.options, build.initialOptions, parsedOptions.autoSetSourceMap);
        validatePaths(context, parsedOptions.options, build.initialOptions);
      })

      build.onDispose(() => {
        program?.close();
      })

      build.onLoad({filter: /\.(cts|mts|ts|tsx)$/}, async (args) => {
        if (!filter(args.path)) return ;

        await watchProgramHelper.wait();

        const fileName = normalizePath(args.path);
        if (!parsedOptions.fileNames.includes(fileName)) {
          // Discovered new file that was not known when originally parsing the TypeScript config
          parsedOptions.fileNames.push(fileName);
        }

        const output = findTypescriptOutput(ts, parsedOptions, args.path, emittedFiles, tsCache);

        const result = output.code != null ? {
          contents: output.code,
          errors: errors.slice(),
          warnings: warnings.slice()
        } : undefined;
        errors.length = 0
        warnings.length = 0
        return result
      })

      build.onEnd(async () => {
         const declarationAndTypeScriptMapFiles = [...emittedFiles.keys()].filter(
          (fileName) => (isDeclarationOutputFile(fileName) && filter(fileName.replace(/\.d\.ts$/, '.ts'))) || isTypeScriptMapOutputFile(fileName)
        );

        declarationAndTypeScriptMapFiles.forEach((id) => {
          const code = getEmittedFile(id, emittedFiles, tsCache);
          if (!code || !parsedOptions.options.declaration) {
            return;
          }

          let baseDir: string | undefined;
          if (parsedOptions.options.declarationDir) {
            baseDir = path.resolve(parsedOptions.configPath, parsedOptions.options.declarationDir)
          }
          else if (build.initialOptions.outdir) {
            baseDir = build.initialOptions.outdir;
          }
          else if (build.initialOptions.outfile) {
            // the bundle output directory used by rollup when outputOptions.file is used instead of outputOptions.dir
            baseDir = path.dirname(build.initialOptions.outfile);
          }

          if (!baseDir) return;

          const fileName = path.join(baseDir, path.basename(id))
          fs.mkdirSync(path.dirname(fileName), { recursive: true })
          fs.writeFileSync(fileName, code)
        });

        const tsBuildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(parsedOptions.options);
        if (tsBuildInfoPath) {
          const tsBuildInfoSource = emittedFiles.get(tsBuildInfoPath);
          if (tsBuildInfoSource) {
            await emitFile(
              tsBuildInfoPath,
              tsBuildInfoSource
            );
          }
        }
      })
    }
  };
}
