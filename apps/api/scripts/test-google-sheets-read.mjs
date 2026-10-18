import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { readTestOpportunity } from './google-sheets-reader.mjs';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), override: false });
try {
  const result = await readTestOpportunity();
  console.log(JSON.stringify(result, null, 2));
  if (!result.found) process.exitCode = 2;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
