/**
 * Video Recorder - Frame-Synced Rendering
 * Puppeteer controls the time, visualizer displays messages based on that time
 */

const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// ============================================
// Configuration
// ============================================
// ============================================
// Configuration
// ============================================
const CONFIG = {
    width: 1080,
    height: 1920,
    fps: 30,
    framesDir: './output/frames',
    outputDir: './output',
    endingBuffer: 2, // Extra seconds after last message
    // Delay Settings
    baseDelay: 1.0, 
    delayPerChar: 0.05,
    typingRatio: 0.8
};

// ============================================
// Calculate Timeline from Story
// ============================================
function calculateTimeline(story) {
    const timeline = [];
    let currentTime = 1.0; // Start with small buffer
    
    if (!story.dialogues || story.dialogues.length === 0) {
        return { timeline: [], totalDuration: 5 };
    }
    
    for (let i = 0; i < story.dialogues.length; i++) {
        const dialogue = story.dialogues[i];
        
        // Calculate delay
        let delay = dialogue.delay;
        if (!delay) {
             const charCount = dialogue.message ? dialogue.message.length : 0;
             delay = CONFIG.baseDelay + (charCount * CONFIG.delayPerChar);
        }
        // Ensure minimum delay
        delay = Math.max(delay, 0.5);

        // 80/20 Rule
        const typingDuration = delay * CONFIG.typingRatio;
        const typingStart = currentTime;
        const typingEnd = currentTime + typingDuration;
        const appearTime = currentTime + delay;
        
        timeline.push({
            index: i,
            typingStart: typingStart,
            typingEnd: typingEnd,
            appearTime: appearTime,
            dialogue: dialogue
        });
        
        currentTime += delay;
    }
    
    const totalDuration = currentTime + CONFIG.endingBuffer;
    
    console.log(`Timeline: ${timeline.length} messages over ${totalDuration.toFixed(1)} seconds`);
    
    return { timeline, totalDuration };
}

// ============================================
// Frame Capture (Mobile Emulation Mode)
// ============================================
async function captureFrames(story, outputName = 'story') {
    const framesDir = path.join(CONFIG.framesDir, outputName);
    await fs.ensureDir(framesDir);
    await fs.emptyDir(framesDir);
    
    // Calculate timeline
    const { timeline, totalDuration } = calculateTimeline(story);
    const totalFrames = Math.ceil(totalDuration * CONFIG.fps);
    
    console.log(`\nWill capture ${totalFrames} frames (${totalDuration.toFixed(1)}s at ${CONFIG.fps} FPS)`);
    console.log('Launching browser in Mobile Emulation Mode...');
    
    const browser = await puppeteer.launch({
        headless: 'new', // Use 'new' for latest puppeteer
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });
    
    const page = await browser.newPage();
    
    // 🚀 KEY FIX 1: Mobile Emulation
    // ตั้งค่าเป็นจอ มือถือ (360x640) แต่คูณความชัด 3 เท่า (Scale 3)
    // 360 * 3 = 1080px (Width)
    // 640 * 3 = 1920px (Height)
    // ผลลัพธ์: ได้ไฟล์ 1080x1920 ที่ตัวหนังสือใหญ่เท่ามือถือจริง
    await page.setViewport({
        width: 360,
        height: 640,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true
    });
    
    // 🚀 KEY FIX: Inject story data BEFORE page loads (avoids URL length limits)
    // This allows large image data to be passed without URL encoding issues
    await page.evaluateOnNewDocument((storyData, timelineData) => {
        window.__INJECTED_STORY__ = storyData;
        window.__INJECTED_TIMELINE__ = timelineData;
        window.__INJECTED_MODE__ = true;
    }, story, timeline);
    
    // Load visualizer without story data in URL
    const cacheBuster = Date.now();
    console.log('Loading visualizer page...');
    await page.goto(`http://localhost:3000/visualizer/index.html?injectMode=true&v=${cacheBuster}`, {
        waitUntil: 'networkidle0',
        timeout: 60000
    });
    
    // 🚀 KEY FIX 2: Force Full Screen via Injection
    await page.addStyleTag({
        content: `
            body, body.rendering {
                background: #e5ddd5 !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: hidden !important;
            }
            #phone-frame, body.rendering #phone-frame {
                width: 100vw !important;
                height: 100vh !important;
                max-width: none !important;
                max-height: none !important;
                margin: 0 !important;
                border-radius: 0 !important;
                box-shadow: none !important;
            }
            .message-bubble {
                font-size: 0.95rem !important;
            }
            #chat-container {
                padding-bottom: 150px !important;
                padding-right: 15px !important;
            }
            #chat-header {
                padding-top: 80px !important;
                padding-bottom: 15px !important;
                height: auto !important;
            }
            .chat-image {
                max-width: 100%;
                height: auto;
                border-radius: 8px;
                display: block;
                margin: 0 auto;
            }
        `
    });
    
    console.log('✅ Mobile emulation & Full-screen CSS injected');
    
    // Initialize the timeline mode via page.evaluate
    await page.evaluate(() => {
        if (window.__INJECTED_MODE__ && window.__INJECTED_STORY__ && window.__INJECTED_TIMELINE__) {
            const storyData = window.__INJECTED_STORY__;
            const timeline = window.__INJECTED_TIMELINE__;
            
            // Create ChatStory instance
            const story = new ChatStory(storyData);
            
            // Track which messages have been shown
            let shownMessages = new Set();
            
            // Function for Puppeteer to call with current time
            window.setCurrentTime = function(currentTime) {
                let isAnyTyping = false;
                let typingChar = null;

                for (const item of timeline) {
                    // 1. Show Messages
                    if (currentTime >= item.appearTime && !shownMessages.has(item.index)) {
                        shownMessages.add(item.index);
                        const dialogue = storyData.dialogues[item.index];
                        const senderChar = storyData.characters[dialogue.sender];
                        story.addMessage(dialogue, senderChar);
                        story.scrollToBottom();
                        console.log(`[${currentTime.toFixed(1)}s] Showing message ${item.index + 1}`);
                    }
                    
                    // 2. Check for Typing Status (80% phase)
                    if (currentTime >= item.typingStart && currentTime < item.typingEnd) {
                        const dialogue = storyData.dialogues[item.index];
                        const senderChar = storyData.characters[dialogue.sender];
                        
                        // Only show typing for LEFT side
                        if (senderChar && senderChar.side === 'left') {
                            isAnyTyping = true;
                            typingChar = senderChar;
                        }
                    }
                }
                
                // Update Typing UI
                const typingIndicator = document.getElementById('typing-indicator');
                if (isAnyTyping) {
                    typingIndicator.classList.remove('hidden');
                    // Update avatar
                    const avatarImg = document.querySelector('.typing-avatar img');
                    if (avatarImg && typingChar) {
                        // Resolve path logic (basic)
                        let avatarSrc = typingChar.avatar;
                        if (avatarSrc && avatarSrc.startsWith('assets')) avatarSrc = '/' + avatarSrc;
                        if (avatarImg.src !== avatarSrc && !avatarImg.src.endsWith(avatarSrc)) {
                             avatarImg.src = avatarSrc;
                        }
                    }
                } else {
                    typingIndicator.classList.add('hidden');
                }
            };
            
            // Signal ready
            window.timelineReady = true;
            console.log('Inject mode: Timeline ready');
        }
    });
    
    // Wait for visualizer to be ready
    await page.waitForFunction(() => window.timelineReady === true, { timeout: 15000 });
    
    // Capture Loop
    console.log('Starting capture...');
    let frameCount = 0;
    
    for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame / CONFIG.fps;
        
        await page.evaluate((time) => {
            if (window.setCurrentTime) window.setCurrentTime(time);
        }, currentTime);
        
        // Small delay for rendering
        // await new Promise(r => setTimeout(r, 10)); // Optional: Enable if frames glitch
        
        const framePath = path.join(framesDir, `frame_${String(frameCount).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' }); // Screenshot will be 1080x1920 due to scale factor 3
        frameCount++;
        
        if (frame % CONFIG.fps === 0) {
            console.log(`Capturing: ${Math.floor(currentTime)}s / ${totalDuration.toFixed(1)}s`);
        }
    }
    
    await browser.close();
    return { framesDir, frameCount };
}

// ============================================
// Assemble Video with FFmpeg
// ============================================
async function assembleVideo(framesDir, outputName = 'story', audioOptions = {}) {
    const outputPath = path.join(CONFIG.outputDir, `${outputName}.mp4`);
    const framePattern = path.join(framesDir, 'frame_%06d.png');
    
    await fs.ensureDir(CONFIG.outputDir);
    
    const { bgMusicPath, sfxPath, timeline, bgmVolume = 0.3, sfxVolume = 0.5 } = audioOptions;
    
    return new Promise((resolve, reject) => {
        console.log('Assembling video...');
        
        let command = ffmpeg()
            .input(framePattern)
            .inputFPS(CONFIG.fps);
        
        // If we have both BGM and SFX with timeline, use complex filter
        if (bgMusicPath && fs.existsSync(bgMusicPath) && sfxPath && fs.existsSync(sfxPath) && timeline && timeline.length > 0) {
            console.log('Mixing BGM and SFX at dialogue timestamps...');
            console.log(`BGM Volume: ${bgmVolume}, SFX Volume: ${sfxVolume}`);
            
            // Add BGM input
            command.input(bgMusicPath);
            
            // For SFX, we need to overlay at each dialogue timestamp
            // Create filter complex string - use volume directly (1.0 = 100%)
            let filterComplex = `[1:a]volume=${bgmVolume}[bgm];`;
            let mixInputs = '[bgm]';
            
            // Add SFX input once, we'll use adelay to offset copies
            command.input(sfxPath);
            
            // Create delayed copies of SFX for each dialogue
            const sfxCount = Math.min(timeline.length, 20);
            for (let i = 0; i < sfxCount; i++) {
                const delayMs = Math.round(timeline[i].appearTime * 1000);
                filterComplex += `[2:a]adelay=${delayMs}|${delayMs},volume=${sfxVolume}[sfx${i}];`;
                mixInputs += `[sfx${i}]`;
            }
            
            // Mix all audio together
            // IMPORTANT: normalize=0 prevents amix from dividing volume by number of inputs
            // This makes render volume match preview volume
            filterComplex += `${mixInputs}amix=inputs=${sfxCount + 1}:duration=first:dropout_transition=0:normalize=0[aout]`;
            
            command
                .complexFilter(filterComplex)
                .outputOptions([
                    '-map', '0:v',
                    '-map', '[aout]',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'fast',
                    '-crf', '23',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-shortest'
                ]);
        } else if (bgMusicPath && fs.existsSync(bgMusicPath)) {
            // BGM only
            command = command
                .input(bgMusicPath)
                .outputOptions([
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'fast',
                    '-crf', '23',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-shortest',
                    '-filter:a', `volume=${bgmVolume}`
                ]);
        } else {
            // No audio
            command.outputOptions([
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'fast',
                '-crf', '23'
            ]);
        }
        
        command
            .output(outputPath)
            .on('start', (cmd) => console.log('FFmpeg:', cmd))
            .on('progress', (p) => p.percent && console.log(`Processing: ${Math.round(p.percent)}%`))
            .on('error', (err) => { console.error('FFmpeg error:', err); reject(err); })
            .on('end', () => { console.log(`Video saved: ${outputPath}`); resolve(outputPath); })
            .run();
    });
}

// ============================================
// Full Recording Pipeline
// ============================================
async function recordStory(story, options = {}) {
    const outputName = options.outputName || story.title?.replace(/[^a-zA-Z0-9ก-๙]/g, '_') || 'story';
    
    try {
        const { framesDir, frameCount } = await captureFrames(story, outputName);
        
        if (frameCount === 0) throw new Error('No frames captured');
        
        // Calculate timeline for SFX placement
        const { timeline } = calculateTimeline(story);
        
        // Pass audio options to assembleVideo
        const audioOptions = {
            bgMusicPath: options.bgMusicPath,
            sfxPath: options.sfxPath,
            bgmVolume: options.bgmVolume || 0.3,
            sfxVolume: options.sfxVolume || 0.5,
            timeline: timeline
        };
        
        const videoPath = await assembleVideo(framesDir, outputName, audioOptions);
        
        if (!options.keepFrames) {
            await fs.remove(framesDir);
            console.log('Cleaned up frames');
        }
        
        return videoPath;
    } catch (error) {
        console.error('Recording failed:', error);
        throw error;
    }
}

// ============================================
// Exports
// ============================================
module.exports = { captureFrames, assembleVideo, recordStory, calculateTimeline, CONFIG };

// CLI Test
if (require.main === module) {
    const testStory = {
        title: "Test",
        characters: { a: { name: "A", side: "left" }, b: { name: "B", side: "right" } },
        dialogues: [
            { sender: "a", message: "Hello!", delay: 1.5 },
            { sender: "b", message: "Hi there! 😊", delay: 1.5 }
        ]
    };
    recordStory(testStory, { keepFrames: true }).then(p => console.log('Done:', p)).catch(console.error);
}
