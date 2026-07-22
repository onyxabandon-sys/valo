import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const requiredEnv = [
  'APP_NAME',
  'CONVEX_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'SUNMI_PRINT_ENABLED',
  'OFFLINE_QUEUE_RETENTION_DAYS',
  'DEFAULT_LOCATION_NAME',
  'DEFAULT_LOCATION_ADDRESS',
];

function hasRequiredEnv() {
  return requiredEnv.every(name => Boolean(process.env[name]) && process.env[name] !== 'replace_me');
}

function main() {
  const envExample = path.join(process.cwd(), '.env.example');
  const envSetup = path.join(process.cwd(), 'ENV-SETUP.md');
  const goLive = path.join(process.cwd(), 'GO-LIVE.md');
  const releaseChecklist = path.join(process.cwd(), 'RELEASE-CHECKLIST.md');
  const keystoreExample = path.join(process.cwd(), 'android', 'keystore.properties.example');
  const androidBuild = path.join(process.cwd(), 'android', 'app', 'build.gradle');
  const sunmiModule = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'java', 'com', 'valetpos', 'sunmi', 'SunmiBridgeModule.kt');
  const convexSchema = path.join(process.cwd(), 'convex', 'schema.ts');

  assert.equal(existsSync(envExample), true, '.env.example is missing');
  assert.equal(existsSync(envSetup), true, 'ENV-SETUP.md is missing');
  assert.equal(existsSync(goLive), true, 'GO-LIVE.md is missing');
  assert.equal(existsSync(releaseChecklist), true, 'RELEASE-CHECKLIST.md is missing');
  assert.equal(existsSync(keystoreExample), true, 'android/keystore.properties.example is missing');
  assert.equal(existsSync(androidBuild), true, 'android/app/build.gradle is missing');
  assert.equal(existsSync(sunmiModule), true, 'Sunmi bridge module is missing');
  assert.equal(existsSync(convexSchema), true, 'Convex schema is missing');

  const envContent = readFileSync(envExample, 'utf8');
  const allEnvNamesPresent = requiredEnv.every(name => envContent.includes(`${name}=`));
  assert.equal(allEnvNamesPresent, true, 'Not all required env keys are listed in .env.example');

  assert.equal(hasRequiredEnv(), true, 'Required env vars are not set for the current session');

  console.log('Go-live checks passed');
}

main();
