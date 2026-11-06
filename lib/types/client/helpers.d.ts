/**
 * Shared panel helpers: the active-dictionary pick (document-language
 * based, family precedent) plus a small error-message extractor.
 */
import { type HubKey, type TranslateValues } from './locales.ts';
import type { ManagedBy } from './grouping.ts';
/**
 * Locale the panel renders in: the DSH UI language, taken from
 * `documentElement.lang` (dsh sets it from its own language matching), never
 * from the browser/Electron default. Needed because the desktop app starts
 * its renderer with `--lang=en-US` — packaged builds ship no `.lproj`, so
 * Chromium falls back to English — while the UI text itself is Chinese.
 * An unqualified `toLocaleString()` would therefore print US dates next to
 * Chinese labels; every panel-side date goes through this instead.
 *
 * Tags outside the two shipped dictionaries fall back to `zh`, exactly like
 * the dictionary, so text and dates can never disagree.
 */
export declare function panelLocale(): 'zh' | 'en';
export declare function dictionary(): Record<string, string>;
/** Translate a key with optional {name} template params (current language). */
export declare function tt(key: HubKey, values?: TranslateValues): string;
/** User-facing label for one managed-by value. */
export declare function managedByText(managed: ManagedBy): string;
/** Human-readable error text from an unknown thrown value. */
export declare function errorMessage(error: unknown): string;
/**
 * Whether a displayName is worth showing beside the kebab-case name.
 * Pure case/punctuation variants (e.g. "Code Review" vs "code-review") are redundant.
 */
export declare function isDisplayNameDistinct(name: string, displayName: string | undefined): displayName is string;
/**
 * Copy text to the clipboard. Uses the async API with a positioned-textarea
 * fallback for insecure contexts. Resolves true only when the copy succeeded.
 */
export declare function copyTextToClipboard(text: string): Promise<boolean>;
//# sourceMappingURL=helpers.d.ts.map