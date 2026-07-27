import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  chmod,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { launchLocal } from '../scripts/run-local.mjs';
import { buildVerifierInvocation } from '../scripts/verify-remote.mjs';
import {
  appendRedactedStderr,
  BLOCKED_TOOL_PATTERNS,
  bridgeArgs,
  bridgeInvocation,
  buildChildEnv,
  FORBIDDEN_TOOL_KEYWORDS,
  FORBIDDEN_TOOL_PATTERN,
  MAX_ENDPOINT_LENGTH,
  MCP_REMOTE_SPEC,
  parseLauncherArgs,
  parseProtectedEnv,
  redactSensitive,
  relayRedactedStderr,
  resolveAuthDir,
  resolveEndpoint,
  resolveNpxCli,
  resolveProfileEnvPath,
  STDERR_RETAIN_BYTES,
  validateEndpoint,
  validateProfile,
} from '../scripts/runtime-security.mjs';

const WORK_ENDPOINT = 'https://work.mcp.example.test/connect?key=work-secret';
const PERSONAL_ENDPOINT = 'https://personal.mcp.example.test/connect?key=personal-secret';

async function withTempHome(run) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'mail-for-zoho-'));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function writeProtected(file, endpoint) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `ZOHO_MCP_URL=${endpoint}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

function mockChild() {
  const child = new EventEmitter();
  child.stderr = new PassThrough();
  child.kill = () => true;
  return child;
}

test('bridge package and blocked tool patterns stay fixed', () => {
  assert.equal(MCP_REMOTE_SPEC, 'mcp-remote@0.1.37');
  const args = bridgeArgs(WORK_ENDPOINT, { filterTools: true });
  for (const pattern of BLOCKED_TOOL_PATTERNS) {
    assert.ok(args.some((value, index) => value === '--ignore-tool' && args[index + 1] === pattern));
  }
  assert.equal(bridgeArgs(WORK_ENDPOINT).includes('--ignore-tool'), false);
});

test('blocked patterns and the forbidden regex derive from one keyword source', () => {
  assert.deepEqual(BLOCKED_TOOL_PATTERNS, FORBIDDEN_TOOL_KEYWORDS.map((word) => `*${word}*`));
  for (const keyword of ['send', 'delete', 'delegate', 'admin', 'security']) {
    assert.ok(FORBIDDEN_TOOL_KEYWORDS.includes(keyword));
    assert.match(`ZohoMail_${keyword}Something`, FORBIDDEN_TOOL_PATTERN);
  }
  for (const approved of [
    'ZohoMail_getMailAccounts',
    'ZohoMail_getAllFolders',
    'ZohoMail_listEmails',
    'ZohoMail_SearchEmails',
    'ZohoMail_getMessageDetails',
    'ZohoMail_getMessageContent',
    'ZohoMail_getOriginalMessage',
    'ZohoMail_getMessageAttachmentInfo',
    'ZohoMail_getAccountDetails',
    'ZohoMail_readMessages',
    'ZohoMail_flagMessages',
  ]) {
    assert.doesNotMatch(approved, FORBIDDEN_TOOL_PATTERN);
  }
});

test('profile parser accepts strict lowercase slugs', () => {
  for (const profile of ['work', 'personal', 'work-2', 'a']) {
    assert.equal(validateProfile(profile), profile);
    assert.deepEqual(parseLauncherArgs(['--profile', profile]), { profile });
  }
  assert.deepEqual(parseLauncherArgs([]), { profile: null });
});

test('profile parser rejects traversal, separators, whitespace, controls, and extra args', () => {
  for (const profile of [
    '',
    '.',
    '..',
    '../work',
    'work/personal',
    'work\\personal',
    'Work',
    'work_personal',
    'work personal',
    'work--personal',
    '-work',
    'work-',
    'work\npersonal',
    'a'.repeat(64),
  ]) {
    assert.throws(() => validateProfile(profile), /profile/);
  }
  assert.throws(() => parseLauncherArgs(['--profile']), /usage/);
  assert.throws(() => parseLauncherArgs(['--unknown', 'work']), /usage/);
  assert.throws(() => parseLauncherArgs(['--profile', 'work', 'extra']), /usage/);
});

test('protected env parser accepts only one unquoted endpoint', () => {
  assert.deepEqual(parseProtectedEnv(`# comment\nZOHO_MCP_URL=${WORK_ENDPOINT}\n`), {
    ZOHO_MCP_URL: WORK_ENDPOINT,
  });
  assert.deepEqual(
    parseProtectedEnv(`MCP_REMOTE_VERSION=0.1.37\nZOHO_MCP_URL=${WORK_ENDPOINT}\n`),
    { ZOHO_MCP_URL: WORK_ENDPOINT },
  );
  assert.throws(() => parseProtectedEnv('UNSUPPORTED_KEY=value\n'), /unsupported protected env key/);
  assert.throws(() => parseProtectedEnv(`ZOHO_MCP_URL="${WORK_ENDPOINT}"\n`), /unquoted URL/);
  assert.throws(
    () => parseProtectedEnv(`ZOHO_MCP_URL=${WORK_ENDPOINT}\nZOHO_MCP_URL=${PERSONAL_ENDPOINT}\n`),
    /duplicate/,
  );
});

test('endpoint validation requires HTTPS and rejects credentials and fragments', () => {
  assert.equal(validateEndpoint(WORK_ENDPOINT), WORK_ENDPOINT);
  assert.throws(() => validateEndpoint('http://mcp.example.test'), /HTTPS/);
  assert.throws(() => validateEndpoint('https://user:pass@mcp.example.test'), /userinfo/);
  assert.throws(() => validateEndpoint('https://mcp.example.test/#fragment'), /fragment/);
});

test('default endpoint behavior remains environment then ~/.config/mail-for-zoho/env', async () => {
  assert.equal(await resolveEndpoint({ ZOHO_MCP_URL: WORK_ENDPOINT }), WORK_ENDPOINT);
  await withTempHome(async (home) => {
    const defaultFile = path.join(home, '.config', 'mail-for-zoho', 'env');
    await writeProtected(defaultFile, PERSONAL_ENDPOINT);
    assert.equal(await resolveEndpoint({ HOME: home }), PERSONAL_ENDPOINT);
  });
});

test('legacy default env file with an MCP_REMOTE_VERSION line still resolves', async () => {
  await withTempHome(async (home) => {
    const defaultFile = path.join(home, '.config', 'mail-for-zoho', 'env');
    await mkdir(path.dirname(defaultFile), { recursive: true });
    await writeFile(defaultFile, `MCP_REMOTE_VERSION=0.1.37\nZOHO_MCP_URL=${WORK_ENDPOINT}\n`, { mode: 0o600 });
    await chmod(defaultFile, 0o600);
    assert.equal(await resolveEndpoint({ HOME: home }), WORK_ENDPOINT);
  });
});

test('profiles resolve independent protected files and reject global endpoint overrides', async () => {
  await withTempHome(async (home) => {
    const env = { HOME: home };
    const workFile = resolveProfileEnvPath(env, 'work');
    const personalFile = resolveProfileEnvPath(env, 'personal');
    await writeProtected(workFile, WORK_ENDPOINT);
    await writeProtected(personalFile, PERSONAL_ENDPOINT);

    assert.notEqual(workFile, personalFile);
    assert.equal(await resolveEndpoint(env, { profile: 'work' }), WORK_ENDPOINT);
    assert.equal(await resolveEndpoint(env, { profile: 'personal' }), PERSONAL_ENDPOINT);
    await assert.rejects(
      resolveEndpoint({ ...env, ZOHO_MCP_URL: WORK_ENDPOINT }, { profile: 'work' }),
      /isolated protected env file/,
    );
    await assert.rejects(
      resolveEndpoint({ ...env, ZOHO_MCP_ENV: workFile }, { profile: 'work' }),
      /isolated protected env file/,
    );
  });
});

test(
  'protected env files must be regular, non-symlinked, and mode 0600',
  { skip: process.platform === 'win32' },
  async () => {
    await withTempHome(async (home) => {
      const env = { HOME: home };
      const envFile = resolveProfileEnvPath(env, 'work');
      await writeProtected(envFile, WORK_ENDPOINT);
      await chmod(envFile, 0o644);
      await assert.rejects(resolveEndpoint(env, { profile: 'work' }), /0600/);

      await rm(envFile);
      await mkdir(envFile);
      await assert.rejects(resolveEndpoint(env, { profile: 'work' }), /regular file/);

      await rm(envFile, { recursive: true });
      const target = path.join(home, 'real-env');
      await writeProtected(target, WORK_ENDPOINT);
      await symlink(target, envFile);
      await assert.rejects(resolveEndpoint(env, { profile: 'work' }), /symlink/);

      await rm(envFile);
      const profileDir = path.dirname(envFile);
      await rm(profileDir, { recursive: true, force: true });
      const attackerDir = path.join(home, 'attacker-profile');
      await mkdir(attackerDir, { recursive: true });
      await writeProtected(path.join(attackerDir, 'env'), WORK_ENDPOINT);
      await mkdir(path.dirname(profileDir), { recursive: true });
      await symlink(attackerDir, profileDir);
      await assert.rejects(resolveEndpoint(env, { profile: 'work' }), /symlink/);
    });
  },
);

test('child environments isolate auth directories and exclude unrelated secrets', () => {
  const source = {
    HOME: '/tmp/mail-home',
    PATH: '/tmp/attacker-bin',
    ZOHO_MCP_URL: WORK_ENDPOINT,
    GITHUB_TOKEN: 'not-in-child',
    NODE_OPTIONS: '--require=/tmp/evil.js',
    NODE_EXTRA_CA_CERTS: '/tmp/evil-ca.pem',
    SSL_CERT_FILE: '/tmp/evil-ca.pem',
    HTTPS_PROXY: 'https://proxy.example.test',
    BROWSER: '/tmp/browser',
  };
  const defaultEnv = buildChildEnv(source);
  const workEnv = buildChildEnv(source, { profile: 'work' });
  const personalEnv = buildChildEnv(source, { profile: 'personal' });

  assert.equal(defaultEnv.MCP_REMOTE_CONFIG_DIR, resolveAuthDir(source));
  assert.notEqual(workEnv.MCP_REMOTE_CONFIG_DIR, personalEnv.MCP_REMOTE_CONFIG_DIR);
  assert.match(workEnv.MCP_REMOTE_CONFIG_DIR, /mcp-auth[\\/]work$/);
  assert.match(personalEnv.MCP_REMOTE_CONFIG_DIR, /mcp-auth[\\/]personal$/);
  assert.ok(workEnv.PATH.split(path.delimiter).includes(path.dirname(process.execPath)));
  assert.equal(workEnv.PATH.includes('/tmp/attacker-bin'), false);
  for (const key of [
    'ZOHO_MCP_URL',
    'GITHUB_TOKEN',
    'NODE_OPTIONS',
    'NODE_EXTRA_CA_CERTS',
    'SSL_CERT_FILE',
    'HTTPS_PROXY',
    'BROWSER',
  ]) {
    assert.equal(workEnv[key], undefined);
  }
  assert.equal(workEnv.npm_config_ignore_scripts, 'true');
});

test('bridge spawns Node with npx-cli.js instead of npx.cmd', () => {
  const cli = resolveNpxCli();
  assert.match(path.basename(cli), /^npx-cli\.js$/);
  const invocation = bridgeInvocation(WORK_ENDPOINT, { filterTools: true });
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[0], cli);
  assert.ok(invocation.args.includes(WORK_ENDPOINT));
  assert.ok(invocation.args.includes('--ignore-tool'));
});

test('redaction removes both endpoints and encoded secret variants', () => {
  const output = redactSensitive(
    `getaddrinfo ENOTFOUND work.mcp.example.test Connecting to ${WORK_ENDPOINT} ${PERSONAL_ENDPOINT} work-secret personal-secret`,
    [WORK_ENDPOINT, PERSONAL_ENDPOINT],
  );
  assert.doesNotMatch(output, /work-secret|personal-secret|work\.mcp\.example|personal\.mcp\.example/);
  assert.throws(() => redactSensitive('x', WORK_ENDPOINT), /endpoints array/);
});

test('stderr relay redacts an endpoint split across chunks', async () => {
  const stream = new PassThrough();
  let output = '';
  relayRedactedStderr(stream, [WORK_ENDPOINT], (value) => {
    output += value;
  });
  const midpoint = Math.floor(WORK_ENDPOINT.length / 2);
  stream.write(`failure: ${WORK_ENDPOINT.slice(0, midpoint)}`);
  stream.end(`${WORK_ENDPOINT.slice(midpoint)}\n`);
  await new Promise((resolve) => stream.on('close', resolve));
  assert.doesNotMatch(output, /work-secret|work\.mcp\.example/);
  assert.match(output, /REDACTED/);
});

test('stderr relay redacts encoded secrets across the overflow flush boundary', async () => {
  const prefix = 'https://overflow.mcp.example.test/connect?token=';
  const endpoint = `${prefix}${'%'.repeat(MAX_ENDPOINT_LENGTH - prefix.length)}`;
  validateEndpoint(endpoint);
  const encoded = encodeURIComponent(endpoint);
  // Worst-case encoded secret must stay within the retained stderr tail.
  assert.ok(encoded.length > 8_192);
  assert.ok(encoded.length < MAX_ENDPOINT_LENGTH * 8);

  const stream = new PassThrough();
  let output = '';
  let writes = 0;
  relayRedactedStderr(stream, [endpoint], (value) => {
    writes += 1;
    output += value;
  });

  // Force the overflow path while leaving the encoded secret entirely inside
  // the retained tail (larger than any single secret variant).
  stream.write(`${'x'.repeat(70_000)}${encoded}`);
  stream.end('\n');
  await new Promise((resolve) => stream.on('close', resolve));

  assert.ok(writes >= 2);
  assert.doesNotMatch(output, /overflow\.mcp\.example|%25%25%25%25%25/);
  assert.match(output, /REDACTED/);
});

test('mocked default launcher preserves direct single-account configuration', async () => {
  const calls = [];
  const child = mockChild();
  const runtime = await launchLocal({
    argv: [],
    env: { HOME: '/tmp/mail-home', ZOHO_MCP_URL: WORK_ENDPOINT },
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    },
    bridgeResolver: (endpoint, opts) => ({
      command: process.execPath,
      args: ['/safe/npx-cli.js', ...bridgeArgs(endpoint, opts)],
    }),
  });

  assert.equal(runtime.profile, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.equal(calls[0].args[0], '/safe/npx-cli.js');
  assert.equal(calls[0].args.includes(WORK_ENDPOINT), true);
  assert.equal(calls[0].args.includes('--ignore-tool'), true);
  for (const pattern of BLOCKED_TOOL_PATTERNS) {
    assert.ok(calls[0].args.some((value, index) => value === '--ignore-tool' && calls[0].args[index + 1] === pattern));
  }
  assert.equal(
    calls[0].options.env.MCP_REMOTE_CONFIG_DIR,
    path.join('/tmp/mail-home', '.config', 'mail-for-zoho', 'mcp-auth'),
  );
  child.stderr.end();
});

test('verifier invocation stays unfiltered and profile-aware', async () => {
  await withTempHome(async (home) => {
    const env = { HOME: home };
    await writeProtected(resolveProfileEnvPath(env, 'work'), WORK_ENDPOINT);

    const defaultInvocation = await buildVerifierInvocation({
      argv: [],
      env: { HOME: home, ZOHO_MCP_URL: WORK_ENDPOINT },
      bridgeResolver: (endpoint, opts) => ({
        command: process.execPath,
        args: ['/safe/npx-cli.js', ...bridgeArgs(endpoint, opts)],
      }),
    });
    assert.equal(defaultInvocation.profile, null);
    assert.equal(defaultInvocation.args.includes('--ignore-tool'), false);
    assert.equal(defaultInvocation.args.includes(WORK_ENDPOINT), true);
    assert.equal(defaultInvocation.args.includes(MCP_REMOTE_SPEC), true);

    const profileInvocation = await buildVerifierInvocation({
      argv: ['--profile', 'work'],
      env,
      bridgeResolver: (endpoint, opts) => ({
        command: process.execPath,
        args: ['/safe/npx-cli.js', ...bridgeArgs(endpoint, opts)],
      }),
    });
    assert.equal(profileInvocation.profile, 'work');
    assert.equal(profileInvocation.args.includes('--ignore-tool'), false);
    assert.equal(profileInvocation.endpoint, WORK_ENDPOINT);
    assert.equal(
      profileInvocation.childEnv.MCP_REMOTE_CONFIG_DIR,
      resolveAuthDir(env, { profile: 'work' }),
    );
  });
});

test('appendRedactedStderr redacts before truncating across the retain boundary', () => {
  const endpoint = `https://overflow.mcp.example.test/${'z'.repeat(64)}?key=${'%'.repeat(32)}`;
  const encoded = encodeURIComponent(endpoint);
  assert.ok(encoded.length < STDERR_RETAIN_BYTES);

  let stderr = '';
  stderr = appendRedactedStderr(stderr, `${'x'.repeat(STDERR_RETAIN_BYTES)}${encoded}`, [endpoint]);
  assert.doesNotMatch(stderr, /overflow\.mcp\.example|%25%25%25%25%25/);
  assert.match(stderr, /REDACTED/);
});

test('mocked two-profile launches use separate endpoints and auth directories', async () => {
  await withTempHome(async (home) => {
    const env = { HOME: home };
    await writeProtected(resolveProfileEnvPath(env, 'work'), WORK_ENDPOINT);
    await writeProtected(resolveProfileEnvPath(env, 'personal'), PERSONAL_ENDPOINT);
    const calls = [];
    const spawnImpl = (command, args, options) => {
      calls.push({ command, args, options });
      return mockChild();
    };

    const work = await launchLocal({
      argv: ['--profile', 'work'],
      env,
      spawnImpl,
      bridgeResolver: (endpoint, opts) => ({
        command: process.execPath,
        args: ['/safe/npx-cli.js', ...bridgeArgs(endpoint, opts)],
      }),
    });
    const personal = await launchLocal({
      argv: ['--profile', 'personal'],
      env,
      spawnImpl,
      bridgeResolver: (endpoint, opts) => ({
        command: process.execPath,
        args: ['/safe/npx-cli.js', ...bridgeArgs(endpoint, opts)],
      }),
    });

    assert.equal(calls[0].args.includes(WORK_ENDPOINT), true);
    assert.equal(calls[1].args.includes(PERSONAL_ENDPOINT), true);
    assert.equal(calls[0].args.includes('--ignore-tool'), true);
    assert.equal(calls[1].args.includes('--ignore-tool'), true);
    assert.notEqual(
      calls[0].options.env.MCP_REMOTE_CONFIG_DIR,
      calls[1].options.env.MCP_REMOTE_CONFIG_DIR,
    );
    assert.equal(calls[0].options.shell, false);
    assert.equal(work.profile, 'work');
    assert.equal(personal.profile, 'personal');
    work.child.stderr.end();
    personal.child.stderr.end();
  });
});
