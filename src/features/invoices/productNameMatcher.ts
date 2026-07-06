/**
 * Bilingual product-name similarity for quotation auto-fill.
 *
 * Why: the old matcher compared the extracted name only against the product
 * label in the CURRENT UI language — an Arabic quotation uploaded in an
 * English UI could never fuzzy-match name_ar (and vice versa). It also did no
 * Arabic orthography folding, so أ/إ/آ vs ا or ة vs ه killed the similarity.
 *
 * This module always scores against item_code, name, name_en AND name_ar,
 * with Arabic folding + Arabic-Indic digit normalization applied first.
 */

const ARABIC_INDIC_ZERO = 0x0660; // ٠
const EXT_ARABIC_INDIC_ZERO = 0x06f0; // ۰

function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const digit = code >= EXT_ARABIC_INDIC_ZERO ? code - EXT_ARABIC_INDIC_ZERO : code - ARABIC_INDIC_ZERO;
    return String(digit);
  });
}

/** Fold Arabic orthographic variants + strip diacritics/tatweel. */
export function foldArabic(text: string): string {
  return text
    .replace(/[ً-ٰٟ]/g, "") // harakat / diacritics
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

function normalizeForMatch(text: string): string {
  return foldArabic(normalizeDigits(text))
    .toLowerCase()
    .replace(/[\s ]+/g, " ")
    .trim();
}

/**
 * 0.4 · word-overlap + 0.6 · normalized-Levenshtein, on folded strings.
 * Returns 0..1.
 */
export function nameSimilarity(a: string, b: string): number {
  const s1 = normalizeForMatch(a);
  const s2 = normalizeForMatch(b);
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  let matches = 0;
  for (const w1 of words1) {
    if (words2.includes(w1)) matches++;
  }
  const wordOverlap = (2 * matches) / (words1.length + words2.length);

  const len = Math.max(s1.length, s2.length);
  const matrix = Array.from({ length: s1.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  const dist = matrix[s1.length][s2.length];
  const charSim = 1 - dist / len;

  return 0.4 * wordOverlap + 0.6 * charSim;
}

export interface MatchableProduct {
  item_code?: string | null;
  name?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
}

/**
 * Best similarity between an extracted document name and a product across
 * every identifying field, independent of the active UI language.
 */
export function bestProductSimilarity(externalName: string, product: MatchableProduct): number {
  let best = 0;
  for (const candidate of [product.item_code, product.name, product.name_en, product.name_ar]) {
    if (!candidate) continue;
    const sim = nameSimilarity(externalName, candidate);
    if (sim > best) best = sim;
    if (best === 1) break;
  }
  return best;
}
