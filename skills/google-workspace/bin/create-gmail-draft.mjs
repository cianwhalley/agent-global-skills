#!/usr/bin/env node
/**
 * Create Gmail drafts (Connected Tutors mailbox).
 *
 * Usage:
 *   node create-gmail-draft.mjs \
 *     --to user@example.com \
 *     --subject "Subject line" \
 *     --body-file /path/to/body.txt \
 *     --body-html-file /path/to/body.html \
 *     --attach /path/to/file.pdf
 *
 * Reply in an existing thread (preferred for parent follow-ups):
 *   node create-gmail-draft.mjs \
 *     --reply-to MESSAGE_ID \
 *     --body-file /path/to/body.txt \
 *     --body-html-file /path/to/body.html \
 *     [--cc ADDR] [--bcc ADDR] [--to ADDR]
 * Fetches threadId / Message-ID / Subject from that message and sets
 * In-Reply-To + References so the draft lands in the conversation.
 *
 * Gmail best practice: pass --body-html-file for drafts you will edit in the
 * Gmail UI. Plain-text-only drafts lose list/paragraph structure when opened
 * in compose. HTML + plain multipart/alternative keeps formatting on edit.
 */
import fs from 'fs';
import https from 'https';
import path from 'path';

import { getAccessToken } from '../lib/access-token.mjs';
import { googleAuthHeaders } from '../lib/vault-mode.mjs';

function parseArgs(argv) {
  const out = {
    registry: 'connected-tutors-google',
    attach: [],
    cc: [],
    bcc: [],
    // Parent-facing CT mail: Emma persona on hello@ (see connected-tutoring parent-email skill)
    from: 'Emma <hello@connectedtutors.org>',
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const val = argv[i + 1];
    switch (key) {
      case '--registry':
        out.registry = val;
        i++;
        break;
      case '--to':
        out.to = val;
        i++;
        break;
      case '--from':
        out.from = val;
        i++;
        break;
      case '--cc':
        // Comma-separated or repeatable --cc
        for (const addr of String(val || '').split(',')) {
          const trimmed = addr.trim();
          if (trimmed) out.cc.push(trimmed);
        }
        i++;
        break;
      case '--bcc':
        // Comma-separated or repeatable --bcc (use for Christina — never expose on parent mail)
        for (const addr of String(val || '').split(',')) {
          const trimmed = addr.trim();
          if (trimmed) out.bcc.push(trimmed);
        }
        i++;
        break;
      case '--subject':
        out.subject = val;
        i++;
        break;
      case '--body':
        out.body = val;
        i++;
        break;
      case '--body-file':
        out.body = fs.readFileSync(val, 'utf8');
        i++;
        break;
      case '--body-html':
        out.bodyHtml = val;
        i++;
        break;
      case '--body-html-file':
        out.bodyHtml = fs.readFileSync(val, 'utf8');
        i++;
        break;
      case '--attach':
        out.attach.push(val);
        i++;
        break;
      case '--reply-to':
        // Gmail API message id (from messages.list / messages.get)
        out.replyTo = val;
        i++;
        break;
      case '--thread-id':
        out.threadId = val;
        i++;
        break;
      case '--in-reply-to':
        out.inReplyTo = val;
        i++;
        break;
      case '--references':
        out.references = val;
        i++;
        break;
      default:
        break;
    }
  }
  return out;
}

function gmailGet(authHeaders, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'gmail.googleapis.com',
        path,
        method: 'GET',
        headers: authHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: { raw: data } });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function headerMap(msg) {
  const out = {};
  for (const h of msg.payload?.headers || []) {
    out[h.name] = h.value;
  }
  return out;
}

/** Load reply headers + threadId from an existing Gmail message. */
async function resolveReplyTarget(authHeaders, messageId) {
  const { status, body } = await gmailGet(
    authHeaders,
    `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata`
      + '&metadataHeaders=Message-ID&metadataHeaders=Message-Id'
      + '&metadataHeaders=References&metadataHeaders=Subject'
      + '&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=To',
  );
  if (status >= 400 || body.error) {
    throw new Error(
      `Failed to load reply-to message ${messageId}: `
        + JSON.stringify(body.error || body).slice(0, 300),
    );
  }
  const headers = headerMap(body);
  const messageIdHeader = headers['Message-ID'] || headers['Message-Id'];
  if (!messageIdHeader) {
    throw new Error(`Message ${messageId} has no Message-ID header`);
  }
  const priorRefs = (headers.References || '').trim();
  const references = priorRefs
    ? `${priorRefs} ${messageIdHeader}`
    : messageIdHeader;

  // Prefer Reply-To, else From address for --to when caller omits it.
  const replyToHeader = headers['Reply-To'] || headers.From || '';
  const fromMatch = replyToHeader.match(/<([^>]+)>/) || replyToHeader.match(/(\S+@\S+)/);
  const defaultTo = fromMatch ? fromMatch[1] : replyToHeader.trim();

  let subject = (headers.Subject || '').trim();
  if (subject && !/^re:\s/i.test(subject)) {
    subject = `Re: ${subject}`;
  }

  return {
    threadId: body.threadId,
    inReplyTo: messageIdHeader,
    references,
    subject,
    defaultTo,
  };
}

function encodeBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeBase64Content(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** RFC 2047 — required for non-ASCII characters (e.g. em dashes) in MIME headers. */
function encodeMimeHeader(value) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildMultipartEmail({
  to,
  cc = [],
  bcc = [],
  from,
  subject,
  body,
  bodyHtml,
  attach,
  inReplyTo,
  references,
}) {
  const headers = [];
  if (from) {
    headers.push(`From: ${from}`);
  }
  headers.push(`To: ${to}`);
  if (cc.length) {
    headers.push(`Cc: ${cc.join(', ')}`);
  }
  if (bcc.length) {
    headers.push(`Bcc: ${bcc.join(', ')}`);
  }
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    headers.push(`References: ${references}`);
  }
  headers.push(
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
  );

  if (attach.length === 0 && !bodyHtml) {
    return encodeBase64Url([
      ...headers,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeBase64Content(body || ''),
      '',
    ].join('\r\n'));
  }

  if (attach.length === 0 && bodyHtml) {
    const { boundary, parts } = buildAlternativeParts(body, bodyHtml);
    return encodeBase64Url([
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      parts,
    ].join('\r\n'));
  }

  const mixedBoundary = `mixed_${Date.now()}`;
  const inner = bodyHtml ? buildAlternativeParts(body, bodyHtml) : null;
  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
  ];
  if (inner) {
    lines.push(
      `Content-Type: multipart/alternative; boundary="${inner.boundary}"`,
      '',
      inner.parts,
    );
  } else {
    lines.push(
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeBase64Content(body || ''),
    );
  }

  for (const filePath of attach) {
    const filename = path.basename(filePath);
    const content = fs.readFileSync(filePath);
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      content.toString('base64'),
    );
  }

  lines.push(`--${mixedBoundary}--`, '');
  return encodeBase64Url(lines.join('\r\n'));
}

function buildAlternativeParts(body, bodyHtml) {
  const boundary = `alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64Content(body || ''),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64Content(bodyHtml),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { boundary, parts };
}

async function gmailCreateDraft(authHeaders, raw, threadId) {
  const message = { raw };
  if (threadId) message.threadId = threadId;
  const payload = JSON.stringify({ message });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'gmail.googleapis.com',
        path: '/gmail/v1/users/me/drafts',
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data });
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
if ((!args.body && !args.bodyHtml) || (!args.replyTo && (!args.to || !args.subject))) {
  console.error(
    'Usage: create-gmail-draft.mjs --to ADDR --subject TEXT '
      + '(--body TEXT | --body-file PATH) [--body-html TEXT | --body-html-file PATH] '
      + '[--from "Emma <hello@connectedtutors.org>"] [--cc ADDR] [--bcc ADDR] [--attach FILE ...]\n'
      + '   or: create-gmail-draft.mjs --reply-to MESSAGE_ID '
      + '(--body TEXT | --body-file PATH) [--body-html ...] [--to ADDR] [--cc ADDR] [--bcc ADDR]',
  );
  process.exit(1);
}

const authHeaders = await googleAuthHeaders(getAccessToken, args.registry);

if (args.replyTo) {
  const target = await resolveReplyTarget(authHeaders, args.replyTo);
  args.threadId = args.threadId || target.threadId;
  args.inReplyTo = args.inReplyTo || target.inReplyTo;
  args.references = args.references || target.references;
  args.subject = args.subject || target.subject;
  args.to = args.to || target.defaultTo;
}

if (!args.to || !args.subject) {
  console.error('Missing --to / --subject (or failed to infer from --reply-to)');
  process.exit(1);
}

const raw = buildMultipartEmail(args);
const result = await gmailCreateDraft(authHeaders, raw, args.threadId);
if (result.error) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      draftId: result.id,
      messageId: result.message?.id,
      threadId: result.message?.threadId || args.threadId || null,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      replyTo: args.replyTo || null,
      html: Boolean(args.bodyHtml),
      attachments: args.attach.map((p) => path.basename(p)),
    },
    null,
    2,
  ),
);
