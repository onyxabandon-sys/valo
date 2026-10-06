import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

const selectedEnvFile = process.env.APP_ENV_FILE?.trim();
const envFiles = selectedEnvFile ? [selectedEnvFile] : ['.env', '.env.local'];

for (const envFile of envFiles) {
  const envPath = path.join(process.cwd(), envFile);
  if (existsSync(envPath)) {
    config({ path: envPath, override: true });
  }
}
