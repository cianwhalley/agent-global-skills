#!/usr/bin/env node
/**
 * Create a standing tutor Meet as a Calendar series on hello@ "Meeting Rooms".
 *
 * Do NOT use Meet API spaces.create / do NOT paste an existing Meet code.
 * After this prints, STOP: paste the human_prompt, wait for "cohost saved",
 * then TeachWorks Location Link. See connected-tutoring meet-rooms.md.
 *
 * Usage:
 *   node bin/create-tutor-calendar-meet.mjs --tutor kimberly
 *   node bin/create-tutor-calendar-meet.mjs --tutor kimberly --name Kimberly
 *
 * Vault (agents): source connected-tutoring/scripts/vault-env.sh && vault_run node …
 */
import { getAccessToken } from '../lib/access-token.mjs';
import { googleAuthHeaders } from '../lib/vault-mode.mjs';
import { randomUUID } from 'crypto';

const CALENDAR_ID =
  'c_e0141b8e415e4b2eb946e50a067b84180183dd551d31cd7f6d7c133717bd78e1@group.calendar.google.com';
/** Cian's hello@ Google account slot in Chrome — eventedit opens the series there. */
const CALENDAR_ACCOUNT_SLOT = '7';

function eventEditUrl(htmlLink) {
  try {
    const eid = new URL(htmlLink).searchParams.get('eid');
    if (eid) {
      return `https://calendar.google.com/calendar/u/${CALENDAR_ACCOUNT_SLOT}/r/eventedit/${eid}`;
    }
  } catch {
    /* keep htmlLink */
  }
  return htmlLink;
}

function arg(flag) {
  const argv = process.argv.slice(2);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return null;
}

async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: await googleAuthHeaders(getAccessToken, 'connected-tutors-google', {
      Accept: 'application/json',
    }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${url} ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

const slug = (arg('--tutor') || '').trim().toLowerCase();
if (!slug) {
  console.error('Usage: node create-tutor-calendar-meet.mjs --tutor <slug> [--name First]');
  process.exit(1);
}
const first = (arg('--name') || slug[0].toUpperCase() + slug.slice(1)).trim();
const email = `${slug}@connectedtutors.org`;

const calEnc = encodeURIComponent(CALENDAR_ID);

const event = {
  summary: `${first}'s Room`,
  description:
    `Standing Meet for ${first}. Created on this series — do not paste another Meet code. ` +
    'hello@ organizer; add the tutor as Calendar cohost via the Meet gear. ' +
    'Free / no reminders. Join anytime via the Meet link.',
  start: { dateTime: '2026-09-05T00:00:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-09-05T00:15:00', timeZone: 'America/New_York' },
  recurrence: ['RRULE:FREQ=MONTHLY;BYDAY=1SA'],
  transparency: 'transparent',
  visibility: 'private',
  guestsCanInviteOthers: false,
  guestsCanModify: false,
  guestsCanSeeOtherGuests: false,
  reminders: { useDefault: false, overrides: [] },
  attendees: [{ email }],
  conferenceData: {
    createRequest: {
      requestId: randomUUID(),
      conferenceSolutionKey: { type: 'hangoutsMeet' },
    },
  },
};

const body = await api(
  `https://www.googleapis.com/calendar/v3/calendars/${calEnc}/events?conferenceDataVersion=1&sendUpdates=none`,
  { method: 'POST', body: event },
);

const meetCode = body.conferenceData?.conferenceId ?? null;
const meetUrl = body.hangoutLink || (meetCode ? `https://meet.google.com/${meetCode}` : null);
let meetSpace = null;
let moderation = null;

if (meetCode) {
  try {
    const space = await api(`https://meet.googleapis.com/v2/spaces/${meetCode}`);
    meetSpace = space.name || null;
    if (space.name) {
      const updated = await api(
        `https://meet.googleapis.com/v2/${space.name}?updateMask=config.moderation,config.accessType`,
        {
          method: 'PATCH',
          body: { config: { moderation: 'ON', accessType: 'TRUSTED' } },
        },
      );
      moderation = updated.config?.moderation ?? 'ON';
    }
  } catch (err) {
    console.error(`warn: could not set Meet moderation ON: ${err.message || err}`);
  }
}

const editUrl = eventEditUrl(body.htmlLink);
const humanPrompt = [
  `Need you on hello@ Calendar for one click — agents can't set cohost.`,
  ``,
  `1. Open ${editUrl} (Meeting Rooms → ${first}'s Room — Edit the series)`,
  `2. Gear next to Google Meet (Video call options)`,
  `3. Host management ON`,
  `4. Co-hosts → add ${email}`,
  `5. Check “Call artifacts are shared with the host and co-hosts you add here”`,
  `6. Save the panel, then save the event`,
  ``,
  `Reply “cohost saved” and I’ll attach this Meet to TeachWorks.`,
].join('\n');

const out = {
  tutor: slug,
  email,
  calendar: 'Meeting Rooms',
  event_id: body.id,
  html_link: body.htmlLink,
  event_edit_url: editUrl,
  meet_url: meetUrl,
  meet_code: meetCode,
  meet_space: meetSpace,
  moderation,
  stop: 'Do not POST TeachWorks Location or book lessons until the human replies “cohost saved”.',
  human_prompt: humanPrompt,
};
console.log(JSON.stringify(out, null, 2));
console.error(`\nSTOP — paste human_prompt in chat. Do not update TeachWorks yet.\n${meetUrl}\n`);
console.error(humanPrompt);
