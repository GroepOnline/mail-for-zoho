import { constants, existsSync, lstatSync } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Restrictive umask for every entrypoint that imports this module, so OAuth
// cache directories created by mcp-remote are never group/world-readable.
process.umask(0o077);

export const MCP_REMOTE_SPEC = 'mcp-remote@0.1.37';
export const PROFILE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const MAX_ENDPOINT_LENGTH = 4_096;

// Single source of truth for the outbound/destructive tool boundary. The local
// bridge blocks these as `*keyword*` globs; the remote drift verifier matches
// the same keywords so it fails on any upstream tool the bridge would suppress.
export const FORBIDDEN_TOOL_KEYWORDS = Object.freeze([
  'send',
  'reply',
  'forward',
  'delete',
  'trash',
  'purge',
  'delegate',
  'delegation',
  'admin',
  'security',
]);
export const BLOCKED_TOOL_PATTERNS = Object.freeze(
  FORBIDDEN_TOOL_KEYWORDS.map((keyword) => `*${keyword}*`),
);
export const FORBIDDEN_TOOL_PATTERN = new RegExp(`(${FORBIDDEN_TOOL_KEYWORDS.join('|')})`, 'i');

const CHILD_ENV_ALLOWLIST = [
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TERM',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'DBUS_SESSION_BUS_ADDRESS',
  'XDG_RUNTIME_DIR',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
];

function assertSingleLine(value, label) {
  if (/[\r\n\0]/.test(value)) throw new Error(`${label} must be a single line`);
}

export function validateProfile(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 63) {
    throw new Error('profile must be a lowercase slug between 1 and 63 characters');
  }
  if (!PROFILE_PATTERN.test(value)) {
    throw new Error('profile must contain only lowercase letters, digits, and single hyphens');
  }
  return value;
}

export function parseLauncherArgs(argv = process.argv.slice(2)) {
  if (argv.length === 0) return { profile: null };
  if (argv.length !== 2 || argv[0] !== '--profile') {
    throw new Error('usage: run-local.mjs [--profile <lowercase-slug>]');
  }
  return { profile: validateProfile(argv[1]) };
}

export function parseProtectedEnv(content) {
  const values = {};
  for (const [index, rawLine] of String(content).split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`invalid protected env syntax on line ${index + 1}`);

    const [, key, rawValue] = match;
    // Legacy pin from the former shell launcher. The bridge is now hard-pinned,
    // so this key is ignored rather than rejected to keep old env files working.
    if (key === 'MCP_REMOTE_VERSION') continue;
    if (key !== 'ZOHO_MCP_URL') {
      throw new Error(`unsupported protected env key on line ${index + 1}: ${key}`);
    }
    if (Object.hasOwn(values, key)) throw new Error(`duplicate protected env key: ${key}`);

    const value = rawValue.trim();
    if (!value) throw new Error(`${key} must not be empty`);
    if (/^['"]|['"]$/.test(value)) {
      throw new Error(`${key} must be an unquoted URL; shell expansion is not supported`);
    }
    assertSingleLine(value, key);
    values[key] = value;
  }
  return values;
}

export function validateEndpoint(value) {
  assertSingleLine(value, 'ZOHO_MCP_URL');
  if (value.length > MAX_ENDPOINT_LENGTH) throw new Error('ZOHO_MCP_URL is too long');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('ZOHO_MCP_URL is not a valid URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('ZOHO_MCP_URL must use HTTPS');
  if (parsed.username || parsed.password) {
    throw new Error('ZOHO_MCP_URL must not contain URL userinfo credentials');
  }
  if (parsed.hash) throw new Error('ZOHO_MCP_URL must not contain a fragment');
  return value;
}

function resolveConfigHome(source) {
  const home = source.HOME || source.USERPROFILE;
  const configHome = source.XDG_CONFIG_HOME
    || (process.platform === 'win32'
      ? source.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : null)
      : home ? path.join(home, '.config') : null);
  if (!configHome) throw new Error('cannot resolve a private Mail for Zoho config directory');
  return configHome;
}

export function resolveProfileEnvPath(source, profile) {
  const safeProfile = validateProfile(profile);
  const profilesRoot = path.resolve(resolveConfigHome(source), 'mail-for-zoho', 'profiles');
  const envFile = path.resolve(profilesRoot, safeProfile, 'env');
  const relative = path.relative(profilesRoot, envFile);
  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
  ) {
    throw new Error('profile config path escapes the profiles directory');
  }
  return envFile;
}

function assertTrustedAncestorChain(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('protected path escapes its trusted root');
  }

  let current = resolvedRoot;
  const parts = relative.split(path.sep);
  // Walk every intermediate directory; the leaf is validated by open(O_NOFOLLOW).
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`protected path must not traverse a symlink: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`protected path ancestor is not a directory: ${current}`);
    }
  }
}

async function readProtectedEnvFile(envFile, { trustedRoot = null } = {}) {
  if (trustedRoot) assertTrustedAncestorChain(trustedRoot, envFile);

  // lstat first so a symlinked leaf is rejected identically on every platform,
  // even where O_NOFOLLOW is unavailable. A missing file throws ENOENT here.
  if (lstatSync(envFile).isSymbolicLink()) {
    throw new Error(`protected env file must not be a symlink: ${envFile}`);
  }

  const noFollow = process.platform !== 'win32' && constants.O_NOFOLLOW
    ? constants.O_NOFOLLOW
    : 0;
  let handle;
  try {
    handle = await open(envFile, constants.O_RDONLY | noFollow);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error(`protected env file must not be a symlink: ${envFile}`);
    throw error;
  }

  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`protected env path is not a regular file: ${envFile}`);
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error(`protected env file permissions must be 0600 or stricter: ${envFile}`);
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

export async function resolveEndpoint(env = process.env, { profile = null } = {}) {
  let envFile;
  let trustedRoot = null;
  if (profile !== null) {
    if (env.ZOHO_MCP_URL || env.ZOHO_MCP_ENV) {
      throw new Error('profile mode requires its isolated protected env file');
    }
    trustedRoot = path.resolve(resolveConfigHome(env), 'mail-for-zoho', 'profiles');
    envFile = resolveProfileEnvPath(env, profile);
  } else {
    if (env.ZOHO_MCP_URL) return validateEndpoint(env.ZOHO_MCP_URL);
    const configHome = resolveConfigHome(env);
    envFile = env.ZOHO_MCP_ENV || path.join(configHome, 'mail-for-zoho', 'env');
  }

  if (!envFile) throw new Error('ZOHO_MCP_URL is unset and no protected config path can be resolved');
  const values = parseProtectedEnv(await readProtectedEnvFile(envFile, { trustedRoot }));
  if (!values.ZOHO_MCP_URL) throw new Error(`protected env file is missing ZOHO_MCP_URL: ${envFile}`);
  return validateEndpoint(values.ZOHO_MCP_URL);
}

export function resolveAuthDir(source, { profile = null } = {}) {
  const authRoot = path.join(resolveConfigHome(source), 'mail-for-zoho', 'mcp-auth');
  return profile === null ? authRoot : path.join(authRoot, validateProfile(profile));
}

export function buildChildEnv(source = process.env, { profile = null } = {}) {
  const env = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    if (source[key]) env[key] = source[key];
  }

  const nodeDir = path.dirname(process.execPath);
  const systemPath = process.platform === 'win32'
    ? [nodeDir, source.SYSTEMROOT && path.join(source.SYSTEMROOT, 'System32')].filter(Boolean)
    : [nodeDir, '/usr/local/bin', '/usr/bin', '/bin'];
  env.PATH = [...new Set(systemPath)].join(path.delimiter);
  env.NO_COLOR = '1';
  env.MCP_REMOTE_CONFIG_DIR = resolveAuthDir(source, { profile });
  env.npm_config_yes = 'true';
  env.npm_config_ignore_scripts = 'true';
  env.npm_config_audit = 'false';
  env.npm_config_fund = 'false';
  env.npm_config_update_notifier = 'false';
  env.npm_config_registry = 'https://registry.npmjs.org/';
  env.npm_config_userconfig = process.platform === 'win32' ? 'NUL' : '/dev/null';
  // Do not set npm_config_globalconfig to /dev/null when userconfig is also /dev/null;
  // Node 22 / npm 10+ panics with "double-loading config /dev/null as global".
  return env;
}

export function resolveNpxCli() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    '/usr/share/nodejs/npm/bin/npx-cli.js',
    '/usr/lib/node_modules/npm/bin/npx-cli.js',
    '/usr/local/lib/node_modules/npm/bin/npx-cli.js',
  ];
  const candidate = candidates.find((item) => existsSync(item));
  if (!candidate) {
    throw new Error('npx-cli.js was not found next to a trusted Node.js/npm install');
  }
  return candidate;
}

// Spawn Node directly with npx-cli.js. Never spawn npx.cmd: Windows routes .cmd
// through cmd.exe even with shell:false (CVE-2024-27980 class).
export function bridgeInvocation(endpoint, { filterTools = false } = {}) {
  return {
    command: process.execPath,
    args: [resolveNpxCli(), ...bridgeArgs(endpoint, { filterTools })],
  };
}

export function bridgeArgs(endpoint, { filterTools = false } = {}) {
  const args = ['--yes', MCP_REMOTE_SPEC, endpoint, '--transport', 'http-only'];
  if (filterTools) {
    for (const pattern of BLOCKED_TOOL_PATTERNS) args.push('--ignore-tool', pattern);
  }
  return args;
}

export function redactSensitive(value, endpoints = []) {
  if (!Array.isArray(endpoints)) {
    throw new Error('redactSensitive requires an endpoints array');
  }
  let text = String(value ?? '');
  const secrets = new Set();

  for (const endpoint of endpoints.filter(Boolean)) {
    secrets.add(endpoint);
    secrets.add(encodeURI(endpoint));
    secrets.add(encodeURIComponent(endpoint));
    try {
      const parsed = new URL(endpoint);
      secrets.add(parsed.host);
      secrets.add(parsed.hostname);
      secrets.add(parsed.origin);
      if (parsed.pathname && parsed.pathname !== '/') {
        secrets.add(parsed.pathname);
        for (const segment of parsed.pathname.split('/').filter(Boolean)) {
          if (segment.length >= 8) secrets.add(segment);
        }
      }
      for (const item of parsed.searchParams.values()) {
        secrets.add(item);
        secrets.add(encodeURIComponent(item));
      }
    } catch {
      // Endpoint validation happens before this helper is used.
    }
  }

  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    text = text.replaceAll(secret, '[REDACTED]');
  }
  return text.replace(/https:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]');
}

// Retain more than the worst-case length of any single redacted secret variant
// (encodeURIComponent of a max-length endpoint is < 3x its length) so a secret
// can never be split across a retain/overflow boundary and escape redaction.
export const STDERR_RETAIN_BYTES = MAX_ENDPOINT_LENGTH * 8;

/** Redact then retain: used by CI verifiers that buffer stderr for reports. */
export function appendRedactedStderr(current, incoming, endpoints, retainBytes = STDERR_RETAIN_BYTES) {
  if (!Array.isArray(endpoints)) {
    throw new Error('appendRedactedStderr requires an endpoints array');
  }
  let next = String(current ?? '') + redactSensitive(String(incoming ?? ''), endpoints);
  if (next.length > retainBytes) next = next.slice(-retainBytes);
  return next;
}

/** Stream-through line redactor: used by the local MCP launcher. */
export function relayRedactedStderr(stream, endpoints, write = (value) => process.stderr.write(value)) {
  if (!Array.isArray(endpoints)) {
    throw new Error('relayRedactedStderr requires an endpoints array');
  }
  let pending = '';

  const flushLines = () => {
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) write(`${redactSensitive(line, endpoints)}\n`);
  };

  stream.on('data', (chunk) => {
    pending += chunk.toString('utf8');
    flushLines();
    if (pending.length > STDERR_RETAIN_BYTES * 2) {
      const safePrefixLength = pending.length - STDERR_RETAIN_BYTES;
      write(redactSensitive(pending.slice(0, safePrefixLength), endpoints));
      pending = pending.slice(safePrefixLength);
    }
  });

  const flush = () => {
    if (!pending) return;
    write(redactSensitive(pending, endpoints));
    pending = '';
  };
  stream.on('end', flush);
  stream.on('close', flush);
  return flush;
}
