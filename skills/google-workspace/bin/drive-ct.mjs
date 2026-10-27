#!/usr/bin/env node
/**
 * drive-ct — Google Drive CLI for Connected Tutors.
 *
 * Primitives: list, create-folder, copy, copy-tree, share, get.
 * Auth: Agent Vault ct-hello-vault MITM when under vault_run (preferred);
 * otherwise access-token.mjs local OAuth (legacy / offline).
 * JSON output by default for machine callers.
 *
 * Shared Drive support: the "Active Students" folder (and many others) live in
 * a Shared Drive (driveId 0ACVy8HbpfZROUk9PVA). Every call sets
 * supportsAllDrives=true, and list operations also set
 * includeItemsFromAllDrives=true + corpora=allDrives — without these, listing
 * shared-drive content returns 0 results.
 */

import https from 'https';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { getAccessToken } = await import(resolve(__dirname, '../lib/access-token.mjs'));
const { googleAuthHeaders } = await import(resolve(__dirname, '../lib/vault-mode.mjs'));

const REGISTRY_ID = process.env.GOOGLE_REGISTRY_ID || 'connected-tutors-google';

function driveApi(method, path, body) {
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

async function cmdList(folderId, nameContains) {
  let q = `'${folderId}' in parents and trashed=false`;
  if (nameContains) q += ` and name contains '${nameContains.replace(/'/g, "\\'")}'`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,modifiedTime)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
    pageSize: '1000',
    orderBy: 'name',
  });
  const path = `/drive/v3/files?${params.toString()}`;
  const resp = await driveApi('GET', path);
  const files = resp.files || [];
  console.log(JSON.stringify({ folder: folderId, files, count: files.length }));
}

async function cmdCreateFolder(name, parent) {
  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parent],
  };
  const path = `/drive/v3/files?fields=id,name&supportsAllDrives=true`;
  const resp = await driveApi('POST', path, body);
  console.log(JSON.stringify({ created: resp.name, id: resp.id }));
}

// NOTE: Drive's files.copy copies a SINGLE file only. It does NOT recursively
// copy folders — copying a folder id just creates an empty folder. Use the
// copy-tree command to recursively duplicate a folder hierarchy.
async function cmdCopy(fileId, newName, parent) {
  const body = { name: newName };
  if (parent) body.parents = [parent];
  const path = `/drive/v3/files/${fileId}/copy?fields=id,name&supportsAllDrives=true`;
  const resp = await driveApi('POST', path, body);
  console.log(JSON.stringify({ copied: resp.name, id: resp.id }));
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function listChildren(folderId) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
    pageSize: '1000',
  });
  const resp = await driveApi('GET', `/drive/v3/files?${params.toString()}`);
  return resp.files || [];
}

async function createFolder(name, parent) {
  const body = { name, mimeType: FOLDER_MIME, parents: [parent] };
  const resp = await driveApi('POST', `/drive/v3/files?fields=id,name&supportsAllDrives=true`, body);
  return resp.id;
}

async function copyFile(fileId, name, parent) {
  const body = { name, parents: [parent] };
  await driveApi('POST', `/drive/v3/files/${fileId}/copy?fields=id,name&supportsAllDrives=true`, body);
}

// Recursive folder copy — Drive has no native equivalent. We create the dest
// folder, then walk children: subfolders recurse, files use files.copy.
async function copyTreeInto(srcFolderId, destFolderId, stats) {
  const children = await listChildren(srcFolderId);
  for (const child of children) {
    if (child.mimeType === FOLDER_MIME) {
      const newSub = await createFolder(child.name, destFolderId);
      stats.copied_folders++;
      await copyTreeInto(child.id, newSub, stats);
    } else {
      await copyFile(child.id, child.name, destFolderId);
      stats.copied_files++;
    }
  }
}

async function cmdCopyTree(srcFolderId, newName, destParent) {
  const stats = { copied_files: 0, copied_folders: 0 };
  const destFolderId = await createFolder(newName, destParent);
  stats.copied_folders++;
  await copyTreeInto(srcFolderId, destFolderId, stats);
  console.log(JSON.stringify({
    created: newName,
    id: destFolderId,
    copied_files: stats.copied_files,
    copied_folders: stats.copied_folders,
  }));
}

async function cmdShare(fileId, email, role, notify) {
  const body = { type: 'user', role, emailAddress: email };
  const params = new URLSearchParams({
    fields: 'id',
    supportsAllDrives: 'true',
    sendNotificationEmail: notify ? 'true' : 'false',
  });
  const path = `/drive/v3/files/${fileId}/permissions?${params.toString()}`;
  const resp = await driveApi('POST', path, body);
  console.log(JSON.stringify({ shared: email, permissionId: resp.id }));
}

async function cmdGet(fileId) {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,parents,webViewLink',
    supportsAllDrives: 'true',
  });
  const path = `/drive/v3/files/${fileId}?${params.toString()}`;
  const resp = await driveApi('GET', path);
  console.log(JSON.stringify(resp));
}

async function cmdMove(fileId, newParent, keepShortcutIn) {
  const meta = await driveApi(
    'GET',
    `/drive/v3/files/${fileId}?fields=id,name,parents&supportsAllDrives=true`,
  );
  const oldParents = (meta.parents || []).join(',');
  const params = new URLSearchParams({
    addParents: newParent,
    fields: 'id,name,parents',
    supportsAllDrives: 'true',
  });
  if (oldParents) params.set('removeParents', oldParents);
  const resp = await driveApi('PATCH', `/drive/v3/files/${fileId}?${params.toString()}`, {});
  let shortcutId = null;
  if (keepShortcutIn) {
    const shortcut = await driveApi(
      'POST',
      `/drive/v3/files?fields=id,name&supportsAllDrives=true`,
      {
        name: meta.name,
        mimeType: 'application/vnd.google-apps.shortcut',
        parents: [keepShortcutIn],
        shortcutDetails: { targetId: fileId },
      },
    );
    shortcutId = shortcut.id || null;
  }
  console.log(JSON.stringify({
    moved: resp.name,
    id: resp.id,
    parents: resp.parents || [],
    shortcut_id: shortcutId,
  }));
}

async function cmdShortcut(fileId, parent, name) {
  let shortcutName = name;
  if (!shortcutName) {
    const meta = await driveApi(
      'GET',
      `/drive/v3/files/${fileId}?fields=id,name&supportsAllDrives=true`,
    );
    shortcutName = meta.name;
  }
  const resp = await driveApi(
    'POST',
    `/drive/v3/files?fields=id,name&supportsAllDrives=true`,
    {
      name: shortcutName,
      mimeType: 'application/vnd.google-apps.shortcut',
      parents: [parent],
      shortcutDetails: { targetId: fileId },
    },
  );
  console.log(JSON.stringify({ shortcut: resp.name, id: resp.id, target: fileId }));
}

async function cmdExportText(fileId) {
  const params = new URLSearchParams({ mimeType: 'text/plain' });
  const raw = await driveApi(
    'GET',
    `/drive/v3/files/${fileId}/export?${params.toString()}`,
  );
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  console.log(JSON.stringify({ id: fileId, text }));
}

// --- CLI ---

function usage() {
  console.error(`Usage: drive-ct <command> [options]

Commands:
  list          --folder FOLDER_ID [--name-contains TEXT]
  create-folder --name NAME --parent PARENT_ID
  copy          --file FILE_ID --name NEW_NAME [--parent PARENT_ID]
  copy-tree     --folder SRC_FOLDER_ID --name NEW_NAME --parent DEST_PARENT_ID
  share         --file FILE_ID --email EMAIL [--role reader|writer] [--notify]
  get           --file FILE_ID
  move          --file FILE_ID --parent NEW_PARENT_ID [--keep-shortcut-in FOLDER_ID]
  shortcut      --file FILE_ID --parent PARENT_ID [--name NAME]
  export-text   --file FILE_ID

Notes:
  All calls support Shared Drives (supportsAllDrives + includeItemsFromAllDrives).
  files.copy is single-file only; use copy-tree for recursive folder copies.

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
    case 'list':
      if (!args.folder) usage();
      await cmdList(args.folder, args['name-contains']);
      break;
    case 'create-folder':
      if (!args.name || !args.parent) usage();
      await cmdCreateFolder(args.name, args.parent);
      break;
    case 'copy':
      if (!args.file || !args.name) usage();
      await cmdCopy(args.file, args.name, args.parent);
      break;
    case 'copy-tree':
      if (!args.folder || !args.name || !args.parent) usage();
      await cmdCopyTree(args.folder, args.name, args.parent);
      break;
    case 'share': {
      if (!args.file || !args.email) usage();
      const role = (args.role || 'reader').toLowerCase();
      await cmdShare(args.file, args.email, role, !!args.notify);
      break;
    }
    case 'get':
      if (!args.file) usage();
      await cmdGet(args.file);
      break;
    case 'move':
      if (!args.file || !args.parent) usage();
      await cmdMove(args.file, args.parent, args['keep-shortcut-in'] || '');
      break;
    case 'shortcut':
      if (!args.file || !args.parent) usage();
      await cmdShortcut(args.file, args.parent, args.name || '');
      break;
    case 'export-text':
      if (!args.file) usage();
      await cmdExportText(args.file);
      break;
    default:
      usage();
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
