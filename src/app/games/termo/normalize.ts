/**
 * Accent normalization for Termo.
 *
 * Termo compares words in unaccented uppercase form. This function is the
 * single source of truth for that conversion. NFD decomposes accented letters
 * into base + combining marks, then we strip the combining marks (range
 * U+0300..U+036F), then uppercase. This handles every Brazilian Portuguese
 * diacritic uniformly — including `ç` (which decomposes to `c` +
 * combining cedilla U+0327).
 */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}
