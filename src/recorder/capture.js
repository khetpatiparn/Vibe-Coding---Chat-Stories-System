/**
 * Video Recorder - Frame-Synced Rendering
 * Fixed: CSS Animation Sync for 'Fast Forward' issue
 */

const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');
const TIMING = require('../config/timing');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// ============================================
// Configuration
// ============================================
const CONFIG = {
    width: 1080,
    height: 1920,
    fps: 30,
    framesDir: './output/frames',
    outputDir: './output',
    endingBuffer: 2,
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
    let currentTime = 1.0;
    
    if (!story.dialogues || story.dialogues.length === 0) {
        return { timeline: [], totalDuration: 5 };
    }
    
    for (let i = 0; i < story.dialogues.length; i++) {
        const dialogue = story.dialogues[i];
        
        // 1. Reaction Time
        const reaction = (dialogue.reaction_delay !== undefined && dialogue.reaction_delay !== null) 
                         ? parseFloat(dialogue.reaction_delay) 
                         : TIMING.DEFAULT_REACTION_DELAY;
        
        // 2. Typing Duration
        let typingTotal = dialogue.delay;
        
        // Time Divider Fixed Duration (Effect time)
        if (dialogue.sender === 'time_divider') {
            typingTotal = 2.5; // 2s display + transitions
        } else if (!typingTotal) {
             const charCount = dialogue.message ? dialogue.message.length : 0;
             typingTotal = CONFIG.baseDelay + (charCount * CONFIG.delayPerChar);
        }
        
        const typingDuration = typingTotal * CONFIG.typingRatio;
        const typingStart = currentTime + reaction;
        const typingEnd = typingStart + typingDuration;
        const appearTime = currentTime + reaction + typingTotal;
        
        timeline.push({
            index: i,
            typingStart: typingStart,
            typingEnd: typingEnd,
            appearTime: appearTime,
            dialogue: dialogue
        });
        
        currentTime += (reaction + typingTotal);
    }
    
    // Determine ending buffer based on theme
    const endingBuffer = (story.theme === 'horror' || story.theme === 'drama') 
        ? TIMING.HORROR_ENDING_BUFFER 
        : TIMING.ENDING_BUFFER;

    const totalDuration = currentTime + endingBuffer;
    return { timeline, totalDuration };
}

// ============================================
// Frame Capture
// ============================================
async function captureFrames(story, outputName = 'story') {
    const framesDir = path.join(CONFIG.framesDir, outputName);
    await fs.ensureDir(framesDir);
    await fs.emptyDir(framesDir);
    
    const { timeline, totalDuration } = calculateTimeline(story);
    const totalFrames = Math.ceil(totalDuration * CONFIG.fps);
    
    console.log(`\nCapturing ${totalFrames} frames (${totalDuration.toFixed(1)}s)...`);
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Mobile Emulation (1080x1920 via Scale 3)
    await page.setViewport({
        width: 360,
        height: 640,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true
    });
    
    // Inject Data
    await page.evaluateOnNewDocument((storyData, timelineData) => {
        window.__INJECTED_STORY__ = storyData;
        window.__INJECTED_TIMELINE__ = timelineData;
        window.__INJECTED_MODE__ = true;
    }, story, timeline);
    
    // Load Visualizer
    const cacheBuster = Date.now();
    await page.goto(`http://localhost:3000/visualizer/index.html?injectMode=true&v=${cacheBuster}`, {
        waitUntil: 'networkidle0',
        timeout: 60000
    });
    
    // ✅ FIX: Inject CSS to disable transitions and control time
    await page.addStyleTag({
        content: `
            *, *::before, *::after {
                animation-play-state: paused !important; /* Control via delay */
            }
            .cinematic-bar, #camera-wrapper {
                transition: none !important; /* Manual control during render */
            }
        `
    });

    // ✅ FIX 1: Inject CSS to PAUSE animations
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
            .message-bubble { font-size: 0.95rem !important; }
            #chat-container { padding-bottom: 150px !important; padding-right: 15px !important; }
            #chat-header { padding-top: 60px !important; padding-bottom: 15px !important; height: auto !important; }
            .chat-image { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto; }

            /* 🛑 FREEZE ANIMATIONS FOR SYNC */
            .typing-bubble .dot { animation-play-state: paused !important; }
            .message { animation-play-state: paused !important; }
            
            /* Time Divider Overlay - No Transition in Render */
            .time-divider-overlay { transition: none !important; }
        `
    });
    
    // Initialize & Sync Logic
    await page.evaluate(() => {
        if (window.__INJECTED_MODE__ && window.__INJECTED_STORY__) {
            const storyData = window.__INJECTED_STORY__;
            const timeline = window.__INJECTED_TIMELINE__;
            
            const story = new ChatStory(storyData);
            let shownMessages = new Set();
            
            // ✅ FIX 2: Monkey-patch addMessage to track appear time
            const originalAddMessage = story.addMessage.bind(story);
            story.addMessage = function(item, char) {
                originalAddMessage(item, char);
                const lastMsg = this.container.lastElementChild;
                if (lastMsg) {
                    lastMsg.dataset.appearTime = window.currentFrameTime || 0;
                    lastMsg.style.animationPlayState = 'paused'; // Ensure paused immediately
                }
            };

            window.setCurrentTime = function(currentTime) {
                window.currentFrameTime = currentTime;
                let isAnyTyping = false;
                let typingChar = null;

                for (const item of timeline) {
                    // Show Messages
                    if (currentTime >= item.appearTime && !shownMessages.has(item.index)) {
                        shownMessages.add(item.index);
                        const dialogue = storyData.dialogues[item.index];
                        const senderChar = storyData.characters[dialogue.sender];
                        story.addMessage(dialogue, senderChar);
                        story.scrollToBottom();
                    }
                    
                    // ✅ SYNC 3: Sync Video Elements (MP4 Giphys)
                    const videos = document.querySelectorAll('video.giphy-video');
                    videos.forEach(v => {
                        const appearTime = parseFloat(v.closest('.message').dataset.appearTime || 0);
                        const relativeTime = currentTime - appearTime;
                        
                        if (relativeTime >= 0) {
                            // Ensure video loops correctly based on its duration
                            // Note: duration might be NaN if not loaded, handle gracefully
                            if (v.duration && v.duration > 0) {
                                v.currentTime = relativeTime % v.duration;
                            } else {
                                v.currentTime = 0;
                            }
                        }
                    });

                    // Check Typing
                    if (currentTime >= item.typingStart && currentTime < item.typingEnd) {
                        const dialogue = storyData.dialogues[item.index];
                        const senderChar = storyData.characters[dialogue.sender];
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
                    const avatarImg = document.querySelector('.typing-avatar img');
                    if (avatarImg && typingChar) {
                        let avatarSrc = typingChar.avatar;
                        if (avatarSrc && avatarSrc.startsWith('assets')) avatarSrc = '/' + avatarSrc;
                        if (!avatarImg.src.endsWith(avatarSrc)) avatarImg.src = avatarSrc;
                    }
                    
                    // ✅ FIX 3: Manually Advance Typing Dots
                    // Loop 1.4s (from style.css)
                    const dots = document.querySelectorAll('.typing-bubble .dot');
                    dots.forEach((dot, index) => {
                        // Stagger: 0s, 0.2s, 0.4s
                        const stagger = index * 0.2;
                        // Seek animation to current time
                        dot.style.animationDelay = `calc(-${currentTime}s + ${stagger}s)`;
                    });

                } else {
                    typingIndicator.classList.add('hidden');
                }

                // ✅ FIX 4: Manually Advance Message Pop-in & Cinematic Focus
                let isCinematic = false;
                
                // Check Cinematic Focus Window (2.5s duration)
                for (const item of timeline) {
                    if (item.dialogue.camera_effect === 'zoom_in' && 
                        currentTime >= item.appearTime && 
                        currentTime < (item.appearTime + 2.5)) {
                        isCinematic = true;
                        break;
                    }
                }

                // Apply Cinematic State Manually
                const camTop = document.getElementById('cinematic-bar-top');
                const camBottom = document.getElementById('cinematic-bar-bottom');
                const wrapper = document.getElementById('camera-wrapper');

                if (isCinematic) {
                    if(camTop) camTop.style.height = '15%';
                    if(camBottom) camBottom.style.height = '15%';
                    if(wrapper) {
                        wrapper.style.transform = 'scale(1.15) translateY(-5%)';
                        wrapper.style.filter = 'contrast(1.1) saturate(1.2)';
                    }
                } else {
                    if(camTop) camTop.style.height = '0%';
                    if(camBottom) camBottom.style.height = '0%';
                    if(wrapper) {
                        wrapper.style.transform = 'none';
                        wrapper.style.filter = 'none';
                    }
                }

                // Time Divider Overlay Check
                let activeOverlay = false;
                let overlayText = '';
                
                for (const item of timeline) {
                    if (item.dialogue.sender === 'time_divider') {
                        if (currentTime >= item.typingStart && currentTime < item.appearTime) {
                            activeOverlay = true;
                            overlayText = item.dialogue.message;
                            break;
                        }
                    }
                }
                
                // Apply Time Divider Overlay State
                let overlay = document.getElementById('time-divider-overlay');
                if (activeOverlay) {
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.id = 'time-divider-overlay';
                        overlay.className = 'time-divider-overlay active';
                        document.body.appendChild(overlay);
                    }
                    overlay.innerText = overlayText;
                    overlay.style.opacity = '1';
                } else {
                    if (overlay) overlay.style.opacity = '0';
                }

                document.querySelectorAll('.message').forEach(msg => {
                    const appearTime = parseFloat(msg.dataset.appearTime || 0);
                    const elapsed = currentTime - appearTime;
                    if (elapsed >= 0) {
                        msg.style.animationDelay = `-${elapsed}s`;
                    }
                });
            };
            
            window.timelineReady = true;
        }
    });
    
    await page.waitForFunction(() => window.timelineReady === true, { timeout: 15000 });
    
    // Capture Loop
    for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame / CONFIG.fps;
        await page.evaluate((time) => window.setCurrentTime(time), currentTime);
        
        // const framePath = path.join(framesDir, `frame_${String(frame).padStart(6, '0')}.png`);
        // await page.screenshot({ path: framePath, type: 'png' });
        // บรรทัด 219-220 (ลบอันเก่า ใส่ 2 บรรทัดนี้แทน)
        const framePath = path.join(framesDir, `frame_${String(frame).padStart(6, '0')}.jpg`);
        await page.screenshot({ path: framePath, type: 'jpeg', quality: 90 });
        
        if (frame % 30 === 0) process.stdout.write(`\rRecording: ${currentTime.toFixed(1)}s / ${totalDuration.toFixed(1)}s`);
    }
    
    console.log('\nFrame capture complete.');
    await browser.close();
    return { framesDir, frameCount: totalFrames };
}

// ============================================
// Assemble Video
// ============================================
async function assembleVideo(framesDir, outputName = 'story', audioOptions = {}) {
    const outputPath = path.join(CONFIG.outputDir, `${outputName}.mp4`);
    const framePattern = path.join(framesDir, 'frame_%06d.jpg');

    await fs.ensureDir(CONFIG.outputDir);
    
    const { bgMusicPath, sfxPath, timeline, bgmVolume = 0.3, sfxVolume = 0.5, totalDuration } = audioOptions;
    
    return new Promise((resolve, reject) => {
        console.log(`Assembling video... (duration: ${totalDuration?.toFixed(1) || '?'}s)`);
        
        let command = ffmpeg()
            .input(framePattern)
            .inputFPS(CONFIG.fps);
        
        if (bgMusicPath && fs.existsSync(bgMusicPath) && sfxPath && fs.existsSync(sfxPath) && timeline && timeline.length > 0) {
            // ✅ Loop BGM to cover entire video
            command.input(bgMusicPath)
                .inputOptions(['-stream_loop', '-1']);
            command.input(sfxPath);
            
            let filterComplex = `[1:a]volume=${bgmVolume}[bgm];`;
            let mixInputs = '[bgm]';
            
            const sfxCount = Math.min(timeline.length, 30);
            for (let i = 0; i < sfxCount; i++) {
                const delayMs = Math.round(timeline[i].appearTime * 1000);
                filterComplex += `[2:a]adelay=${delayMs}|${delayMs},volume=${sfxVolume}[sfx${i}];`;
                mixInputs += `[sfx${i}]`;
            }
            
            // ✅ FIX: Use duration=first to match video length (video is input 0)
            filterComplex += `${mixInputs}amix=inputs=${sfxCount + 1}:duration=first:dropout_transition=0:normalize=0[aout]`;
            
            command
                .complexFilter(filterComplex)
                .outputOptions(['-map', '0:v', '-map', '[aout]']);
        } else if (bgMusicPath && fs.existsSync(bgMusicPath)) {
            // BGM only - loop and use -shortest to cut at video end
            command.input(bgMusicPath)
                .inputOptions(['-stream_loop', '-1'])
                .outputOptions(['-filter:a', `volume=${bgmVolume}`]);
        }
        
        // ✅ FIX: Use -t to set exact video duration (prevents infinite loop)
        const outputOpts = [
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k'
        ];
        
        // Add duration limit if we know the total duration
        if (totalDuration) {
            outputOpts.push('-t', totalDuration.toFixed(2));
        }
        
        // Use -shortest as fallback safety
        outputOpts.push('-shortest');
        
        command
            .outputOptions(outputOpts)
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .run();
    });
}

// ============================================
// Exports
// ============================================
async function recordStory(story, options = {}) {
    const outputName = options.outputName || 'story';
    try {
        const { framesDir } = await captureFrames(story, outputName);
        const { timeline, totalDuration } = calculateTimeline(story);
        
        const audioOptions = {
            bgMusicPath: options.bgMusicPath,
            sfxPath: options.sfxPath,
            bgmVolume: options.bgmVolume,
            sfxVolume: options.sfxVolume,
            timeline: timeline,
            totalDuration: totalDuration  // ✅ NEW: Pass total duration to assembleVideo
        };
        
        const videoPath = await assembleVideo(framesDir, outputName, audioOptions);
        if (!options.keepFrames) await fs.remove(framesDir);
        
        return videoPath;
    } catch (error) {
        console.error('Recording failed:', error);
        throw error;
    }
}

module.exports = { recordStory, calculateTimeline, CONFIG };