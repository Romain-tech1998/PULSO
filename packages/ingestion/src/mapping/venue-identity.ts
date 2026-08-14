/**
 * Deciding whether two venue records are the same real place.
 *
 * One signal is not enough, and each of the three fails differently:
 *
 * - **Name alone** merges the four "Pub Saint-Paul" across the city.
 * - **Address alone** merges every tenant of one building - a complex with a
 *   bar, a theatre and a gallery shares a street number between all three.
 * - **Coordinates alone** merge neighbours, and miss real duplicates: OSM
 *   maps a pub as a node *and* as its building footprint, whose centroid is
 *   never the same point.
 *
 * Combining them is what makes the answer reliable. The tiers below are
 * ordered by how much evidence each demands, and each exists because a real
 * case needed it:
 *
 * 1. The same name at nearly the same place. Verified against the live
 *    directory: OSM carries "Le Cheval Blanc" at 809 Rue Ontario Est and
 *    "Cheval Blanc" one street over on Rue Rivard - the same brewpub, mapped
 *    twice with a different name and 200 m apart. Neither address matching
 *    nor tight proximity would have caught it.
 * 2. A similar name at a matching address. The names differ ("Théâtre
 *    d'Aujourd'hui" / "Theatre d Aujourdhui") but the street answer is
 *    identical.
 * A third tier was written and then removed: same address, same point,
 * different name, read as a rebrand. Run against the live directory it
 * merged the six halls of Place des Arts - Wilfrid-Pelletier, Maison
 * symphonique, Jean-Duceppe, Maisonneuve, Claude-Léveillée, Cinquième Salle
 * - into one row, along with four separate Saint-Laurent bars and a gallery
 * inside the Belgo building. A multi-tenant address is ordinary in a city
 * centre and a rebrand is rare, so that tier destroyed real venues far more
 * often than it cleaned up stale ones. Two rows for a renamed bar is a
 * cosmetic problem; deleting Maison symphonique is not.
 *
 * What remains never merges on a single signal, and always requires the
 * names to agree. That is the property that makes false merges unlikely -
 * and a false merge is the expensive error, because it silently deletes a
 * real venue rather than showing one twice.
 */

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Words that describe what a place *is* rather than which place it is.
 *
 * Dropped from both sides before comparison, so "Bar Le Cocktail" and "Le
 * Cocktail" compare on "cocktail". Applied symmetrically: a token stripped
 * from one side is stripped from the other, so this cannot make two
 * different places look alike - only stop a shared prefix from hiding that
 * they are the same one.
 */
const GENERIC_VENUE_WORDS = new Set([
  'le',
  'la',
  'les',
  'l',
  'the',
  'du',
  'de',
  'des',
  'd',
  'bar',
  'pub',
  'club',
  'chez',
  'cafe',
  'brasserie',
  'taverne',
  'salle',
  'theatre',
  'centre',
  'center',
  'espace',
  'maison',
  // Address and geography words. Some Pulso rows have no real name and carry
  // a reverse-geocoded address instead, so comparing them compares Nominatim
  // boilerplate: "Rue Fullum, Le Plateau-Mont-Royal, Montréal, Agglomération
  // de Montréal, Québec, Canada" against the same sentence for Rue Chabot
  // agrees on nine tokens out of eleven and disagrees only on the street.
  // Stripping the boilerplate leaves the streets to decide, which is the
  // whole of the difference between those two rows.
  //
  // The same fix separates "au coin des rues Duluth et De Bullion" from "au
  // coin des rues Duluth et Drolet" - three different street corners of one
  // festival, which the shared words had merged into one.
  'rue',
  'rues',
  'avenue',
  'boulevard',
  'chemin',
  'coin',
  'au',
  'aux',
  'et',
  'montreal',
  'quebec',
  'canada',
  'agglomeration',
  'region',
  'administrative'
]);

/** Street-word spellings that mean the same thing in a Montréal address. */
const ADDRESS_SYNONYMS: Record<string, string> = {
  st: 'saint',
  ste: 'sainte',
  sts: 'saint',
  r: 'rue',
  av: 'avenue',
  ave: 'avenue',
  boul: 'boulevard',
  blvd: 'boulevard',
  bd: 'boulevard',
  e: 'est',
  o: 'ouest',
  w: 'ouest',
  n: 'nord',
  s: 'sud'
};

export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return foldText(value).split(' ').filter(Boolean);
}

/**
 * Dice coefficient over token sets.
 *
 * Chosen over edit distance because venue names differ by whole words far
 * more often than by characters - "Casa del Popolo" versus "Casa del Popolo
 * Montreal" is one extra token, which Dice scores 0.86 and a character-level
 * measure would punish for the length difference alone.
 */
export function tokenSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let shared = 0;
  for (const token of leftSet) if (rightSet.has(token)) shared += 1;
  return (2 * shared) / (leftSet.size + rightSet.size);
}

/**
 * The part of a name that identifies *which* place it is.
 *
 * Exported so the proximity tier can ask how much information the agreeing
 * part actually carries - see `isDistinctiveCore`.
 */
export function nameCore(value: string): string[] {
  const all = tokens(value);
  const core = all.filter((token) => !GENERIC_VENUE_WORDS.has(token));
  return core.length > 0 ? core : all;
}

/**
 * Whether a name carries enough to merge two records on proximity alone.
 *
 * "PHI" and "Centre Phi" sit 150 m apart in Old Montréal and are two
 * different venues of one cultural organisation - the Fondation on Rue
 * Saint-Jean and the Centre on Rue Saint-Pierre. Their cores are both `phi`,
 * so name and distance agreed completely and merging them would have deleted
 * a real venue.
 *
 * A three-letter acronym is not evidence of anything; "Cheval Blanc" is. The
 * line is drawn at two distinct tokens, or one token of four characters or
 * more - a word rather than an initialism.
 *
 * Four is empirical, not derived: it is the smallest cut that separates the
 * two real cases in this directory, keeping "Bell" (Centre Bell / Bell
 * Centre, 90 m apart and genuinely one venue) while rejecting "Phi". Distance
 * cannot separate them - the true duplicate is 90 m apart and the false one
 * 137 m - and neither can the address, since "Bell Centre" carries the
 * `Unknown address` sentinel and has none to compare. Treat the number as
 * tuned to observed data, and re-check it against the dry run rather than
 * trusting it blind; the merge command defaults to dry run for exactly this
 * reason.
 *
 * Being strict costs little either way: a short name at a genuinely matching
 * address still merges through the address tier, which is how the two
 * "Pow Pow" rows are caught.
 */
export function isDistinctiveCore(core: string[]): boolean {
  // Distinct tokens, not raw length: "Pow Pow" is two tokens carrying one
  // word's worth of information, and counting it as two would let the
  // proximity tier fire on a three-letter name after all.
  const distinct = [...new Set(core)];
  if (distinct.length >= 2) return true;
  return (distinct[0]?.length ?? 0) >= 4;
}

/** How alike two venue names are, ignoring what kind of place they say it is. */
export function nameSimilarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const leftCore = leftTokens.filter(
    (token) => !GENERIC_VENUE_WORDS.has(token)
  );
  const rightCore = rightTokens.filter(
    (token) => !GENERIC_VENUE_WORDS.has(token)
  );
  // A name made *entirely* of generic words ("Le Bar", "La Maison") has no
  // core to compare, so fall back to the full token set rather than scoring
  // it against nothing and calling every such place identical.
  if (leftCore.length === 0 || rightCore.length === 0) {
    return tokenSimilarity(leftTokens, rightTokens);
  }
  // French elision splits one word into two tokens: "Théâtre d'Aujourd'hui"
  // tokenizes as "aujourd" + "hui", which shares nothing with the same name
  // written "Aujourdhui" and scored 0. Comparing the tokens joined back
  // together catches it. Only exact equality counts here - a loose measure
  // over concatenated strings would start merging unrelated names that
  // happen to run together.
  if (leftCore.join('') === rightCore.join('')) return 1;
  return tokenSimilarity(leftCore, rightCore);
}

interface ParsedAddress {
  houseNumber: string | undefined;
  streetTokens: string[];
}

export function parseAddress(address: string): ParsedAddress {
  const all = tokens(address).map((token) => ADDRESS_SYNONYMS[token] ?? token);
  const [first, ...rest] = all;
  const isNumber = first !== undefined && /^\d+$/.test(first);
  return {
    ...(isNumber ? { houseNumber: first } : { houseNumber: undefined }),
    // The city, province and postcode repeat on every Montréal row and carry
    // no discriminating power, so only the street words are compared.
    streetTokens: (isNumber ? rest : all).filter(
      (token) => token !== 'montreal' && token !== 'quebec' && token !== 'qc'
    )
  };
}

/**
 * How alike two addresses are.
 *
 * A house number that is present on both sides and differs is treated as
 * decisive: 4479 and 4481 Rue Saint-Denis are two doors, not one, however
 * identical the rest of the string is.
 */
export function addressSimilarity(left: string, right: string): number {
  const a = parseAddress(left);
  const b = parseAddress(right);
  if (a.houseNumber && b.houseNumber && a.houseNumber !== b.houseNumber) {
    return 0;
  }
  const streets = tokenSimilarity(a.streetTokens, b.streetTokens);
  // Both numbers present and equal is real corroboration; one side missing
  // its number is neither corroboration nor contradiction.
  if (a.houseNumber && b.houseNumber) return Math.min(1, streets + 0.15);
  return streets;
}

/** Great-circle distance in kilometres. */
export function distanceKm(
  from: { longitude: number; latitude: number },
  to: { longitude: number; latitude: number }
): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export interface VenueIdentity {
  name: string;
  address?: string | undefined;
  point?: { longitude: number; latitude: number } | undefined;
}

export interface VenueMatch {
  same: boolean;
  /** Which tier decided it, so a merge can be explained rather than trusted. */
  reason: 'same-name-nearby' | 'similar-name-same-address' | 'no-match';
  nameScore: number;
  addressScore: number;
  distanceKm: number | undefined;
}

const NAME_STRONG = 0.85;
/**
 * Deliberately high for the address tier.
 *
 * Montréal venues are routinely named after the neighbourhood they sit in,
 * so two unrelated places in one borough already share most of their tokens
 * before anything discriminating is compared. At 0.6 this merged
 * "Bibliothèque de Rivière-des-Prairies" into "Centre Communautaire
 * Rivière-Des-Prairies" - two civic buildings whose only common ground is
 * the borough in their name. The address agreeing is not enough to rescue a
 * weak name match, because in this tier the name is the only thing doing
 * the discriminating.
 */
const NAME_SIMILAR = 0.75;
const ADDRESS_STRONG = 0.8;
/** One brewpub mapped on two adjacent streets was 200 m apart. */
const NEARBY_KM = 0.5;

export function matchVenues(
  left: VenueIdentity,
  right: VenueIdentity
): VenueMatch {
  const nameScore = nameSimilarity(left.name, right.name);
  const addressScore =
    left.address && right.address
      ? addressSimilarity(left.address, right.address)
      : 0;
  const separation =
    left.point && right.point ? distanceKm(left.point, right.point) : undefined;

  const base = { nameScore, addressScore, distanceKm: separation };

  // Distinctiveness is measured on the shorter core: that is the part both
  // names actually agree on, and the part the merge would be resting on.
  const leftCore = nameCore(left.name);
  const rightCore = nameCore(right.name);
  const sharedCore = leftCore.length <= rightCore.length ? leftCore : rightCore;
  if (
    nameScore >= NAME_STRONG &&
    isDistinctiveCore(sharedCore) &&
    separation !== undefined &&
    separation <= NEARBY_KM
  ) {
    return { ...base, same: true, reason: 'same-name-nearby' };
  }
  if (nameScore >= NAME_SIMILAR && addressScore >= ADDRESS_STRONG) {
    return { ...base, same: true, reason: 'similar-name-same-address' };
  }
  return { ...base, same: false, reason: 'no-match' };
}

/**
 * How much a record actually tells a visitor.
 *
 * Used to decide which of two duplicates survives. A working ticketing link
 * is worth the most because it is the one field a visitor leaves Pulso to
 * act on - a listing that cannot be acted on has failed at the thing the
 * directory exists for. A photo comes next: it is what makes a result
 * recognizable in a list. The rest are ordinary completeness.
 *
 * Deliberately not a measure of *source* authority. That is a separate axis,
 * already handled where it matters, and the two disagree often enough that
 * conflating them would let an authoritative but empty record win over a
 * complete one.
 */
export function completenessScore(record: {
  ticketingUrl?: string | undefined;
  imageUrl?: string | undefined;
  description?: string | undefined;
  address?: string | undefined;
  category?: string | undefined;
  endsAt?: string | undefined;
  price?: { kind: string } | undefined;
}): number {
  let score = 0;
  if (isUsableUrl(record.ticketingUrl)) score += 5;
  if (isUsableUrl(record.imageUrl)) score += 3;
  if (record.description && record.description.trim().length > 40) score += 2;
  if (record.address && record.address.trim()) score += 1;
  if (record.category) score += 1;
  if (record.endsAt) score += 1;
  if (record.price && record.price.kind !== 'unknown') score += 1;
  return score;
}

/**
 * Whether a URL is worth counting as a real link.
 *
 * Only structural checks - a scheme and a host. Confirming a ticketing page
 * still resolves would mean an HTTP request per candidate during merging,
 * which is both far too slow for a batch and wrong in kind: a link that is
 * momentarily down is not the same as a link that was never there.
 */
export function isUsableUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname.includes('.')
    );
  } catch {
    return false;
  }
}
