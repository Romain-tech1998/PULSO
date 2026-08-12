import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A ratchet on the French left in the web app (DEC-0003).
 *
 * The group workspace shipped French-only and was translated over several
 * batches. Twice during that work a surface was reported as finished when
 * it was not, and both times the cause was the same: French was being
 * counted by looking for accented characters. UI copy carries plenty of
 * words that have no accent - "Mes forums", "Billets", "Se retrouver",
 * "Afficher tous les lieux" - and none of those are visible to an accent
 * scan. ExploreMap was declared done with "12 lines left, all twelve
 * correct" while three of its controls were still French.
 *
 * So this counts French function words instead, and pins the result. The
 * budgets below may only ever go down. A batch that translates a surface
 * lowers them; nothing else is allowed to raise them.
 */

// Short French words that essentially never appear in English UI copy,
// plus a few longer giveaways. Deliberately excludes words English shares
// (a, on, or, but, son, part, plus...) - see FALSE_FRIENDS below.
const FRENCH_MARKERS = [
  'le', 'la', 'les', 'des', 'une', 'du', 'et', 'ou', 'pour', 'avec',
  'dans', 'sur', 'par', 'qui', 'que', 'quoi', 'pas', 'aucun', 'aucune',
  'cette', 'ces', 'ses', 'leur', 'leurs', 'votre', 'vos', 'ton', 'tes',
  'mon', 'mes', 'notre', 'nos', 'tous', 'toute', 'toutes', 'tout',
  'sans', 'chez', 'vers', 'dont', 'mais', 'donc', 'car', 'est', 'sont',
  'avez', 'avoir', 'etre', 'fait', 'faire', 'voir', 'vous', 'tu', 'toi',
  'nous', 'je', 'elle', 'ils', 'elles', 'ici', 'rien', 'jamais',
  'toujours', 'encore', 'deja', 'bien', 'tres', 'trop', 'peu',
  'beaucoup', 'comme', 'quand', 'oui', 'non', 'merci', 'lieu', 'lieux',
  'amis', 'ami', 'compte', 'sortie', 'sorties', 'soiree', 'soirees',
  'billet', 'billets', 'forums', 'groupe', 'groupes', 'membre',
  'membres', 'recherche', 'rechercher', 'ajouter', 'supprimer',
  'modifier', 'envoyer', 'annuler', 'fermer', 'ouvrir', 'retirer',
  'choisir', 'nouveau', 'nouvelle', 'prochain', 'prochaine', 'dernier',
  'derniere', 'premier', 'premiere', 'jour', 'jours', 'semaine',
  'heure', 'heures', 'gratuit', 'payant'
];

const MARKER_RE_G = new RegExp(`\\b(?:${FRENCH_MARKERS.join('|')})\\b`, 'gi');
const ACCENT_RE = /[éèêëàâçùûîïôœÉÈÀÇÊÎÔÛ]/;

/** Attribute values a person never reads. */
const TECHNICAL_ATTR =
  /^(className|key|type|role|id|href|src|style|name|method|rel|target|width|height|viewBox|fill|stroke|d|xmlns|charSet|encType|accept|min|max|step|rows|cols|maxLength|autoComplete|inputMode|data-[\w-]+|aria-hidden|aria-expanded|aria-pressed|aria-selected|aria-labelledby|aria-controls|aria-current)$/;

/**
 * Accented text that is correct as it stands, so the ratchet does not
 * demand its removal: proper nouns, and the French halves of tables that
 * are already typed Record<SupportedLocale, ...>.
 */
const ALLOWED = [
  /^Montréal$/,
  /^Café-concert$/,
  /^Boîte de nuit$/,
  /^Théâtre \/ salle de spectacle$/,
  /^Brasserie avec scène$/,
  /^Parc \/ festival extérieur$/,
  /^Galerie \/ musée$/,
  /^Espace communautaire$/,
  /^Salle de concert$/,
  // Section and filter identifiers that merely contain a French word.
  /^[\w-]+$/
];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Every string in the file a person could plausibly read. */
function userFacingStrings(source: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  const lines = stripComments(source).split('\n');

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const push = (text: string) => found.push({ line: lineNo, text });

    for (const match of line.matchAll(/([\w-]+)=(["'])(.*?)\2/g)) {
      if (!TECHNICAL_ATTR.test(match[1]!)) push(match[3]!);
    }
    for (const match of line.matchAll(/(?<![\w=])'([^'\\\n]{3,})'/g)) {
      push(match[1]!);
    }
    const trimmed = line.trim();
    if (trimmed && !/[{}<>=;()[\]]/.test(trimmed)) push(trimmed);
  });

  return found;
}

function countFrench(source: string): { line: number; text: string }[] {
  const seen = new Map<number, string>();
  for (const { line, text } of userFacingStrings(source)) {
    if (text.length < 3) continue;
    if (ALLOWED.some((pattern) => pattern.test(text))) continue;
    const markerHits = (text.match(MARKER_RE_G) ?? []).length;
    if (ACCENT_RE.test(text) || markerHits >= 2) {
      if (!seen.has(line)) seen.set(line, text);
    }
  }
  return [...seen].map(([line, text]) => ({ line, text }));
}

/**
 * Remaining French per file. Lower these as batches land; never raise
 * them. Zero means the surface is done and must stay done.
 */
const BUDGETS: Record<string, number> = {
  'explore-map.tsx': 217,
  'groups.tsx': 0,
  'shared.tsx': 0
};

describe('French left in the web app (DEC-0003 ratchet)', () => {
  for (const [file, budget] of Object.entries(BUDGETS)) {
    it(`${file} carries at most ${budget} untranslated strings`, () => {
      const path = fileURLToPath(new URL(`./${file}`, import.meta.url));
      const hits = countFrench(readFileSync(path, 'utf8'));
      // Report what is left, so a failure says where to look rather than
      // just that a number moved.
      const sample = hits
        .slice(0, 15)
        .map((hit) => `  ${file}:${hit.line}  ${hit.text.slice(0, 70)}`)
        .join('\n');
      expect(
        hits.length,
        hits.length > budget
          ? `${hits.length} French strings, budget ${budget}. First few:\n${sample}`
          : `Budget is stale: ${hits.length} left, budget ${budget}. Lower it.`
      ).toBe(Math.min(hits.length, budget));
      expect(hits.length).toBeLessThanOrEqual(budget);
    });
  }

  it('marker list stays free of words English shares', () => {
    // "a", "on", "or", "son", "part", "plus" and friends appear in English
    // copy and would make the ratchet fire on translated text.
    const falseFriends = ['a', 'on', 'or', 'but', 'son', 'part', 'plus', 'sale', 'pain', 'coin'];
    for (const word of falseFriends) {
      expect(FRENCH_MARKERS).not.toContain(word);
    }
  });

  it('detects unaccented French, which an accent scan misses', () => {
    const sample = `<button aria-label="Afficher tous les lieux">Mes forums</button>`;
    expect(ACCENT_RE.test(sample)).toBe(false);
    expect(countFrench(sample).length).toBeGreaterThan(0);
  });

  it('does not fire on translated code or English copy', () => {
    const sample = [
      `<button aria-label={translate(locale, 'filters.showAllVenues')}>`,
      `  {translate(locale, 'nav.events')}`,
      `</button>`,
      `<p>Show only the venues I follow</p>`
    ].join('\n');
    expect(countFrench(sample)).toEqual([]);
  });
});
