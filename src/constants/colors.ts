/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#17172a',
    tint: '#5b63de',

    // Core surfaces
    background: '#f7f7f3',
    foreground: '#17172a',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#17172a',

    // Primary action color (buttons, links, active states)
    primary: '#5b63de',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#ebeaff',
    secondaryForeground: '#32336c',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#ecece7',
    mutedForeground: '#777783',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#dce5ff',
    accentForeground: '#30367b',

    // Destructive actions (delete, error states)
    destructive: '#d85c67',
    destructiveForeground: '#ffffff',

    // Status colors and brand accents
    success: '#62c7a4',
    warning: '#e7b664',
    mint: '#a9e6d4',

    // Borders and input outlines
    border: '#e2e2dd',
    input: '#e2e2dd',
  },

  // Border radius (in px).
  radius: 8,
};

export default colors;
