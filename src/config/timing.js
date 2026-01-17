/**
 * Timing Configuration - TikTok Optimized V3 (Long Message Fix)
 * Based on Cognitive Science: Eye Saccade + Line Wrap Reading Time
 */

module.exports = {
    // Base Delay สำหรับเริ่มต้น
    BASE_DELAY: 0.8,
    
    // ปรับกลับเป็น 0.05 เพื่อความสบายตา
    DELAY_PER_CHAR: 0.05,         
    
    // Reaction Times
    DEFAULT_REACTION_DELAY: 0.6,  // จังหวะเปลี่ยนคน
    BURST_REACTION_DELAY: 0.4,    // คนเดิมพิมพ์ต่อ
    
    // Typing Animation
    TYPING_RATIO: 0.8,            
    
    // Video Recording
    FPS: 30,
    ENDING_BUFFER: 3,         // Standard ending delay (Requested: 3s)
    HORROR_ENDING_BUFFER: 4,  // Horror usually needs more lingering dread, let's give it 4s (or 3s provided logic checks max)
    
    // Speed Multipliers
    SPEED_MULTIPLIER: {
        fast: 0.7,
        normal: 1.0,
        slow: 1.4
    },
    
    // *** NEW: Long Message Strategy ***
    LONG_MESSAGE_THRESHOLD: 50,   // ถ้าเกิน 50 ตัวอักษร ถือว่ายาว
    LONG_MESSAGE_BONUS: 1.2,      // ให้เวลาเพิ่ม 20%
    
    // Delay Limits (ปลดล็อคเพดาน)
    MIN_DELAY: 1.2,   // กันข้อความสั้นหาย
    MAX_DELAY: 7.0    // เพิ่มจาก 4.5 -> 7.0 ให้ข้อความยาวโชว์ครบ
};
