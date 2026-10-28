/**
 * colors.js
 * The Huron Brand 2026 colors offered in the app (docs/house-rules.md, section 3),
 * plus helpers for custom hex values and export file names.
 *
 * Used by the app in the browser and by the build scripts in Node, so the
 * color names in pre-rendered file names always match the app.
 *
 * To change the list: edit PALETTE below. Each color has
 *   id       lowercase, hyphens: used in file names (aubergine-700)
 *   name     shown in the app (Aubergine 700)
 *   hex      uppercase #RRGGBB
 *   footage  'light' | 'dark' | 'either': the footage it works best on
 *   note     optional short hint shown when selected
 * Families group the swatches into rows in the app.
 */

export const DEFAULT_COLOR_ID = 'aubergine-700';

export const PALETTE = [
  { family: 'Aubergine', colors: [
    { id: 'aubergine-500', name: 'Aubergine 500', hex: '#850253', footage: 'light' },
    { id: 'aubergine-700', name: 'Aubergine 700', hex: '#5D013A', footage: 'light', note: 'Brand default.' },
    { id: 'aubergine-800', name: 'Aubergine 800', hex: '#370022', footage: 'light' },
  ] },
  { family: 'White and Ecru', colors: [
    { id: 'white', name: 'White', hex: '#FFFFFF', footage: 'dark' },
    { id: 'ecru-50', name: 'Ecru 50', hex: '#F7F6F4', footage: 'dark' },
    { id: 'ecru-100', name: 'Ecru 100', hex: '#EBE9E4', footage: 'dark' },
    { id: 'ecru-200', name: 'Ecru 200', hex: '#E3E1D4', footage: 'dark', note: 'Works on Aubergine backgrounds too.' },
  ] },
  { family: 'Mint', colors: [
    { id: 'mint-300', name: 'Mint 300', hex: '#BCFFEC', footage: 'dark', note: 'Never use on light backgrounds.' },
    { id: 'mint-500', name: 'Mint 500', hex: '#70CDB3', footage: 'either' },
    { id: 'mint-700', name: 'Mint 700', hex: '#22887D', footage: 'light' },
  ] },
  { family: 'Butterscotch', colors: [
    { id: 'butterscotch-500', name: 'Butterscotch 500', hex: '#F8B808', footage: 'dark', note: 'For emphasis.' },
    { id: 'butterscotch-600', name: 'Butterscotch 600', hex: '#E79913', footage: 'either' },
    { id: 'butterscotch-700', name: 'Butterscotch 700', hex: '#9F7C2A', footage: 'light' },
  ] },
  { family: 'Guava', colors: [
    { id: 'guava-500', name: 'Guava 500', hex: '#FF3D5A', footage: 'either', note: 'Use sparingly.' },
    { id: 'guava-600', name: 'Guava 600', hex: '#D62440', footage: 'either', note: 'Use sparingly. Guava is the brand\'s action color.' },
    { id: 'guava-700', name: 'Guava 700', hex: '#A01B30', footage: 'either', note: 'Use sparingly.' },
  ] },
  { family: 'Stone', colors: [
    { id: 'stone-400', name: 'Stone 400', hex: '#9E9995', footage: 'either', note: 'Low contrast.' },
    { id: 'stone-600', name: 'Stone 600', hex: '#5D5652', footage: 'light' },
    { id: 'stone-900', name: 'Stone 900', hex: '#2B2623', footage: 'light' },
  ] },
];

/** Every palette color in one flat list. */
export const ALL_COLORS = PALETTE.flatMap((f) => f.colors);

/**
 * Turn whatever someone typed into a clean #RRGGBB, or return null.
 * Accepts 6 hex digits, with or without '#', any letter case.
 */
export function parseHex(input) {
  const s = String(input || '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(s) ? '#' + s.toUpperCase() : null;
}

/** The palette color with this hex value, if any. */
export function findPaletteColor(hex) {
  const h = parseHex(hex);
  return h ? ALL_COLORS.find((c) => c.hex === h) || null : null;
}

/**
 * Describe any hex as a color the app can use:
 * a palette color, or a custom color named custom-RRGGBB (house rules, section 5).
 */
export function describeColor(hex) {
  const h = parseHex(hex);
  if (!h) return null;
  const known = findPaletteColor(h);
  if (known) return { ...known, custom: false };
  return {
    id: 'custom-' + h.slice(1),
    name: 'Custom ' + h,
    hex: h,
    footage: relativeLuminance(h) > 0.45 ? 'dark' : 'light',
    custom: true,
  };
}

/** WCAG relative luminance, 0 (black) to 1 (white). Used to guess footage for custom colors. */
export function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
