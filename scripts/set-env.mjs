import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const rootDir = process.cwd();
const envPath = resolve(rootDir, '.env');
const targetDir = resolve(rootDir, 'src/environments');

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  const values = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    values[key] = val;
  }
  return values;
}

const fileEnv = parseEnvFile(envPath);
const getVar = (key) => fileEnv[key] ?? process.env[key] ?? '';

function buildEnvironmentContent(production) {
  const config = {
    production,
    firebase: {
      apiKey: getVar('FIREBASE_API_KEY'),
      authDomain: getVar('FIREBASE_AUTH_DOMAIN'),
      projectId: getVar('FIREBASE_PROJECT_ID'),
      storageBucket: getVar('FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: getVar('FIREBASE_MESSAGING_SENDER_ID'),
      appId: getVar('FIREBASE_APP_ID'),
      measurementId: getVar('FIREBASE_MEASUREMENT_ID'),
    },
    supabase: {
      url: getVar('SUPABASE_URL'),
      anonKey: getVar('SUPABASE_ANON_KEY'),
    },
  };

  return `export const environment = ${JSON.stringify(config, null, 2)};\n`;
}

mkdirSync(dirname(resolve(targetDir, 'environment.ts')), { recursive: true });
writeFileSync(resolve(targetDir, 'environment.ts'), buildEnvironmentContent(false), 'utf8');
writeFileSync(resolve(targetDir, 'environment.prod.ts'), buildEnvironmentContent(true), 'utf8');
