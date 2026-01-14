/**
 * Timing Configuration - Single Source of Truth
 * Change values here to update defaults across the entire application
 */

module.exports = {
    // Delay Calculation
    BASE_DELAY: 1.0,              // Base typing delay (seconds)
    DELAY_PER_CHAR: 0.05,         // Additional delay per character (seconds)
    
    // Reaction Time (pause before typing starts)
    DEFAULT_REACTION_DELAY: 0.8,  // Default reaction delay (seconds)
    
    // Typing Animation Ratio
    TYPING_RATIO: 0.8,            // 80% typing, 20% pause before send
    
    // Video Recording
    FPS: 30,
    ENDING_BUFFER: 2              // Extra seconds at end of video
};
