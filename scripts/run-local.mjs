#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { readProductIdentity } from './product-identity.mjs';
import {
  bridgeInvocation,
  buildChildEnv,
  MCP_REMOTE_SPEC,
  parseLauncherArgs,
  redactSensitive,
  relayRedactedStderr,
  resolveEndpoint,
} from './runtime-security.mjs';

export async function launchLocal({
  argv = process.argv.slice(2),
  env = process.env,
  spawnImpl = spawn,
  bridgeResolver = bridgeInvocation,
} = {}) {
  const { profile } = parseLauncherArgs(argv);
  const endpoint = await resolveEndpoint(env, { profile });
  const { command, args } = bridgeResolver(endpoint, { filterTools: true });
  const childEnv = buildChildEnv(env, { profile });
  const child = spawnImpl(
    command,
    args,
    {
      // stdout stays the MCP JSON-RPC channel and is passed through raw.
      // Endpoint leakage there is an accepted protocol-channel risk; stderr is redacted.
      stdio: ['inherit', 'inherit', 'pipe'],
      env: childEnv,
      shell: false,
      windowsHide: true,
    },
  );
  const flushStderr = child.stderr
    ? relayRedactedStderr(child.stderr, [endpoint])
    : () => {};
  return { child, endpoint, profile, childEnv, flushStderr };
}

async function main() {
  if (process.argv[2] === '--version' && process.argv.length === 3) {
    process.stdout.write(`${JSON.stringify(readProductIdentity())}\n`);
    return;
  }

  let runtime;
  try {
    runtime = await launchLocal();
  } catch (error) {
    console.error(redactSensitive(error?.message || error, []));
    process.exitCode = 2;
    return;
  }

  const { child, endpoint, flushStderr } = runtime;
  let finished = false;
  const finish = (code) => {
    if (finished) return;
    finished = true;
    flushStderr();
    process.exitCode = code;
  };

  child.on('error', (error) => {
    console.error(`failed to start ${MCP_REMOTE_SPEC}: ${redactSensitive(error.message, [endpoint])}`);
    finish(1);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`${MCP_REMOTE_SPEC} exited after signal ${signal}`);
      finish(1);
      return;
    }
    finish(code ?? 1);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
