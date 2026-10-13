#!/usr/bin/env node
/**
 * OAuth for hello@connectedtutors.org — full Google Workspace scopes.
 *
 * Default: print auth URL, then exchange a pasted callback URL:
 *   node scripts/auth-connected-tutors-google.mjs
 *   node scripts/auth-connected-tutors-google.mjs --callback 'http://localhost:3000/oauth2callback?code=...'
 *
 * Local callback server (port 3000, no sudo):
 *   node scripts/auth-connected-tutors-google.mjs --listen
 *
 * Re-run with prompt=consent when adding scopes — refresh tokens do not auto-upgrade.
 */
import http from 'http';
import https from 'https';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const ACCOUNT = 'hello@connectedtutors.org';
const CRED_DIR = join(homedir(), '.config/claude-skills/credentials');
const CLIENT_FILE = join(CRED_DIR, 'connected-tutors-google-oauth-client.json');
const TOKEN_FILE = join(CRED_DIR, 'connected-tutors-google-token.json');
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/tasks',
  // Meet spaces.create for standing tutor rooms (re-auth with --listen when adding)
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/meetings.space.settings',
].join(' ');

const clientJson = JSON.parse(readFileSync(CLIENT_FILE, 'utf8'));
const client = clientJson.installed ?? clientJson.web ?? clientJson;
const REDIRECT_URI = client.redirect_uris?.[0] ?? DEFAULT_REDIRECT_URI;

function buildAuthUrl() {
  return (
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      login_hint: ACCOUNT,
    }).toString()
  );
}

function parseCallbackUrl(raw) {
  const trimmed = raw.trim();
  const url = trimmed.startsWith('http')
    ? new URL(trimmed)
    : new URL(trimmed.startsWith('/') ? trimmed : `/?${trimmed}`, REDIRECT_URI);

  const error = url.searchParams.get('error');
  if (error) {
    throw new Error(
      `OAuth error: ${error}${url.searchParams.get('error_description') ? ` — ${url.searchParams.get('error_description')}` : ''}`,
    );
  }

  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code found in callback URL');
  }
  return code;
}

function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString();

    const tokenReq = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (tokenRes) => {
        let data = '';
        tokenRes.on('data', (chunk) => {
          data += chunk;
        });
        tokenRes.on('end', () => {
          const tokens = JSON.parse(data);
          if (tokens.error) {
            reject(new Error(tokens.error_description ?? tokens.error));
            return;
          }
          resolve(tokens);
        });
      },
    );
    tokenReq.on('error', reject);
    tokenReq.write(body);
    tokenReq.end();
  });
}

function saveToken(tokens) {
  tokens.expires_at = Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600);
  tokens.account = ACCOUNT;
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });

  console.log('Token saved to:', TOKEN_FILE);
  console.log('Scope:', tokens.scope);
  console.log('Has refresh token:', Boolean(tokens.refresh_token));
}

async function completeAuth(callbackInput) {
  const code = parseCallbackUrl(callbackInput);
  const tokens = await exchangeCodeForToken(code);
  saveToken(tokens);
}

function printAuthInstructions() {
  const authUrl = buildAuthUrl();

  console.log(`\nSign in as ${ACCOUNT} and approve Google Workspace access.`);
  console.log(
    'Scopes:',
    SCOPES.replace(/https:\/\/www\.googleapis\.com\/auth\//g, '')
      .split(' ')
      .join(', '),
  );
  console.log('\n1. Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. After approving, copy the full redirect URL from the address bar.');
  console.log('   With --listen running, the browser completes automatically.');
  console.log('   Otherwise paste the URL here or run:\n');
  console.log("   node scripts/auth-connected-tutors-google.mjs --callback '<paste-url-here>'\n");
}

function startCallbackServer() {
  const redirect = new URL(REDIRECT_URI);
  const PORT = Number(redirect.port || 80);
  const authUrl = buildAuthUrl();

  console.log(`\nSign in as ${ACCOUNT} and approve Google Workspace access.`);
  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl);
  console.log(`\nWaiting for callback on ${REDIRECT_URI} …\n`);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400);
        res.end('No authorization code in callback');
        return;
      }

      const tokens = await exchangeCodeForToken(code);
      saveToken(tokens);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Connected Tutors Google Workspace authorized. You can close this tab.</h2>');
      server.close();
      process.exit(0);
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(String(err instanceof Error ? err.message : err));
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, '127.0.0.1');

  setTimeout(() => {
    console.error('Timed out after 120s');
    process.exit(1);
  }, 120_000);
}

const args = process.argv.slice(2);
const listen = args.includes('--listen');
const callbackIdx = args.indexOf('--callback');
const callbackUrl = callbackIdx >= 0 ? args[callbackIdx + 1] : null;

if (callbackUrl) {
  try {
    await completeAuth(callbackUrl);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
} else if (listen) {
  startCallbackServer();
} else {
  printAuthInstructions();
}
