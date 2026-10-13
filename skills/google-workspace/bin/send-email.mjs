#!/usr/bin/env node
/**
 * Send email via Gmail API using Connected Tutors OAuth token.
 *
 * Usage:
 *   node send-email.mjs --to user@example.com --subject "Hi" --body "..."
 *   node send-email.mjs --to user@example.com --subject "Hi" --body "..." --attach /path/file.pdf
 */
import fs from 'fs';
import https from 'https';
import path from 'path';

import { getAccessToken } from '../lib/access-token.mjs';
import { googleAuthHeaders } from '../lib/vault-mode.mjs';

function parseArgs(argv) {
  const out = { registry: 'connected-tutors-google', attach: [], cc: [], bcc: [] };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--registry') out.registry = val;
    if (key === '--to') out.to = val;
    if (key === '--cc') {
      out.cc.push(val);
      i++;
      continue;
    }
    if (key === '--bcc') {
      out.bcc.push(val);
      i++;
      continue;
    }
    if (key === '--subject') out.subject = val;
    if (key === '--body') out.body = val;
    if (key === '--attach') {
      out.attach.push(val);
      i++;
      continue;
    }
    if (key === '--from') {
      out.from = val;
      i++;
      continue;
    }
    if (key.startsWith('--')) i++;
  }
  return out;
}

function encodeSubject(subject) {
  // RFC 2047 for non-ascii; plain ASCII subjects pass through.
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function buildRawEmail({
  to,
  subject,
  body,
  attachments = [],
  cc = [],
  bcc = [],
  fromHeader,
}) {
  const fromLines = fromHeader ? [`From: ${fromHeader}`] : [];
  const ccHeader = cc.length ? [`Cc: ${cc.join(', ')}`] : [];
  const bccHeader = bcc.length ? [`Bcc: ${bcc.join(', ')}`] : [];
  if (!attachments.length) {
    const lines = [
      ...fromLines,
      `To: ${to}`,
      ...ccHeader,
      ...bccHeader,
      `Subject: ${encodeSubject(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ];
    return Buffer.from(lines.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  const boundary = `ct_boundary_${Date.now()}`;
  const parts = [
    ...fromLines,
    `To: ${to}`,
    ...ccHeader,
    ...bccHeader,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ];

  for (const filePath of attachments) {
    const filename = path.basename(filePath);
    const data = fs.readFileSync(filePath);
    const b64 = data.toString('base64').replace(/(.{76})/g, '$1\r\n');
    const mime =
      filename.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/octet-stream';
    parts.push(
      `--${boundary}`,
      `Content-Type: ${mime}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      b64,
    );
  }
  parts.push(`--${boundary}--`, '');
  return Buffer.from(parts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function gmailSend(raw, registryId) {
  const payload = JSON.stringify({ raw });
  const headers = await googleAuthHeaders(getAccessToken, registryId, {
    'Content-Length': Buffer.byteLength(payload),
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'gmail.googleapis.com',
        path: '/gmail/v1/users/me/messages/send',
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const args = parseArgs(process.argv);
if (!args.to || !args.subject || !args.body) {
  console.error(
    'Usage: send-email.mjs --to ADDR --subject TEXT --body TEXT [--from "Name <addr>"] [--attach PATH] [--registry connected-tutors-google]',
  );
  process.exit(1);
}

const raw = buildRawEmail({
  to: args.to,
  cc: args.cc || [],
  bcc: args.bcc || [],
  fromHeader: args.from,
  subject: args.subject,
  body: args.body,
  attachments: args.attach || [],
});
const result = await gmailSend(raw, args.registry);
if (result.error) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ id: result.id, threadId: result.threadId }, null, 2));
