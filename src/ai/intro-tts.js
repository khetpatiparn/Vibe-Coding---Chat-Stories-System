/**
 * Intro TTS Service
 * Uses Google Cloud Text-to-Speech to generate intro voice for room names
 */

require('dotenv').config();
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs-extra');
const path = require('path');

// Directory for saving intro audio files
const INTROS_DIR = path.join(__dirname, '../../assets/intros');

// Initialize client
let client = null;

function getClient() {
    if (!client) {
        client = new textToSpeech.TextToSpeechClient();
    }
    return client;
}

// Audio config presets by category mood
const AUDIO_PRESETS = {
    // All categories use default natural voice
    funny: { speakingRate: 1.0, pitch: 0.0 },
    gossip: { speakingRate: 1.0, pitch: 0.0 },
    natural: { speakingRate: 1.0, pitch: 0.0 },
    office: { speakingRate: 1.0, pitch: 0.0 },
    
    // Serious/Drama - slow & low pitch
    horror: { speakingRate: 0.85, pitch: -4.0 },
    drama: { speakingRate: 0.9, pitch: -2.0 },
    love: { speakingRate: 0.95, pitch: 0.0 },
    
    // Default
    default: { speakingRate: 1.0, pitch: 0.0 }
};

/**
 * Get audio config based on category
 */
function getAudioConfig(category) {
    const preset = AUDIO_PRESETS[category?.toLowerCase()] || AUDIO_PRESETS.default;
    
    return {
        audioEncoding: 'MP3',
        speakingRate: preset.speakingRate,
        pitch: preset.pitch
    };
}

/**
 * Generate intro TTS for room name
 * @param {string} roomName - The room name to speak
 * @param {number} projectId - Project ID for file naming
 * @param {string} category - Story category for mood-based voice adjustment
 * @returns {Promise<{audioPath: string, duration: number}>}
 */
async function generateIntroTTS(roomName, projectId, category = 'default') {
    console.log(`🎙️ Generating intro TTS for: "${roomName}" (${category})`);
    
    // Horror/Drama categories: text-only intro (no voice)
    if (category && (category.toLowerCase() === 'horror' || category.toLowerCase() === 'drama')) {
        console.log(`🔇 Category '${category}' uses text-only intro (no voice).`);
        return {
            audioPath: null,
            duration: 0,
            textOnly: true
        };
    }

    if (!roomName || roomName.trim().length === 0) {
        console.log('⚠️ No room name provided, skipping intro TTS');
        return null;
    }
    
    try {
        // Ensure intros directory exists
        await fs.ensureDir(INTROS_DIR);
        
        const ttsClient = getClient();
        
        // Prepare request
        const request = {
            input: { text: roomName },
            voice: {
                languageCode: 'th-TH',
                name: 'th-TH-Standard-A' // Robot-like voice
            },
            audioConfig: getAudioConfig(category)
        };
        
        // Generate speech
        const [response] = await ttsClient.synthesizeSpeech(request);
        
        // Save audio file
        const filename = `intro_${projectId}.mp3`;
        const filePath = path.join(INTROS_DIR, filename);
        
        await fs.writeFile(filePath, response.audioContent, 'binary');
        console.log(`  ✅ Saved intro: ${filename}`);
        
        // Estimate duration (rough: ~100ms per character for Thai)
        const estimatedDuration = Math.max(1.5, roomName.length * 0.1);
        
        // Return relative path
        const relativePath = `assets/intros/${filename}`;
        
        return {
            audioPath: relativePath,
            duration: estimatedDuration
        };
        
    } catch (error) {
        console.error('❌ Intro TTS generation failed:', error.message);
        return null;
    }
}

module.exports = {
    generateIntroTTS,
    getAudioConfig,
    AUDIO_PRESETS
};
