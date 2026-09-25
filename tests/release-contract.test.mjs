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
const workflowsDir = path.join(root, '.github/workflows');
const workflow = readFileSync(path.join(workflowsDir, 'release.yml'), 'utf8');
const PUBLIC_HOSTED = ['ci.yml', 'design-system-contract.yml', 'publish.yml', 'release.yml'];
const REMOTE_SMOKE_HEAVY =
  "runs-on: ${{ fromJSON('[\"self-hosted\",\"Linux\",\"X64\",\"heavy\"]') }}";

test('public workflows use GitHub-hosted runners', () => {
  for (const name of PUBLIC_HOSTED) {
    const text = readFileSync(path.join(workflowsDir, name), 'utf8');
    assert.match(text, /^\s*runs-on:\s*ubuntu-latest\s*$/m, name);
    assert.doesNotMatch(text, /self-hosted/, name);
  }
});

test('remote smoke keeps the heavy self-hosted label', () => {
  const smoke = readFileSync(path.join(workflowsDir, 'remote-smoke.yml'), 'utf8');
  assert.ok(smoke.includes(REMOTE_SMOKE_HEAVY));
});

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

test('release concurrency serializes tag push and backfill on the same key', () => {
  assert.match(workflow, /group: release-\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.tag \|\| github\.ref_name \}\}/);
});

test('release tag fetch updates the origin/main tracking ref', () => {
  const source = readFileSync(
    path.join(root, 'scripts', 'verify-release-tag.mjs'),
    'utf8',
  );
  assert.match(
    source,
    /'fetch', '--no-tags', 'origin', '\+refs\/heads\/main:refs\/remotes\/origin\/main'/,
  );
});

test('design-system push trigger is limited to main', () => {
  const design = readFileSync(path.join(workflowsDir, 'design-system-contract.yml'), 'utf8');
  assert.match(design, /push:\n +branches: \[main\]/);
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
