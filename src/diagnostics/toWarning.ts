import { PartialMessage } from 'esbuild';
import type typescript from 'typescript';
import type { Diagnostic, FormatDiagnosticsHost } from 'typescript';

/**
 * Converts a Typescript type error into an equivalent esbuild warning object.
 */
export default function diagnosticToWarning(
  ts: typeof typescript,
  host: FormatDiagnosticsHost | null,
  diagnostic: Diagnostic
) {
  const pluginCode = `TS${diagnostic.code}`;
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

  // Build a esbuild warning object from the diagnostics object.
  const warning: PartialMessage = {
    pluginName: '@libmedia/esbuild-plugin-typescript',
    text: `@libmedia/esbuild-plugin-typescript ${pluginCode}: ${message}`
  };

  if (diagnostic.file) {
    // Add information about the file location
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);

    warning.location = {
      column: character + 1,
      line: line + 1,
      file: diagnostic.file.fileName
    };

    if (host) {
      // Extract a code frame from Typescript
      const formatted = ts.formatDiagnosticsWithColorAndContext([diagnostic], host);
      // Typescript only exposes this formatter as a string prefixed with the flattened message.
      // We need to remove it here since esbuild treats the properties as separate parts.
      let frame = formatted.slice(formatted.indexOf(message) + message.length);
      const newLine = host.getNewLine();
      if (frame.startsWith(newLine)) {
        frame = frame.slice(frame.indexOf(newLine) + newLine.length);
      }
      warning.detail = frame;
    }
  }

  return warning;
}
