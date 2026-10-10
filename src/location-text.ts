/** Tolerate SCOPE formatting without changing stored location text. */
export function locationParts(text: string): string[] {
  const cleaned = text.replace(/\.\s*(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)\b/gi, ', $1')
    .replace(/^([^,]+?)\s+(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)(?=\s*$|\s*,)/i, '$1, $2');
  return cleaned.split(',').map(value => value.trim()).filter(value => /[\p{L}\p{N}]/u.test(value));
}
