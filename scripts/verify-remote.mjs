#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  appendRedactedStderr,
  bridgeInvocation,
  buildChildEnv,
  FORBIDDEN_TOOL_PATTERN,
  MCP_REMOTE_SPEC,
  parseLauncherArgs,
  redactSensitive,
  resolveEndpoint,
} from './runtime-security.mjs';

export async function buildVerifierInvocation({
  argv = process.argv.slice(2),
  env = process.env,
  bridgeResolver = bridgeInvocation,
} = {}) {
  const { profile } = parseLauncherArgs(argv);
  const endpoint = await resolveEndpoint(env, { profile });
  // Unfiltered: the verifier must see the raw upstream tool surface.
  const { command, args } = bridgeResolver(endpoint);
  const childEnv = buildChildEnv(env, { profile });
  return { profile, endpoint, command, args, childEnv };
}

async function main() {
  const timeoutMs = Number(process.env.ZOHO_MCP_VERIFY_TIMEOUT_MS || 45_000);

  let invocation;
  try {
    invocation = await buildVerifierInvocation();
  } catch (error) {
    console.error(redactSensitive(error?.message || error, []));
    process.exit(2);
  }

  const { endpoint, command, args, childEnv } = invocation;
  const requiredTools = new Set([
    'ZohoMail_getMailAccounts',
    'ZohoMail_getAllFolders',
    'ZohoMail_listEmails',
    'ZohoMail_SearchEmails',
    'ZohoMail_getMessageDetails',
    'ZohoMail_getMessageContent',
  ]);
  const secrets = [endpoint];

  const child = spawn(
    command,
    args,
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
      shell: false,
      windowsHide: true,
    },
  );

  let buffer = '';
  let stderr = '';
  let finished = false;
  const pending = new Map();

  function stop(code, message) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    child.kill('SIGTERM');
    if (message) (code === 0 ? console.log : console.error)(message);
    process.exitCode = code;
  }

  function request(id, method, params = {}) {
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    child.stdin.write(`${payload}\n`);
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function notify(method, params = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  child.stderr.on('data', (chunk) => {
    stderr = appendRedactedStderr(stderr, chunk.toString('utf8'), secrets);
  });

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (message.id !== undefined && pending.has(message.id)) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      }
    }
  });

  child.on('error', (error) => stop(1, `failed to start ${MCP_REMOTE_SPEC}: ${redactSensitive(error.message, secrets)}`));
  child.on('exit', (code) => {
    if (!finished && code !== 0) {
      stop(1, `${MCP_REMOTE_SPEC} exited with code ${code}: ${stderr.trim()}`);
    }
  });

  const timer = setTimeout(() => {
    stop(1, `remote verification timed out after ${timeoutMs}ms${stderr ? `: ${stderr.trim()}` : ''}`);
  }, timeoutMs);

  try {
    const initialized = await request(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'mail-for-zoho-verifier', version: '0.2.0' },
    });
    notify('notifications/initialized');

    const listed = await request(2, 'tools/list');
    const tools = Array.isArray(listed?.tools) ? listed.tools : [];
    const names = tools.map((tool) => tool.name).filter(Boolean).sort();
    const missing = [...requiredTools].filter((name) => !names.includes(name));
    const forbidden = names.filter((name) => FORBIDDEN_TOOL_PATTERN.test(name));

    if (missing.length || forbidden.length) {
      stop(1, JSON.stringify({
        ok: false,
        protocolVersion: initialized?.protocolVersion || null,
        toolCount: names.length,
        missingRequiredTools: missing,
        forbiddenTools: forbidden,
      }, null, 2));
    } else {
      stop(0, JSON.stringify({
        ok: true,
        protocolVersion: initialized?.protocolVersion || null,
        server: initialized?.serverInfo || null,
        toolCount: names.length,
        requiredToolsPresent: [...requiredTools].sort(),
        forbiddenTools: [],
      }, null, 2));
    }
  } catch (error) {
    const safeMessage = redactSensitive(error?.message || error, secrets);
    stop(1, `remote verification failed: ${safeMessage}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
