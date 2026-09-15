import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
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
const HOSTED_RUNNER = /^\s*runs-on:\s*.*(ubuntu-latest|macos-latest|windows-latest)/;
const FLEET_PR_OR_HEAVY =
  "runs-on: ${{ github.event_name == 'pull_request' && fromJSON('[\"self-hosted\",\"Linux\",\"X64\",\"pr-isolated\"]') || fromJSON('[\"self-hosted\",\"Linux\",\"X64\",\"heavy\"]') }}";
const FLEET_HEAVY = 'runs-on: [self-hosted, Linux, X64, heavy]';

test('workflows do not use GitHub-hosted runners', () => {
  for (const name of readdirSync(workflowsDir)) {
    if (!name.endsWith('.yml')) continue;
    const text = readFileSync(path.join(workflowsDir, name), 'utf8');
    for (const line of text.split('\n')) {
      assert.doesNotMatch(line, HOSTED_RUNNER, `${name}: ${line}`);
    }
  }
});

test('ci and design-system jobs use pr-isolated or heavy', () => {
  const ci = readFileSync(path.join(workflowsDir, 'ci.yml'), 'utf8');
  const design = readFileSync(path.join(workflowsDir, 'design-system-contract.yml'), 'utf8');
  assert.ok(ci.includes(FLEET_PR_OR_HEAVY));
  assert.ok(design.includes(FLEET_PR_OR_HEAVY));
});

test('publish and release jobs use heavy', () => {
  const publish = readFileSync(path.join(workflowsDir, 'publish.yml'), 'utf8');
  assert.ok(publish.includes(FLEET_HEAVY));
  assert.match(workflow, /self-hosted/);
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
