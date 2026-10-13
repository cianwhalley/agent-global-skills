#!/usr/bin/env node
/**
 * cal-ct — Google Calendar CLI for Connected Tutors.
 *
 * Primitives: list-calendars, list-events.
 * Auth: Agent Vault silas-spike MITM when under vault_run (preferred);
 * otherwise access-token.mjs local OAuth (legacy / offline).
 * JSON output by default for machine callers.
 */

import https from 'https';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { getAccessToken } = await import(resolve(__dirname, '../lib/access-token.mjs'));
const { googleAuthHeaders } = await import(resolve(__dirname, '../lib/vault-mode.mjs'));

const REGISTRY_ID = 'connected-tutors-google';

function calApi(method, path, body) {
  return new Promise((resolve, reject) => {
    googleAuthHeaders(getAccessToken, REGISTRY_ID)
      .then((headers) => {
        const opts = {
          hostname: 'www.googleapis.com',
          path,
          method,
          headers,
        };
        const req = https.request(opts, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
            } else {
              try { resolve(JSON.parse(data)); } catch { resolve(data); }
            }
          });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      })
      .catch(reject);
  });
}

// --- Commands ---

async function cmdListCalendars() {
  const path = `/calendar/v3/users/me/calendarList`;
  const resp = await calApi('GET', path);
  const calendars = (resp.items || []).map((c) => ({
    id: c.id,
    summary: c.summary,
    accessRole: c.accessRole,
    primary: !!c.primary,
  }));
  console.log(JSON.stringify({ calendars, count: calendars.length }));
}

async function cmdListEvents(calendarId, daysBack, daysForward, query, max) {
  const now = Date.now();
  const timeMin = new Date(now - daysBack * 86400000).toISOString();
  const timeMax = new Date(now + daysForward * 86400000).toISOString();
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin,
    timeMax,
    maxResults: String(max),
  });
  if (query) params.set('q', query);
  const path = `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const resp = await calApi('GET', path);
  const events = (resp.items || []).map((e) => ({
    summary: e.summary || '',
    start: e.start?.dateTime || e.start?.date || null,
    end: e.end?.dateTime || e.end?.date || null,
    attendees: (e.attendees || []).map((a) => a.email),
  }));
  console.log(JSON.stringify({ calendar: calendarId, events, count: events.length }));
}

// --- CLI ---

function usage() {
  console.error(`Usage: cal-ct <command> [options]

Commands:
  list-calendars
  list-events   --calendar CAL_ID [--days-back N] [--days-forward N] [--query TEXT] [--max N]

Defaults: --days-back 30, --days-forward 0, --max 250.

Output: JSON to stdout. Errors to stderr.`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next; i++; }
      else { args[key] = true; }
    } else {
      positional.push(argv[i]);
    }
  }
  return { command: positional[0], args };
}

const { command, args } = parseArgs(process.argv.slice(2));

try {
  switch (command) {
    case 'list-calendars':
      await cmdListCalendars();
      break;
    case 'list-events': {
      if (!args.calendar) usage();
      const daysBack = args['days-back'] !== undefined ? Number(args['days-back']) : 30;
      const daysForward = args['days-forward'] !== undefined ? Number(args['days-forward']) : 0;
      const max = args.max !== undefined ? Number(args.max) : 250;
      await cmdListEvents(args.calendar, daysBack, daysForward, args.query, max);
      break;
    }
    default:
      usage();
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
