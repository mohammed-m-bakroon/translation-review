// Tashkeel (harakat, shadda, sukun), superscript alef and tatweel.
const MARKS = /[ً-ٰٟـ]/g;

/**
 * Normalises Arabic text for matching: removes diacritics and tatweel and
 * unifies alef / yeh / teh-marbuta variants, so "صنّاع" matches "صناع".
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(MARKS, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}
