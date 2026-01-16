/**
 * AutoChat Studio Pro - Theme Configuration
 * Defines available themes and category mappings
 */

const THEMES = {
    DEFAULT: 'default',
    HORROR: 'horror'
};

// Map categories to themes
const CATEGORY_THEME_MAP = {
    'horror': THEMES.HORROR,
    'ghost': THEMES.HORROR,
    'scary': THEMES.HORROR,
    'thriller': THEMES.HORROR,
    'creepy': THEMES.HORROR,
    // All others default to THEMES.DEFAULT
};

module.exports = {
    THEMES,
    CATEGORY_THEME_MAP
};
