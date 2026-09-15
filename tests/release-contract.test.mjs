import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUILD_SHA_ENV, readProductIdentity } from '../scripts/product-identity.mjs';
import {
  expectedTag,
  sourcesAgree,
  verifyTagEqualsVersion,
} from '../scripts/verify-release-tag.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');

test('workflow verifies tag equals version sources and sits on origin/main', () => {
  assert.match(workflow, /tags:\s*\n\s+-\s*['"]v\*/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /tag:/);
  assert.match(workflow, /verify-release-tag\.mjs --tag/);
  assert.match(workflow, /origin\/main/);
  assert.match(workflow, /npm pack --ignore-scripts/);
  assert.match(workflow, /sha256sum .* > SHA256SUMS/);
  assert.match(workflow, /SHA256SUMS/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--generate-notes/);
  assert.match(workflow, /MAIL_FOR_ZOHO_BUILD_SHA/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});

test('package.json and plugin.json versions agree', () => {
  const version = sourcesAgree();
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(expectedTag(version), `v${version}`);
  assert.deepEqual(verifyTagEqualsVersion(`v${version}`), { tag: `v${version}`, version });
  assert.throws(() => verifyTagEqualsVersion('v0.0.0'), /does not equal version source/);
});

test('run-local --version reads the manifest and omits an unknown SHA', () => {
  const env = { ...process.env };
  delete env[BUILD_SHA_ENV];
  const result = spawnSync(process.execPath, ['scripts/run-local.mjs', '--version'], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  const identity = JSON.parse(result.stdout);
  assert.equal(identity.version, sourcesAgree());
  assert.equal(identity.source_sha, null);
});

test('product identity accepts a release SHA and rejects an invented default', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  const identity = readProductIdentity({ [BUILD_SHA_ENV]: sha });
  assert.equal(identity.version, sourcesAgree());
  assert.equal(identity.source_sha, sha);
  assert.throws(() => readProductIdentity({ [BUILD_SHA_ENV]: 'unknown' }), /40-character/);
});
