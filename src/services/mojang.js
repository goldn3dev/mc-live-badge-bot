import { UserError } from '../errors.js';

const MC_NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

/** 32 hex chars -> 8-4-4-4-12 */
export function dashUuid(id) {
  return id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

/**
 * Resolve a Minecraft Java username to { uuid (dashed), username (canonical casing) }.
 * Throws UserError for invalid / unknown names and for Mojang outages.
 */
export async function lookupMinecraftUser(username) {
  if (!MC_NAME_RE.test(username)) {
    throw new UserError('That is not a valid Minecraft username (1-16 letters, numbers or underscores).');
  }

  let res;
  try {
    res = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
  } catch (err) {
    console.error('[mojang] request failed:', err.message);
    throw new UserError('Could not reach the Mojang API right now. Please try again in a minute.');
  }

  // 204 (old behaviour) and 404 (current) both mean "no such account".
  if (res.status === 204 || res.status === 404) {
    throw new UserError(`No Minecraft Java account named \`${username}\` exists.`);
  }
  if (res.status === 429) {
    throw new UserError('Mojang is rate limiting lookups. Please try again in a minute.');
  }
  if (!res.ok) {
    console.error('[mojang] unexpected status', res.status);
    throw new UserError('The Mojang API returned an error. Please try again later.');
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new UserError('The Mojang API returned an unreadable response. Please try again later.');
  }
  if (!body?.id || !body?.name) {
    throw new UserError(`No Minecraft Java account named \`${username}\` exists.`);
  }
  return { uuid: dashUuid(body.id), username: body.name };
}
