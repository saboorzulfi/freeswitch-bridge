import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const rootDir = path.resolve(process.cwd());
dotenv.config({ path: path.join(rootDir, '.env') });

function readJson(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

const defaultConfig = readJson(path.join(rootDir, 'config', 'default.json'));

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  esl: {
    host: process.env.ESL_HOST || defaultConfig.esl?.host || '127.0.0.1',
    port: numberFromEnv('ESL_PORT', defaultConfig.esl?.port ?? 8021),
    password: process.env.ESL_PASSWORD || defaultConfig.esl?.password || 'ClueCon',
  },
  dialer: {
    maxRounds: numberFromEnv('MAX_ROUNDS', defaultConfig.dialer?.maxRounds ?? 1),
    agentRingSeconds: numberFromEnv('AGENT_RING_SECONDS', defaultConfig.dialer?.agentRingSeconds ?? 20),
    leadRingSeconds: numberFromEnv('LEAD_RING_SECONDS', defaultConfig.dialer?.leadRingSeconds ?? 25),
    // Hardcoded dialing prefixes per request
    agentPrefix: 'sofia/gateway/didlogic/',
    leadPrefix: 'sofia/gateway/didlogic/',
    // For reference: DID used for inbound (not used directly in code yet)
    didNumber: '442039960029',
  },
  logging: {
    level: process.env.LOG_LEVEL || defaultConfig.logging?.level || 'info',
  },
  mongo: {
    uri: (() => {
      if (process.env.MONGO_URI) return process.env.MONGO_URI;
      const host = process.env.MONGO_HOST;
      const user = process.env.MONGO_USER;
      const pass = process.env.MONGO_PASSWORD;
      const dbn = process.env.MONGO_DBNAME || process.env.MONGO_DB;
      if (host && user && pass && dbn) {
        return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${dbn}?retryWrites=true&w=majority`;
      }
      return defaultConfig.mongo?.uri || 'mongodb://localhost:27017';
    })(),
    db: process.env.MONGO_DB || process.env.MONGO_DBNAME || defaultConfig.mongo?.db || 'fs_preview_dialer',
  },
  // SIP trunk details for reference/config (FreeSWITCH gateway should be named 'didlogic')
  siptrunk: {
    gatewayName: 'didlogic',
    ip: 'sip.uk.didlogic.net',
    username: 'spotcall',
    password: 'AU7183GHAh',
    network: {
      externalSipIp: '172.31.46.80',
      externalRtpIp: '172.31.46.80',
    }
  },
};

export default config;

