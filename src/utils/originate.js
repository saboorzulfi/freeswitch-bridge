import crypto from 'node:crypto';
import { logger } from '../core/logger.js';

export function generateUuid() {
  return crypto.randomUUID();
}

export function buildVarString(vars) {
  const parts = [];
  for (const [key, value] of Object.entries(vars || {})) {
    if (value === undefined || value === null) continue;
    parts.push(`${key}=${String(value)}`);
  }
  return parts.length ? `{${parts.join(',')}}` : '';
}

export function originateParked(con, destination, vars = {}) {
  const varString = buildVarString(vars);
  const cmd = `originate ${varString}${destination} &park`;
  logger.debug({ cmd }, 'BGAPI originate');
  return new Promise((resolve) => {
    con.bgapi(cmd, (res) => {
      resolve(res.getBody());
    });
  });
}

export function uuidBridge(con, aUuid, bUuid) {
  const cmd = `uuid_bridge ${aUuid} ${bUuid}`;
  logger.debug({ cmd }, 'BGAPI uuid_bridge');
  return new Promise((resolve) => {
    con.bgapi(cmd, (res) => resolve(res.getBody()));
  });
}

export function uuidKill(con, uuid) {
  const cmd = `uuid_kill ${uuid}`;
  logger.debug({ cmd }, 'BGAPI uuid_kill');
  return new Promise((resolve) => {
    con.bgapi(cmd, (res) => resolve(res.getBody()));
  });
}

export function waitForAnswer(con, uuid, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      con.removeListener('esl::event::CHANNEL_ANSWER::*', onAnswer);
      resolve(false);
    }, timeoutMs);

    function onAnswer(evt) {
      const chanUuid = evt.getHeader('Unique-ID');
      if (chanUuid === uuid) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        con.removeListener('esl::event::CHANNEL_ANSWER::*', onAnswer);
        resolve(true);
      }
    }

    con.on('esl::event::CHANNEL_ANSWER::*', onAnswer);
  });
}

