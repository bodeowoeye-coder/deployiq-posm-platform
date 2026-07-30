import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const sourceFilePath = resolve('tests/commercial-pricing-engine.test.ts');
const sourceText = readFileSync(sourceFilePath, 'utf8');
const transpiled = ts.transpileModule(sourceText, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true
  }
});

const outputPath = resolve('tmp-commercial-pricing-test.cjs');
require('node:fs').writeFileSync(outputPath, transpiled.outputText);

await import('file://' + outputPath);
