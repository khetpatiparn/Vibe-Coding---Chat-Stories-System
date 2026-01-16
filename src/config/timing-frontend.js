/**
 * Timing Configuration Loader - Synchronous XHR Loading
 * This ensures config is available before any other script runs
 */

(function() {
    // Load timing config synchronously from API
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/config/timing', false); // false = synchronous
        xhr.send();
        
        if (xhr.status === 200) {
            window.TIMING_CONFIG = JSON.parse(xhr.responseText);
            console.log('✅ Timing config loaded:', window.TIMING_CONFIG);
        } else {
            throw new Error('API returned ' + xhr.status);
        }
    } catch (error) {
        console.warn('⚠️ Using fallback timing config:', error.message);
        // Fallback defaults - MUST MATCH timing.js V3 (Long Message Fix)
        window.TIMING_CONFIG = {
            BASE_DELAY: 0.8,
            DELAY_PER_CHAR: 0.05,
            DEFAULT_REACTION_DELAY: 0.6,
            BURST_REACTION_DELAY: 0.4,
            TYPING_RATIO: 0.8,
            FPS: 30,
            ENDING_BUFFER: 2,
            SPEED_MULTIPLIER: { fast: 0.7, normal: 1.0, slow: 1.4 },
            LONG_MESSAGE_THRESHOLD: 50,
            LONG_MESSAGE_BONUS: 1.2,
            MIN_DELAY: 1.2,
            MAX_DELAY: 7.0
        };
    }
})();
