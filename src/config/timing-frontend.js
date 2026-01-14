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
        // Fallback defaults if API fails
        window.TIMING_CONFIG = {
            BASE_DELAY: 1.0,
            DELAY_PER_CHAR: 0.05,
            DEFAULT_REACTION_DELAY: 0.8,
            TYPING_RATIO: 0.8,
            FPS: 30,
            ENDING_BUFFER: 2
        };
    }
})();
