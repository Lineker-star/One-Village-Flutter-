/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Normalizes free-text input (e.g. a user-typed neighborhood name) into consistent title case,
// so "kOUME-BONIS" and "koume bonis" both display/export as "Koume-Bonis". Capitalizes the first
// letter after the string start, whitespace, hyphens, and apostrophes.
export function toTitleCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_match, sep: string, letter: string) => sep + letter.toUpperCase());
}
