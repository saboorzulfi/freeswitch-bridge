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

export function originateLeg(con, destination, vars = {}) {
  const varString = buildVarString(vars);
  const cmd = `originate ${varString}${destination}`;
  logger.debug({ cmd }, 'BGAPI originate');
  return new Promise((resolve) => {
    con.bgapi(cmd, (res) => {
      resolve(res.getBody());
    });
  });
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
    let resolved = false;

    const cleanup = () => {
      con.removeListener('esl::event::CHANNEL_ANSWER::*', onAnswer);
      con.removeListener('esl::event::CHANNEL_PARK::*', onPark);
    };

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(false);
    }, timeoutMs);

    function markAnswered() {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanup();
      resolve(true);
    }

    function onAnswer(evt) {
      const chanUuid = evt.getHeader('Unique-ID');
      if (chanUuid === uuid) {
        logger.debug({ uuid: chanUuid }, 'CHANNEL_ANSWER received');
        markAnswered();
      }
    }

    function onPark(evt) {
      const chanUuid = evt.getHeader('Unique-ID');
      if (chanUuid === uuid) {
        logger.debug({ uuid: chanUuid }, 'CHANNEL_PARK received');
        // Channels originated with &park often emit CHANNEL_PARK right after answer
        markAnswered();
      }
    }

    con.on('esl::event::CHANNEL_ANSWER::*', onAnswer);
    con.on('esl::event::CHANNEL_PARK::*', onPark);
  });
}

