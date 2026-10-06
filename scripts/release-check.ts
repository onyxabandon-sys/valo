import './loadEnv';
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

function main() {
  const missing = requiredEnv.filter(name => !process.env[name] || process.env[name] === 'replace_me');
  assert.equal(missing.length, 0, `Missing required env vars: ${missing.join(', ')}`);

  const keystoreExample = path.join(process.cwd(), 'android', 'keystore.properties.example');
  const androidGradle = path.join(process.cwd(), 'android', 'app', 'build.gradle');
  const appConfig = JSON.parse(readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as { expo?: { android?: { package?: string } } };
  const androidPackage = appConfig.expo?.android?.package;
  assert.ok(androidPackage, 'app.json must define the Android package used by native sources');
  const sunmiModule = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'java', ...androidPackage.split('.'), 'sunmi', 'SunmiBridgeModule.kt');
  const convexSchema = path.join(process.cwd(), 'convex', 'schema.ts');

  assert.equal(existsSync(keystoreExample), true, 'Missing android/keystore.properties.example');
  assert.equal(existsSync(androidGradle), true, 'Missing android/app/build.gradle');
  assert.equal(existsSync(sunmiModule), true, 'Missing Sunmi bridge module');
  assert.equal(existsSync(convexSchema), true, 'Missing Convex schema');

  console.log('Release checks passed');
}

main();
