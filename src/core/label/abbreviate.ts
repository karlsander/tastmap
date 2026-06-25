/**
 * Deterministic 3-letter road labels for the legend.
 *
 * The scheme mirrors how a person abbreviates German street names:
 *   - the last letter is the road-type initial (Straße→S, Allee→A, Weg→W …),
 *     whether the type is glued on (Rykestraße) or a separate word (… Allee);
 *   - a multi-part base takes the initials of its parts (Ella-Kay-Straße → EKS);
 *   - a single-word base takes its first letter plus its most *distinctive*
 *     interior letter — rare letters rank highest, so Greifswalder→W, Prenzlauer
 *     →Z, Ryke→Y, giving GWS / PZA / RYS.
 *
 * Codes are made unique across a legend by falling back to the next-most-
 * distinctive letter on a collision (see {@link buildLegend}).
 */

export interface LegendEntry {
  code: string;
  name: string;
}

/** Fold umlauts/ß and lowercase, so letter logic is plain ASCII a–z. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/é|è|ê/g, 'e')
    .replace(/á|à|â/g, 'a');
}

// Letters ordered most-distinctive → least; vowels last. The interior letter of
// a single-word name is the earliest-ranked letter it contains.
const DISTINCT_ORDER = 'qxjyzwkvfbpghdcmtlnrsuoaei';
const RANK: Record<string, number> = {};
for (let i = 0; i < DISTINCT_ORDER.length; i++) RANK[DISTINCT_ORDER[i]] = i;

// German road-type morphemes, longest first so "strasse" wins over shorter ones.
const ROAD_TYPES = [
  'promenade',
  'chaussee',
  'strasse',
  'graben',
  'garten',
  'winkel',
  'allee',
  'damm',
  'platz',
  'steig',
  'stieg',
  'gasse',
  'markt',
  'zeile',
  'kehre',
  'grund',
  'weg',
  'ring',
  'ufer',
  'pfad',
  'steg',
  'tor',
  'hof',
  'park',
  'plan',
].sort((a, b) => b.length - a.length);

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// German digraphs that collapse to a *single* sound, so their letters don't read
// as distinctive on their own — the H in "Esmarch", the K in "Knaack", the H in
// "Thaer". Their positions are skipped when picking the distinctive letter (kept
// as a last resort if nothing else remains). Note: consonant *clusters* like
// "st"/"pl"/"tr" are NOT here — both letters are pronounced and stay pickable;
// vowel digraphs (ie/au/eu) don't matter, since vowels already rank last.
const BOUND_DIGRAPHS = ['sch', 'ch', 'ck', 'ph', 'th'];

/**
 * Distinct letters of `s`, ordered most-distinctive first (ties by position).
 * Letters bound in a German digraph are skipped unless that leaves nothing.
 * Pass `skipFirst` to ignore the leading letter while still detecting digraphs
 * across the whole word (so a word-initial "th"/"ch" is caught correctly).
 */
function distinctLetters(s: string, skipFirst = false): string[] {
  const f = fold(s);
  const bound = new Set<number>();
  for (const dg of BOUND_DIGRAPHS) {
    let from = f.indexOf(dg);
    while (from !== -1) {
      for (let k = 0; k < dg.length; k++) bound.add(from + k);
      from = f.indexOf(dg, from + 1);
    }
  }
  const pick = (skipBound: boolean): string[] => {
    const seen = new Set<string>();
    const out: { c: string; rank: number; pos: number }[] = [];
    for (let i = skipFirst ? 1 : 0; i < f.length; i++) {
      if (skipBound && bound.has(i)) continue;
      const c = f[i];
      if (c < 'a' || c > 'z' || seen.has(c)) continue;
      seen.add(c);
      out.push({ c, rank: RANK[c] ?? 99, pos: i });
    }
    out.sort((a, b) => a.rank - b.rank || a.pos - b.pos);
    return out.map((x) => x.c.toUpperCase());
  };
  const primary = pick(true);
  return primary.length ? primary : pick(false);
}

/** Split a name into base tokens (folded) and the road-type initial, if any.
 *  Punctuation is dropped first (replaced by a token break), so a parenthesised
 *  qualifier — common on station names, "Berlin Ostkreuz (Stadtbahn)" — doesn't
 *  leak a "(" into a code where a letter belongs. */
function splitSuffix(name: string): { baseTokens: string[]; suffixLetter: string | null } {
  const tokens = name
    .replace(/[^\p{L}\s-]+/gu, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (tokens.length === 0) return { baseTokens: [], suffixLetter: null };

  const last = fold(tokens[tokens.length - 1]);
  // Road type as its own word, e.g. "… Allee".
  for (const rt of ROAD_TYPES) {
    if (last === rt) {
      return { baseTokens: tokens.slice(0, -1).map(fold), suffixLetter: rt[0].toUpperCase() };
    }
  }
  // Road type glued onto the last token, e.g. "Rykestraße".
  for (const rt of ROAD_TYPES) {
    if (last.length > rt.length && last.endsWith(rt)) {
      const stem = last.slice(0, last.length - rt.length);
      return { baseTokens: [...tokens.slice(0, -1).map(fold), stem], suffixLetter: rt[0].toUpperCase() };
    }
  }
  return { baseTokens: tokens.map(fold), suffixLetter: null };
}

/**
 * Candidate 3-letter codes for a name, best first. The first is the canonical
 * label; the rest are collision fallbacks (swap the interior letter, then the
 * final letter). All are uppercase A–Z.
 */
export function codeCandidates(name: string): string[] {
  const { baseTokens, suffixLetter } = splitSuffix(name);
  const toks = baseTokens.filter((t) => t.length > 0);

  let first: string;
  let mids: string[];
  let last: string;
  let lastAlts: string[];

  if (toks.length >= 2) {
    // Multi-part base: initials of the first two parts.
    first = toks[0][0].toUpperCase();
    mids = [toks[1][0].toUpperCase(), ...distinctLetters(toks[1], true), ...distinctLetters(toks[0], true)];
    last = suffixLetter ?? (toks.length >= 3 ? toks[2][0].toUpperCase() : distinctLetters(toks[1], true)[0]) ?? 'X';
    lastAlts = suffixLetter ? [] : distinctLetters(toks.join(''));
  } else if (toks.length === 1) {
    first = toks[0][0].toUpperCase();
    const interior = distinctLetters(toks[0], true);
    mids = interior.length ? interior : [toks[0][0].toUpperCase()];
    if (suffixLetter) {
      last = suffixLetter;
      lastAlts = [];
    } else {
      // No road type: first letter + two most-distinctive interior letters.
      last = interior[1] ?? interior[0] ?? 'X';
      mids = interior.length ? [interior[0]] : [first];
      lastAlts = interior.slice(1);
    }
  } else {
    // Degenerate (name is only a road type, or empty): use the raw letters.
    const f = fold(name);
    const letters = distinctLetters(f);
    first = (f[0] ?? 'x').toUpperCase();
    mids = letters.slice(1).length ? letters.slice(1) : [first];
    last = suffixLetter ?? letters[letters.length - 1] ?? 'X';
    lastAlts = letters;
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (c: string): void => {
    if (c.length === 3 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };

  for (const m of mids) push(first + m + last);
  for (const m of mids) for (const l of lastAlts) push(first + m + l);
  // Guaranteed-unique backstop: sweep the interior, then the final letter.
  for (const m of ALPHABET) push(first + m + last);
  for (const m of mids) for (const l of ALPHABET) push(first + m + l);
  return out;
}

/** The canonical 3-letter label for one name. */
export function abbreviateName(name: string): string {
  return codeCandidates(name)[0];
}

/**
 * Assign a unique 3-letter code to each distinct name, in input order (so a
 * length-sorted road list yields a length-sorted legend). Collisions fall back
 * to the next candidate code.
 */
export function buildLegend(names: string[]): LegendEntry[] {
  const used = new Set<string>();
  const seenNames = new Set<string>();
  const out: LegendEntry[] = [];
  for (const name of names) {
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const code = codeCandidates(name).find((c) => !used.has(c));
    if (!code) continue; // unreachable in practice; backstop yields 600+ options
    used.add(code);
    out.push({ code, name });
  }
  return out;
}
