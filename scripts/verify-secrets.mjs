#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.env.SECRET_SCAN_MODE || 'all';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(['all', 'endpoints', 'patterns'].includes(mode), `unsupported SECRET_SCAN_MODE: ${mode}`);

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

function isReservedExampleEndpoint(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'localhost'
      || host === '127.0.0.1'
      || host === '::1'
      || host.endsWith('.example')
      || host.endsWith('.example.com')
      || host.endsWith('.example.net')
      || host.endsWith('.example.org')
      || host.endsWith('.example.test');
  } catch {
    return false;
  }
}

const endpointAssignmentPattern = /ZOHO_MCP_URL\s*=\s*(https?:\/\/[^\s"'<>]+)/ig;
const secretPatterns = [
  /phc_[A-Za-z0-9]{20,}/,
  /Zoho-oauthtoken\s+[A-Za-z0-9._-]{20,}/i,
  /client_secret\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}/i,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:access|refresh)[_-]?token\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{20,}/i,
];

const findings = [];
for (const file of await walk(root)) {
  const rel = path.relative(root, file);
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    continue;
  }

  if (mode === 'all' || mode === 'endpoints') {
    endpointAssignmentPattern.lastIndex = 0;
    for (const match of content.matchAll(endpointAssignmentPattern)) {
      if (!isReservedExampleEndpoint(match[1])) findings.push(`${rel}: contains a non-example ZOHO_MCP_URL`);
    }
  }

  if (mode === 'all' || mode === 'patterns') {
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) findings.push(`${rel}: matched ${pattern}`);
    }
  }
}

assert(findings.length === 0, `possible secret material found:\n${findings.join('\n')}`);
console.log(`secrets ok (${mode}): no matching embedded secret material detected`);
