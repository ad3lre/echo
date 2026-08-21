import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  COLOR_LITERAL_ALLOWLIST,
  MAX_SOURCE_FILE_LOC,
  checkAppleMaintainability,
  countLines,
} from './check-maintainability.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appleRoot = path.resolve(__dirname, '..');

test('live apple tree currently passes the maintainability gate', () => {
  const result = checkAppleMaintainability({ appleRoot });
  assert.equal(
    result.violations.length,
    0,
    result.violations
      .map((v) => `${v.kind}: ${v.rel} (${v.detail})`)
      .join('\n'),
  );
});

test('countLines handles empty and trailing newline files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-apple-loc-'));
  const empty = path.join(dir, 'empty.swift');
  const one = path.join(dir, 'one.swift');
  fs.writeFileSync(empty, '');
  fs.writeFileSync(one, 'import Foundation\n');
  assert.equal(countLines(empty), 0);
  assert.equal(countLines(one), 2);
});

test('god-file ceiling catches oversized module sources', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-apple-gate-'));
  fs.mkdirSync(path.join(dir, 'Modules', 'EchoDomain', 'Sources'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, 'Apps', 'iOS'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Tests'), { recursive: true });
  const fat = path.join(dir, 'Modules', 'EchoDomain', 'Sources', 'Fat.swift');
  fs.writeFileSync(fat, `${'let x = 1\n'.repeat(MAX_SOURCE_FILE_LOC + 1)}`);
  fs.writeFileSync(
    path.join(dir, 'Apps', 'iOS', 'App.swift'),
    'import SwiftUI\n',
  );
  const result = checkAppleMaintainability({ appleRoot: dir });
  assert.ok(result.violations.some((v) => v.kind === 'god-file'));
});

test('color literal allowlist is limited to theme and welcome art', () => {
  assert.ok(
    COLOR_LITERAL_ALLOWLIST.has(
      'Modules/EchoFeatures/Sources/Shared/EchoTheme.swift',
    ),
  );
  assert.ok(
    COLOR_LITERAL_ALLOWLIST.has(
      'Modules/EchoFeatures/Sources/Shared/EchoWelcomeScene.swift',
    ),
  );
  assert.equal(COLOR_LITERAL_ALLOWLIST.size, 2);
});

test('color literal and import boundary violations are detected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-apple-color-'));
  fs.mkdirSync(path.join(dir, 'Modules', 'EchoDomain', 'Sources'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, 'Modules', 'EchoFeatures', 'Sources'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, 'Apps', 'iOS'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Tests'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'Modules', 'EchoDomain', 'Sources', 'Bad.swift'),
    'import SwiftUI\n',
  );
  fs.writeFileSync(
    path.join(dir, 'Modules', 'EchoFeatures', 'Sources', 'Tint.swift'),
    'import SwiftUI\nlet c = Color(red: 0.1, green: 0.2, blue: 0.3)\n',
  );
  fs.writeFileSync(
    path.join(dir, 'Apps', 'iOS', 'App.swift'),
    'import SwiftUI\n',
  );
  const result = checkAppleMaintainability({ appleRoot: dir });
  assert.ok(result.violations.some((v) => v.kind === 'import-boundary'));
  assert.ok(result.violations.some((v) => v.kind === 'color-literal'));
});

test('raw-ui-copy gate flags English Text literals outside the allowlist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-apple-copy-'));
  fs.mkdirSync(path.join(dir, 'Modules', 'EchoFeatures', 'Sources'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, 'Modules', 'EchoFeatures', 'Resources'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, 'Apps', 'iOS'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Tests'), { recursive: true });
  fs.writeFileSync(
    path.join(
      dir,
      'Modules',
      'EchoFeatures',
      'Resources',
      'Localizable.xcstrings',
    ),
    JSON.stringify({
      strings: {
        Hello: {
          localizations: {
            en: { stringUnit: { state: 'translated', value: 'Hello' } },
            es: { stringUnit: { state: 'translated', value: 'Hola' } },
          },
        },
      },
    }) + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'Modules', 'EchoFeatures', 'Sources', 'Raw.swift'),
    'import SwiftUI\nvar body: some View { Text("Hello world") }\n',
  );
  fs.writeFileSync(
    path.join(dir, 'Apps', 'iOS', 'App.swift'),
    'import SwiftUI\n',
  );
  const result = checkAppleMaintainability({ appleRoot: dir });
  assert.ok(result.violations.some((v) => v.kind === 'raw-ui-copy'));
});

test('catalog-locale-coverage requires en and es', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-apple-locale-'));
  fs.mkdirSync(path.join(dir, 'Modules', 'EchoFeatures', 'Resources'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, 'Apps', 'iOS'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Tests'), { recursive: true });
  fs.writeFileSync(
    path.join(
      dir,
      'Modules',
      'EchoFeatures',
      'Resources',
      'Localizable.xcstrings',
    ),
    JSON.stringify({
      strings: {
        Hello: {
          localizations: {
            en: { stringUnit: { state: 'translated', value: 'Hello' } },
          },
        },
      },
    }) + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'Apps', 'iOS', 'App.swift'),
    'import SwiftUI\n',
  );
  const result = checkAppleMaintainability({ appleRoot: dir });
  assert.ok(
    result.violations.some((v) => v.kind === 'catalog-locale-coverage'),
  );
});
