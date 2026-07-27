#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const self = path.resolve(fileURLToPath(import.meta.url));

const bannedPaths = [
  'deploy/install-remote.sh',
  'deploy/sync-env.sh',
  'deploy/run',
  'deploy/run-local',
  'skills/chefgroep-mail/SKILL.md',
  'assets/zoho-mail-chefgroep.svg',
];

const bannedFragments = [
  ['bc', '-scan-2'].join(''),
  ['/var/lib/', 'zoho-mail-mcp'].join(''),
  ['.cursor/', 'zoho-mcp.env'].join(''),
  ['skills/', 'chefgroep-mail'].join(''),
  ['zoho-mail-', 'chefgroep.svg'].join(''),
  ['ZOHO_EXPECTED_', 'PRIMARY_MAILBOX'].join(''),
  ['ZOHO_EXPECTED_', 'DELEGATED_MAILBOX'].join(''),
  ['Zoho Mail', ' — ChefGroep'].join(''),
  ['Private ', 'ChefGroep'].join(''),
  ['info@', 'chefgroep.online'].join(''),
  ['source "$', 'ENV_FILE"'].join(''),
  ['chefgroep.', 'mcp-tool-policy/v1'].join(''),
  ['chefgroep-', 'zoho-verifier'].join(''),
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['.git', 'node_modules', 'coverage', '.tmp'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const findings = [];
for (const rel of bannedPaths) {
  if (await exists(path.join(root, rel))) findings.push(`private-only or unsafe path remains: ${rel}`);
}

for (const file of await walk(root)) {
  if (path.resolve(file) === self) continue;
  const rel = path.relative(root, file);
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  for (const fragment of bannedFragments) {
    if (content.includes(fragment)) findings.push(`${rel}: contains private-only or unsafe fragment ${JSON.stringify(fragment)}`);
  }
}

for (const rel of ['.github/workflows/ci.yml', '.github/workflows/remote-smoke.yml']) {
  const content = await readFile(path.join(root, rel), 'utf8');
  const usesLines = content.split(/\r?\n/).filter((line) => line.trim().startsWith('- uses:'));
  for (const line of usesLines) {
    if (!/@[a-f0-9]{40}(?:\s|$)/i.test(line)) findings.push(`${rel}: action is not pinned to a full commit SHA: ${line.trim()}`);
  }
  if (!content.includes('persist-credentials: false')) {
    findings.push(`${rel}: checkout must disable persisted credentials`);
  }
}

const remoteSmoke = await readFile(path.join(root, '.github', 'workflows', 'remote-smoke.yml'), 'utf8');
if (!remoteSmoke.includes("if: github.ref == 'refs/heads/main'")) {
  findings.push('.github/workflows/remote-smoke.yml: secret-backed job must run only from main');
}
if (!remoteSmoke.includes('environment: zoho-remote-smoke')) {
  findings.push('.github/workflows/remote-smoke.yml: protected environment is missing');
}
if (remoteSmoke.includes('MCP_REMOTE_VERSION')) {
  findings.push('.github/workflows/remote-smoke.yml: runtime package version must not be environment-controlled');
}

if (findings.length > 0) {
  throw new Error(`public-source hygiene failed:\n${findings.join('\n')}`);
}

console.log('public-source ok: no private fleet material, shell-sourced config, mutable Actions or unsafe smoke-test configuration detected');
