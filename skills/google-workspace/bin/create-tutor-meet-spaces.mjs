#!/usr/bin/env node
/**
 * Retired 2026-08-20. Meet API standing spaces do not get Calendar cohosts
 * or hello@-owned Gemini notes. Use:
 *   node bin/create-tutor-calendar-meet.mjs --tutor <slug>
 * then Cian adds cohost via the Calendar Meet gear. See meet-rooms.md.
 */
console.error(
  'create-tutor-meet-spaces.mjs is retired. Use create-tutor-calendar-meet.mjs --tutor <slug>',
);
process.exit(2);
