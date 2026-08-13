import type { PublicUser } from '@pulso/contracts';

/**
 * The shape every repository selects when it needs to show *another*
 * account, and the one place that turns it into a PublicUser.
 *
 * Before DEC-0020 this was three columns inlined in a dozen queries, which
 * was tolerable while an avatar was only ever `avatar_url`. It stopped
 * being tolerable once an avatar became a resolution order - uploaded
 * photo, then preset, then the Google photo, then the initial - because
 * every query that kept selecting only `avatar_url` silently renders the
 * Google photo for a user who has uploaded a real one.
 */
export interface PublicUserRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  photo_url: string | null;
  avatar_style: string | null;
}

/**
 * The column list to select, qualified by the table alias holding `users`.
 * Written as a helper rather than a constant so a query joining users twice
 * (requester and addressee, say) can label each side.
 */
export function publicUserColumns(alias: string): string {
  return `${alias}.id, ${alias}.display_name, ${alias}.avatar_url, ${alias}.photo_url, ${alias}.avatar_style`;
}

export function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    displayName: row.display_name,
    ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {}),
    ...(row.photo_url !== null ? { photoUrl: row.photo_url } : {}),
    ...(row.avatar_style !== null ? { avatarStyle: row.avatar_style } : {})
  };
}
