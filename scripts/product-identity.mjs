#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_SHA_ENV = 'MAIL_FOR_ZOHO_BUILD_SHA';
const SHA_RE = /^[0-9a-f]{40}$/;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath, rootDir = root) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

export function readPackageVersion(rootDir = root) {
  return readJson('package.json', rootDir).version;
}

export function readPluginVersion(rootDir = root) {
  return readJson('.codex-plugin/plugin.json', rootDir).version;
}

export function readBuildSha(env = process.env, name = BUILD_SHA_ENV) {
  const raw = String(env[name] ?? '').trim();
  if (!raw) return null;
  if (!SHA_RE.test(raw)) {
    throw new Error(`${name} must be a 40-character lowercase hex SHA, or unset`);
  }
  return raw;
}

export function readProductIdentity(env = process.env, rootDir = root) {
  const version = readPackageVersion(rootDir);
  const pluginVersion = readPluginVersion(rootDir);
  if (version !== pluginVersion) {
    throw new Error(`package.json version ${version} != plugin.json version ${pluginVersion}`);
  }
  return { version, source_sha: readBuildSha(env) };
}
