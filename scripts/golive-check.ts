import './loadEnv';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const requiredEnv = [
  'APP_NAME',
  'CONVEX_URL',
  'CONVEX_SITE_URL',
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
  const appConfig = JSON.parse(readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as { expo?: { android?: { package?: string } } };
  const androidPackage = appConfig.expo?.android?.package;
  assert.ok(androidPackage, 'app.json must define the Android package used by native sources');
  const packagePath = androidPackage.split('.');
  const sunmiModule = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'java', ...packagePath, 'sunmi', 'SunmiBridgeModule.kt');
  const convexSchema = path.join(process.cwd(), 'convex', 'schema.ts');
  const authConfig = path.join(process.cwd(), 'convex', 'auth.config.ts');
  const appEntry = path.join(process.cwd(), 'App.tsx');
  const usersModule = path.join(process.cwd(), 'convex', 'users.ts');
  const manifest = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  const mainApplication = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'java', ...packagePath, 'MainApplication.kt');

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

  const blockers: string[] = [];
  const androidBuildContent = readFileSync(androidBuild, 'utf8');
  const sunmiContent = readFileSync(sunmiModule, 'utf8');
  const appContent = readFileSync(appEntry, 'utf8');
  const usersContent = readFileSync(usersModule, 'utf8');
  const manifestContent = readFileSync(manifest, 'utf8');
  const mainApplicationContent = readFileSync(mainApplication, 'utf8');

  if (!existsSync(authConfig)) blockers.push('Convex authentication configuration is missing.');
  if (!appContent.includes('ConvexBetterAuthProvider')) blockers.push('The app does not send authenticated identity tokens to Convex.');
  if (usersContent.includes('getUserByEmail') || usersContent.includes('passwordHash: v.string()')) blockers.push('Public password-based user lookup remains in Convex.');
  if (!androidBuildContent.includes('com.sunmi:printerlibrary:')) blockers.push('The official SUNMI printer library is not linked.');
  if (sunmiContent.includes('SUNMI_PRINTER_NOT_CONFIGURED')) blockers.push('The SUNMI native bridge is still a non-printing stub.');
  if (/usesCleartextTraffic\s*=\s*["']true["']/.test(manifestContent)) blockers.push('Android cleartext network traffic is enabled.');
  if (/getUseDeveloperSupport\(\)\s*=\s*true/.test(mainApplicationContent)) blockers.push('React Native developer support is forced on.');
  if (process.env.SUNMI_PRINT_ENABLED !== 'true') blockers.push('SUNMI_PRINT_ENABLED must be true for a device release.');
  if ((process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32) blockers.push('BETTER_AUTH_SECRET must contain at least 32 characters.');
  const retentionDays = Number(process.env.OFFLINE_QUEUE_RETENTION_DAYS);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 30) blockers.push('OFFLINE_QUEUE_RETENTION_DAYS must be an integer from 1 to 30.');
  try {
    const trackedEnv = execFileSync('git', ['ls-files', '--error-unmatch', '.env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (trackedEnv === '.env') blockers.push('.env is tracked by Git; remove it from version control and rotate exposed values.');
  } catch {
    // Expected: .env must not be tracked.
  }

  assert.equal(blockers.length, 0, `Production readiness failed:\n- ${blockers.join('\n- ')}`);

  console.log('Go-live checks passed');
}

main();
