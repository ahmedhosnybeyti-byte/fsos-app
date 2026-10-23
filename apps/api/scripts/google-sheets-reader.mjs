import { JWT } from 'google-auth-library';

export const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// Diagnostic ingestion exception: at most 100 data rows, 52 columns, one GET.
// No database access, pagination, polling, or public HTTP endpoint.
export async function readTestOpportunity(env = process.env, dependencies = {}) {
  const email = env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim();
  const key = env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Set GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY securely in the backend environment.');
  const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID || '1RNeBcdTZY7z6JrUePfvYhgX_F_Zu-wrmDwqOASsBU0w';
  if (!/^[a-zA-Z0-9_-]+$/.test(spreadsheetId)) throw new Error('Invalid GOOGLE_SHEETS_SPREADSHEET_ID.');
  const sheet = env.GOOGLE_SHEETS_SHEET_NAME || 'Sheet1';
  const target = env.GOOGLE_SHEETS_TEST_RECORD_ID || 'TEST-AUTO-001';
  const range = `'${sheet.replace(/'/g, "''")}'!A1:AZ101`;
  const started = Date.now();
  let data;
  try {
    const client = dependencies.client || new JWT({ email, key, scopes: [READONLY_SCOPE] });
    const response = await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      method: 'GET',
      params: { majorDimension: 'ROWS', valueRenderOption: 'FORMATTED_VALUE', fields: 'range,values' },
      timeout: 15000, retry: false, maxContentLength: 1024 * 1024,
    });
    data = response.data;
  } catch (error) {
    // SDK errors may contain credentials/Authorization headers: never forward them.
    const status = error?.response?.status;
    if (status === 403) throw new Error('Google denied access. Enable Sheets API and share the spreadsheet with the service account as Viewer.');
    if (status === 404) throw new Error('Spreadsheet not found or not shared with the service account.');
    if (status === 400) throw new Error('Google rejected the range. Check the configured sheet name.');
    throw new Error('Google Sheets read failed. Check service-account credentials, connectivity, and API availability.');
  }
  const rows = data?.values ?? [];
  if (!Array.isArray(rows) || rows.length > 101 || rows.some(row => !Array.isArray(row) || row.length > 52)) throw new Error('Unexpected or oversized Sheets response.');
  const matches = [];
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].some(cell => String(cell) === target)) matches.push({ rowNumber: index + 1, values: rows[index] });
  }
  if (matches.length > 1) throw new Error('Multiple rows match the test record; no unique result can be returned.');
  return {
    spreadsheetId, range, recordId: target, found: matches.length === 1,
    columns: rows[0] ?? [], record: matches[0] ?? null,
    rowsRead: rows.length, rowsReturned: matches.length, durationMs: Date.now() - started,
    ...(matches.length ? {} : { message: 'Record not found within A2:AZ101; the rest of the sheet was not scanned.' }),
  };
}
