const crypto = require('crypto');

// Talks to the Google Sheets API directly via a service account's
// self-signed JWT (RFC 7523) -- deliberately no `googleapis` SDK dependency
// for what's really one read-only endpoint, matching how the other optional
// integrations in this codebase (Telegram, push) are wired. Read-only scope
// on purpose: the sheet feeds the app database, the app never writes back
// to it.
//
// Configured entirely from environment variables -- the credentials never
// touch the frontend or the database. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and
// GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (the PEM key; literal "\n" sequences
// are unescaped automatically, since that's how most hosts require a
// multi-line secret to be pasted into a single env var).

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let cachedToken = null; // { accessToken, expiresAt }

function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getPrivateKey() {
  return process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(getPrivateKey());
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(`Google auth failed: ${data?.error_description || data?.error || res.status}`);
  }

  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.accessToken;
}

// Reads an entire tab and returns it as an array of rows (each an array of
// cell strings). Empty trailing cells within a row are omitted by the
// Sheets API, not padded -- callers should index defensively.
async function readSheetTab(sheetId, tabName) {
  if (!isConfigured()) {
    throw new Error('Google Sheets is not configured (set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).');
  }
  const accessToken = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(tabName)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Google Sheets read failed: ${data?.error?.message || res.status}`);
  }
  return data.values || [];
}

module.exports = { isConfigured, readSheetTab };
