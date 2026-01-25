/**
 * Video Recorder - Frame-Synced Rendering
 * Fixed: CSS Animation Sync for 'Fast Forward' issue
 */

const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const TIMING = require('../config/timing');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Helper to get audio duration safely
function getAudioDuration(filePath) {
    return new Promise((resolve) => {
        if (!filePath || !fs.existsSync(filePath)) return resolve(0);
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.warn(`ffprobe failed for ${filePath}, using default duration.`);
                return resolve(0);
            }
            resolve(metadata.format.duration || 0);
        });
    });
}

// ============================================
// Configuration
// ============================================
const CONFIG = {
    width: 1080,
    height: 1920,
    fps: 30,
    framesDir: './output/frames',
    outputDir: './output/03_Drafts',
    endingBuffer: 2,
    // Delay Settings
    baseDelay: 1.0, 
    delayPerChar: 0.05,
    typingRatio: 0.8
};

// ============================================
// Open Output Folder (Windows)
// ============================================
function openOutputFolder(videoPath) {
    const absolutePath = path.resolve(videoPath);
    const folderPath = path.dirname(absolutePath);
    
    console.log(`📂 Opening folder: ${folderPath}`);
    
    // Simple approach: just open the folder
    exec(`start "" "${folderPath}"`, (error) => {
        if (error) {
            console.log('📂 Could not open folder:', error.message);
        }
    });
}

// ============================================
// Calculate Timeline from Story
// ============================================
async function calculateTimeline(story) {
    const timeline = [];
    
    // ============================================
    // INTRO TIMING (IMPROVED)
    // Timeline: [DELAY_BEFORE] -> [FADE_IN + TTS] -> [BUFFER_AFTER] -> CHAT
    // ============================================
    const INTRO_DELAY_BEFORE = TIMING.INTRO_DELAY_BEFORE || 1.0;  // รอ 1 วิ ก่อนแสดงชื่อ
    const INTRO_FADE_IN = TIMING.INTRO_FADE_IN || 0.5;            // Fade in 0.5 วิ
    const INTRO_BUFFER_AFTER = TIMING.INTRO_BUFFER_AFTER || 1.5;  // ค้าง 1.5 วิ หลัง TTS
    const INTRO_MIN_DURATION = TIMING.INTRO_MIN_DURATION || 2.0;  // ถ้าไม่มี TTS
    
    let introDuration = 0;
    let ttsDuration = 0;
    const isHorror = story.theme === 'horror' || (story.category && (story.category.toLowerCase() === 'horror' || story.category.toLowerCase() === 'drama'));
    
    if (isHorror) {
        // Horror: Text-only intro with simple timing
        introDuration = INTRO_DELAY_BEFORE + INTRO_MIN_DURATION + INTRO_BUFFER_AFTER;
        ttsDuration = 0;
    } else if (story.intro_path) {
        // Normal: Measure TTS audio file
        ttsDuration = await getAudioDuration(story.intro_path);
        ttsDuration = ttsDuration > 0 ? ttsDuration : INTRO_MIN_DURATION;
        
        // Total = delay before + TTS duration + buffer after
        introDuration = INTRO_DELAY_BEFORE + ttsDuration + INTRO_BUFFER_AFTER;
    } else {
        // No TTS: use minimum duration
        introDuration = INTRO_DELAY_BEFORE + INTRO_MIN_DURATION + INTRO_BUFFER_AFTER;
        ttsDuration = 0;
    }
    
    // Store timing breakdown for render use
    const introTiming = {
        delayBefore: INTRO_DELAY_BEFORE,
        fadeIn: INTRO_FADE_IN,
        ttsDuration: ttsDuration,
        bufferAfter: INTRO_BUFFER_AFTER,
        total: introDuration
    };
    
    console.log(`⏱️ Intro Timing:`);
    console.log(`   - Delay Before: ${INTRO_DELAY_BEFORE}s`);
    console.log(`   - TTS Duration: ${ttsDuration.toFixed(2)}s`);
    console.log(`   - Buffer After: ${INTRO_BUFFER_AFTER}s`);
    console.log(`   - Total Intro:  ${introDuration.toFixed(2)}s`);

    let currentTime = introDuration; // Start chat immediately after intro (first message handles timing)
    
    if (!story.dialogues || story.dialogues.length === 0) {
        return { timeline: [], totalDuration: introDuration + 2 };
    }
    
    for (let i = 0; i < story.dialogues.length; i++) {
        const dialogue = story.dialogues[i];
        const isFirstMessage = i === 0;
        
        // Get character side for timing logic
        const senderChar = story.characters?.[dialogue.sender];
        const isLeft = senderChar?.side === 'left';
        
        // 1. Reaction Time (first message: no reaction delay)
        let reaction = (dialogue.reaction_delay !== undefined && dialogue.reaction_delay !== null) 
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
        
        // First message special timing: no reaction delay
        // Left (others): 1s typing, Right (me): 0.5s wait
        if (isFirstMessage) {
            reaction = 0;
            typingTotal = isLeft ? 1.0 : 0.5;
        }
        
        const typingDuration = typingTotal * CONFIG.typingRatio;
        const typingStart = currentTime + reaction;
        const typingEnd = typingStart + typingDuration;
        const appearTime = currentTime + reaction + typingTotal;
        
        // Debug: Log first message timing
        if (isFirstMessage) {
            console.log(`📌 First Message Timing:`);
            console.log(`   - Side: ${isLeft ? 'LEFT' : 'RIGHT'}`);
            console.log(`   - Reaction: ${reaction}s`);
            console.log(`   - TypingTotal: ${typingTotal}s`);
            console.log(`   - TypingStart: ${typingStart.toFixed(2)}s`);
            console.log(`   - AppearTime: ${appearTime.toFixed(2)}s`);
        }
        
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
    return { timeline, totalDuration, introDuration, introTiming };
}

// ============================================
// Frame Capture
// ============================================
// 90: Frame Capture
async function captureFrames(story, outputName = 'story', timelineData) {
    const framesDir = path.join(CONFIG.framesDir, outputName);
    await fs.ensureDir(framesDir);
    await fs.emptyDir(framesDir);
    
    const { timeline, totalDuration } = timelineData;
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
    
    // Debug: Pipe browser logs to node console
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // Inject Data (including introTiming for proper phase rendering)
    await page.evaluateOnNewDocument((storyData, timelineData, introDuration, introTiming) => {
        window.__INJECTED_STORY__ = storyData;
        window.__INJECTED_TIMELINE__ = timelineData;
        window.__INJECTED_INTRO_DURATION__ = introDuration;
        window.__INJECTED_INTRO_TIMING__ = introTiming;
        window.__INJECTED_MODE__ = true;
    }, story, timeline, timelineData.introDuration, timelineData.introTiming);
    
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
            #chat-container { padding-bottom: 200px !important; padding-right: 15px !important; }
            #chat-header { padding-top: 60px !important; padding-bottom: 15px !important; height: auto !important; }
            .chat-image { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto; }

            /* 🛑 FREEZE ANIMATIONS FOR SYNC */
            .typing-bubble .dot { animation-play-state: paused !important; }
            .message { animation-play-state: paused !important; }
            
            /* Ensure Typing Indicator is Correctly Positioned in Render */
            #typing-indicator {
                position: absolute !important;
                bottom: 20px !important; /* Fixed bottom */
                left: 20px !important; 
                z-index: 100 !important;
                margin: 0 !important;
            }
            
            /* Time Divider Overlay - No Transition in Render */
            .time-divider-overlay { transition: none !important; }
            
            /* 🎬 libgif-js Styles for GIF Frame Control */
            .jsgif { position: relative !important; display: inline-block !important; }
            .jsgif canvas { display: block !important; max-width: 150px !important; }
            .jsgif_toolbar { display: none !important; } /* Hide loading bar */
            .gif-canvas-wrapper { 
                display: inline-block !important; 
                max-width: 150px !important; 
                transition: none !important;
            }
        `
    });
    
    // Initialize & Sync Logic
    await page.evaluate(() => {
        if (window.__INJECTED_MODE__ && window.__INJECTED_STORY__) {
            const storyData = window.__INJECTED_STORY__;
            const timeline = window.__INJECTED_TIMELINE__;
            
            const story = new ChatStory(storyData);
            let shownMessages = new Set();
            
            // ✅ FIX 2: Monkey-patch addMessage to track appear time + Init SuperGif for stickers
            const originalAddMessage = story.addMessage.bind(story);
            story.addMessage = function(item, char) {
                originalAddMessage(item, char);
                const lastMsg = this.container.lastElementChild;
                if (lastMsg) {
                    lastMsg.dataset.appearTime = window.currentFrameTime || 0;
                    lastMsg.style.animationPlayState = 'paused'; // Ensure paused immediately
                    
                    // 🎬 STICKER DETECTION: Check for GIPHY GIF images
                    const stickerImg = lastMsg.querySelector('img.chat-image.sticker');
                    if (stickerImg && stickerImg.src.includes('giphy.com')) {
                        try {
                            // Create wrapper for libgif
                            const wrapper = document.createElement('div');
                            wrapper.className = 'gif-canvas-wrapper';
                            // ✅ FIX: Start visible so animation works immediately
                            // Animation in setCurrentTime will handle scale/opacity
                            wrapper.style.opacity = '0'; 
                            wrapper.style.transform = 'scale(0.6) translateY(30px)';
                            wrapper.style.transformOrigin = 'center bottom';
                            wrapper.style.willChange = 'transform, opacity'; // ✅ GPU acceleration hint
                            
                            // Clone img for SuperGif (it replaces the original)
                            const gifImg = document.createElement('img');
                            gifImg.src = stickerImg.src;
                            gifImg.className = 'gif-controllable';
                            gifImg.rel = 'nofollow';
                            
                            wrapper.appendChild(gifImg);
                            stickerImg.parentNode.replaceChild(wrapper, stickerImg);
                            
                            // ✅ Mark wrapper as ready for animation BEFORE gif loads
                            wrapper.dataset.gifLoaded = 'pending';
                            
                            // Initialize SuperGif
                            const rub = new SuperGif({ 
                                gif: gifImg, 
                                auto_play: false,
                                progressbar_height: 0 // Hide loading bar
                            });
                            
                            rub.load(() => {
                                wrapper.dataset.gifLoaded = 'true';
                                wrapper.dataset.frameCount = rub.get_length();
                                wrapper._supergif = rub;
                                
                                // Calculate gif duration based on frame delays
                                const frameDelays = [];
                                for (let i = 0; i < rub.get_length(); i++) {
                                    // Default 100ms per frame if no delay info
                                    frameDelays.push(0.1);
                                }
                                const totalGifDuration = frameDelays.reduce((a,b) => a+b, 0);
                                wrapper.dataset.gifDuration = totalGifDuration.toString();
                                
                                // Force canvas to fit wrapper
                                const canvas = wrapper.querySelector('canvas');
                                if (canvas) {
                                    canvas.style.maxWidth = '150px';
                                    canvas.style.height = 'auto';
                                }
                                
                                rub.move_to(0);
                                console.log('[R] Loaded GIF with', rub.get_length(), 'frames, duration:', totalGifDuration.toFixed(2) + 's');
                            });
                        } catch (e) {
                            console.log('[R] SuperGif init error:', e.toString());
                        }
                    }
                }
            };

            window.setCurrentTime = function(currentTime) {
                try {
                window.currentFrameTime = currentTime;
                
                // Check injection
                if (typeof window.__INJECTED_STORY__ === 'undefined') {
                    if (Math.floor(currentTime) % 1 === 0) console.log('[R] FATAL: window.__INJECTED_STORY__ is undefined!');
                    return;
                }
                const storyData = window.__INJECTED_STORY__;
                
                // --- INTRO HANDLING (Render Mode) - IMPROVED ---
                const introTiming = window.__INJECTED_INTRO_TIMING__ || {
                    delayBefore: 1.0,
                    fadeIn: 0.5,
                    ttsDuration: 0,
                    bufferAfter: 1.5,
                    total: window.__INJECTED_INTRO_DURATION__ || 4.0
                };
                const introDuration = introTiming.total;
                
                // Debug Log (only once per second)
                if (Math.floor(currentTime * 10) % 10 === 0) {
                    console.log(`[R] Time: ${currentTime.toFixed(2)}s | Intro Total: ${introDuration}s | Phase: ${currentTime < introTiming.delayBefore ? 'DELAY' : currentTime < introDuration ? 'SHOW' : 'CHAT'}`);
                }
                
                if (currentTime < introDuration) {
                    // Create or get dynamic intro overlay for render mode
                    let renderIntro = document.getElementById('render-intro-overlay');
                    let contentWrap;
                    
                    if (!renderIntro) {
                        renderIntro = document.createElement('div');
                        renderIntro.id = 'render-intro-overlay';
                        // ✅ SOLID COLOR - ป้องกัน banding (ไม่ใช้ gradient)
                        renderIntro.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999999; display: flex; align-items: center; justify-content: center; background-color: #0D8578;';
                        
                        // Content wrapper for animation (like .intro-content)
                        contentWrap = document.createElement('div');
                        contentWrap.id = 'render-intro-content';
                        contentWrap.style.cssText = 'text-align: center; padding: 20px; opacity: 0; transform: scale(0.9);';
                        
                        const titleEl = document.createElement('h1');
                        titleEl.id = 'render-intro-title';
                        titleEl.style.cssText = 'font-size: 1.5rem; font-weight: 700; color: #ffffff; text-shadow: 2px 2px 10px rgba(0,0,0,0.4); white-space: nowrap; text-align: center; margin: 0;';
                        titleEl.textContent = storyData.room_name || '';
                        
                        contentWrap.appendChild(titleEl);
                        renderIntro.appendChild(contentWrap);
                        document.body.appendChild(renderIntro);
                        console.log('[R] Created dynamic intro overlay with title:', storyData.room_name);
                    } else {
                        contentWrap = document.getElementById('render-intro-content');
                    }
                    
                    // ============================================
                    // INTRO ANIMATION PHASES
                    // Phase 1: Delay (0 to delayBefore) - Keep hidden
                    // Phase 2: Fade In (delayBefore to delayBefore + fadeIn)
                    // Phase 3: Hold (TTS playing + buffer after)
                    // ============================================
                    const delayBefore = introTiming.delayBefore;
                    const fadeInDuration = introTiming.fadeIn;
                    const fadeInStart = delayBefore;
                    const fadeInEnd = delayBefore + fadeInDuration;
                    
                    let opacity = 0;
                    let scale = 0.9;
                    
                    if (currentTime < delayBefore) {
                        // Phase 1: Delay before showing - keep hidden
                        opacity = 0;
                        scale = 0.9;
                    } else if (currentTime < fadeInEnd) {
                        // Phase 2: Fade in animation
                        let progress = (currentTime - fadeInStart) / fadeInDuration;
                        progress = Math.min(1, Math.max(0, progress));
                        // Ease-out cubic
                        progress = 1 - Math.pow(1 - progress, 3);
                        
                        opacity = progress;
                        scale = 0.9 + (0.1 * progress); // 0.9 → 1.0
                    } else {
                        // Phase 3: Hold visible while TTS plays + buffer
                        opacity = 1;
                        scale = 1.0;
                    }
                    
                    if (contentWrap) {
                        contentWrap.style.opacity = opacity.toFixed(3);
                        contentWrap.style.transform = `scale(${scale.toFixed(3)})`;
                    }
                    
                    return; // SKIP chat rendering during intro
                } else {
                    // Hide/remove dynamic intro after intro duration
                    const renderIntro = document.getElementById('render-intro-overlay');
                    if (renderIntro) {
                        renderIntro.style.display = 'none';
                    }
                }
                } catch (e) {
                    console.log('[R] Exception in setCurrentTime:', e.toString());
                }
                
                let isAnyTyping = false;
                let typingChar = null;

                try {
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
                    
                    // ============================================
                    // FIX: Sticker Pop-In Animation (IMPROVED)
                    // Animation ทำงานทันที ไม่รอ GIF load
                    // ============================================
                    
                    // 🎬 SYNC 4: Sync ALL Sticker Elements (img.sticker + gif-canvas-wrapper)
                    // ต้อง sync ทั้ง raw img.sticker และ gif-canvas-wrapper
                    const stickerElements = document.querySelectorAll('.chat-image.sticker, .gif-canvas-wrapper');
                    stickerElements.forEach(element => {
                        const msg = element.closest('.message');
                        if (!msg) return;
                        
                        const appearTime = parseFloat(msg.dataset.appearTime || 0);
                        const relativeTime = currentTime - appearTime;
                        
                        // 🎨 PopIn Animation - ALWAYS apply (ไม่รอ GIF load)
                        const animDuration = 0.35; // เพิ่มเวลา animation เล็กน้อย
                        let scale = 1;
                        let translateY = 0;
                        let opacity = 1;
                        
                        if (relativeTime >= 0) {
                            if (relativeTime < animDuration) {
                                const t = relativeTime / animDuration;
                                
                                // EaseOutBack curve for bouncy "pop" effect (overshoot)
                                // c1 = 1.70158 คือค่า standard สำหรับ easeOutBack
                                const c1 = 1.70158;
                                const c3 = c1 + 1;
                                const eased = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
                                
                                // Scale: 0.6 → overshoot ~1.1 → settle at 1.0
                                scale = 0.6 + (0.4 * eased);
                                
                                // TranslateY: 30px → 0px (เพิ่มระยะเพื่อให้เห็น bounce ชัด)
                                translateY = 30 * (1 - eased);
                                
                                // Opacity: 0 → 1 (ช่วงแรก 60% ของ animation)
                                opacity = Math.min(1, t / 0.6);
                            } else {
                                // Animation complete - ensure final state
                                scale = 1;
                                translateY = 0;
                                opacity = 1;
                            }
                            
                            // Apply styles directly
                            element.style.opacity = opacity.toString();
                            element.style.transform = `scale(${scale.toFixed(4)}) translateY(${translateY.toFixed(2)}px)`;
                            element.style.transformOrigin = 'center bottom';
                            
                            // 🎬 GIF Frame Sync (only for loaded gif-canvas-wrapper)
                            // ✅ Animation works even if GIF not loaded yet (pending state)
                            if (element.classList.contains('gif-canvas-wrapper') && 
                                element._supergif && 
                                element.dataset.gifLoaded === 'true') {
                                
                                const rub = element._supergif;
                                const frameCount = parseInt(element.dataset.frameCount) || 1;
                                
                                // Time-based frame calculation
                                const gifDuration = parseFloat(element.dataset.gifDuration) || (frameCount * 0.1);
                                const loopedTime = relativeTime % gifDuration;
                                const timePerFrame = gifDuration / frameCount;
                                const frameIndex = Math.min(
                                    Math.floor(loopedTime / timePerFrame),
                                    frameCount - 1
                                );
                                
                                // Skip redundant frame moves
                                const lastFrame = parseInt(element.dataset.lastFrameIndex) || -1;
                                if (frameIndex !== lastFrame) {
                                    rub.move_to(frameIndex);
                                    element.dataset.lastFrameIndex = frameIndex;
                                }
                            }
                        } else {
                            // Before appear: hidden with initial transform
                            element.style.opacity = '0';
                            element.style.transform = 'scale(0.6) translateY(30px)';
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
                } catch(e) { console.log('[R] Loop Error:', e.toString()); }
                
                // Update Typing UI
                try {
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
                } catch(e) { console.log('[R] Typing UI Error:', e.toString()); }

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
        
        // ใช้ PNG แทน JPEG เพื่อป้องกัน banding บน gradient
        const framePath = path.join(framesDir, `frame_${String(frame).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });
        
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
    const framePattern = path.join(framesDir, 'frame_%06d.png');  // PNG for no banding

    await fs.ensureDir(CONFIG.outputDir);
    
    const { bgMusicPath, sfxPath, timeline, bgmVolume = 0.3, sfxVolume = 0.5, totalDuration, swooshPath, swooshVolume = 0.7, introPath, introDuration = 0, introTiming } = audioOptions;
    
    return new Promise((resolve, reject) => {
        console.log(`Assembling video... (duration: ${totalDuration?.toFixed(1) || '?'}s)`);
        
        // ============================================
        // INTRO TIMING BREAKDOWN (for audio sync)
        // Timeline: [delayBefore] -> [TTS plays] -> [bufferAfter] -> [SWOOSH + BGM + CHAT]
        // ============================================
        const delayBefore = introTiming?.delayBefore || TIMING.INTRO_DELAY_BEFORE || 1.0;
        const bufferAfter = introTiming?.bufferAfter || TIMING.INTRO_BUFFER_AFTER || 1.5;
        
        // Log all audio paths for debugging
        console.log(`🔊 Audio Debug:`);
        console.log(`  - introPath: ${introPath || 'null'} | exists: ${introPath ? fs.existsSync(introPath) : 'N/A'}`);
        console.log(`  - swooshPath: ${swooshPath || 'null'} | exists: ${swooshPath ? fs.existsSync(swooshPath) : 'N/A'}`);
        console.log(`  - bgMusicPath: ${bgMusicPath || 'null'} | exists: ${bgMusicPath ? fs.existsSync(bgMusicPath) : 'N/A'}`);
        console.log(`  - sfxPath: ${sfxPath || 'null'} | exists: ${sfxPath ? fs.existsSync(sfxPath) : 'N/A'}`);
        console.log(`  - Intro Timing: delayBefore=${delayBefore}s, total=${introDuration}s`);
        
        // 0: Video
        let command = ffmpeg()
            .input(framePattern)
            .inputFPS(CONFIG.fps);
        
        let audioInputIndex = 1;
        let filterComplex = '';
        let mixInputs = '';
        let hasAudio = false;

        // 1. Intro TTS Audio (if exists) - starts AFTER delayBefore
        if (introPath && fs.existsSync(introPath)) {
            command.input(introPath);
            // TTS starts after the initial delay (when title appears)
            const ttsDelay = Math.round(delayBefore * 1000);
            filterComplex += `[${audioInputIndex}:a]adelay=${ttsDelay}|${ttsDelay},volume=1.0[intro];`;
            mixInputs += `[intro]`;
            audioInputIndex++;
            hasAudio = true;
            console.log(`  ✅ Added intro TTS audio (delay: ${ttsDelay}ms)`);
        }

        // 2. Swoosh Audio (if exists) - plays at END of intro (transition to chat)
        if (swooshPath && fs.existsSync(swooshPath)) {
            command.input(swooshPath);
            // Swoosh plays when intro ends and chat begins
            const swooshDelay = Math.round(introDuration * 1000);
            filterComplex += `[${audioInputIndex}:a]adelay=${swooshDelay}|${swooshDelay},volume=${swooshVolume}[swoosh];`;
            mixInputs += `[swoosh]`;
            audioInputIndex++;
            hasAudio = true;
            console.log(`  ✅ Added swoosh audio (delay: ${swooshDelay}ms - at intro end)`);
        }

        // 3. BGM (if exists) - starts when chat begins (after intro)
        if (bgMusicPath && fs.existsSync(bgMusicPath)) {
            command.input(bgMusicPath).inputOptions(['-stream_loop', '-1']);
            // BGM starts when chat begins
            const bgmDelay = Math.round(introDuration * 1000);
            filterComplex += `[${audioInputIndex}:a]adelay=${bgmDelay}|${bgmDelay},volume=${bgmVolume}[bgm];`;
            mixInputs += `[bgm]`;
            audioInputIndex++;
            hasAudio = true;
            console.log(`  ✅ Added BGM (delay: ${bgmDelay}ms - when chat starts, vol: ${bgmVolume})`);
        }

        // 4. SFX (Messages)
        if (sfxPath && fs.existsSync(sfxPath) && timeline && timeline.length > 0) {
            command.input(sfxPath);
            const sfxInputIdx = audioInputIndex;
            audioInputIndex++;
            
            const sfxCount = Math.min(timeline.length, 50);
            for (let i = 0; i < sfxCount; i++) {
                const delayMs = Math.round(timeline[i].appearTime * 1000);
                filterComplex += `[${sfxInputIdx}:a]adelay=${delayMs}|${delayMs},volume=${sfxVolume}[sfx${i}];`;
                mixInputs += `[sfx${i}]`;
                hasAudio = true;
            }
            console.log(`  ✅ Added ${sfxCount} SFX instances (vol: ${sfxVolume})`);
        }
        
        console.log(`  Total audio inputs: ${audioInputIndex - 1} | hasAudio: ${hasAudio}`);
        
        if (hasAudio) {
            // Count number of inputs in mixInputs e.g. [intro][swoosh][bgm][sfx0]...
            const count = (mixInputs.match(/\[/g) || []).length;
            // Use duration=longest so BGM (looped) defines length, then -t cuts to video duration
            filterComplex += `${mixInputs}amix=inputs=${count}:duration=longest:dropout_transition=0:normalize=0[aout]`;
            // ✅ รวม video filter (fps) เข้าไปใน complexFilter เพื่อป้องกัน conflict
            const fullFilter = `[0:v]fps=30[vout];${filterComplex}`;
            console.log(`  Filter: ${fullFilter.substring(0, 100)}...`);
            command
                .complexFilter(fullFilter)
                .outputOptions(['-map', '[vout]', '-map', '[aout]']);
        } else {
            // No audio - use simple videoFilters
            command.videoFilters(['fps=30']);
            command.outputOptions(['-an']);  // No audio track
        }
        // ✅ FIX: Use -t to set exact video duration (prevents infinite loop)
        // ============================================
        // HIGH QUALITY Settings - Optimized for Animation
        // ============================================
        const outputOpts = [
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'slow',
            '-crf', '18',            // High quality
            '-g', '15',              // Keyframe every 0.5s - จับ animation ได้ครบ
            '-bf', '2',              // B-frames - smooth motion
            '-vsync', 'cfr',         // Constant frame rate - ไม่ drop frames
            '-c:a', 'aac',
            '-b:a', '128k'
        ];
        // Note: Video filter (fps=30) is now included in complexFilter above
        
        // Add duration limit if we know the total duration
        if (totalDuration) {
            outputOpts.push('-t', totalDuration.toFixed(2));
        }
        
        // NOTE: Do NOT use -shortest here, as it would cut video at shortest audio (intro ~1s)
        
        command
            .outputOptions(outputOpts)
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .run();
    });
}

// ============================================
// Normalize Audio Loudness (LUFS)
// ============================================

// Helper: Measure LUFS of a file
function measureLufs(filePath) {
    return new Promise((resolve) => {
        let stderr = '';
        const proc = require('child_process').spawn(ffmpegPath, [
            '-i', filePath,
            '-af', 'loudnorm=print_format=summary',
            '-f', 'null', '-'
        ]);
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', () => {
            // Parse LUFS from stderr
            const integratedMatch = stderr.match(/Input Integrated:\s+([-\d.]+)/);
            const truePeakMatch = stderr.match(/Input True Peak:\s+([-\d.]+)/);
            
            resolve({
                integrated: integratedMatch ? parseFloat(integratedMatch[1]) : null,
                truePeak: truePeakMatch ? parseFloat(truePeakMatch[1]) : null
            });
        });
        
        proc.on('error', () => resolve({ integrated: null, truePeak: null }));
    });
}

async function normalizeAudio(inputPath, targetLufs = -14) {
    const ext = path.extname(inputPath);
    const baseName = path.basename(inputPath, ext);
    const outputPath = path.join(path.dirname(inputPath), `${baseName}_normalized${ext}`);
    
    console.log(`\n🎚️ Normalizing audio to ${targetLufs} LUFS (Two-pass)...`);
    
    // ========== PASS 1: Measure current loudness ==========
    console.log(`   Pass 1: Measuring...`);
    const measured = await new Promise((resolve) => {
        let stderr = '';
        const proc = require('child_process').spawn(ffmpegPath, [
            '-i', inputPath,
            '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:print_format=json`,
            '-f', 'null', '-'
        ]);
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', () => {
            // Extract JSON from stderr (loudnorm outputs JSON at the end)
            const jsonMatch = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const data = JSON.parse(jsonMatch[0]);
                    resolve(data);
                } catch (e) {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
        
        proc.on('error', () => resolve(null));
    });
    
    if (!measured) {
        console.log(`   ⚠️ Could not measure loudness, using single-pass fallback`);
        // Fallback to single-pass
        return new Promise((resolve) => {
            ffmpeg(inputPath)
                .audioFilters([`loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`])
                .outputOptions(['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k'])
                .output(outputPath)
                .on('end', async () => {
                    await fs.remove(inputPath);
                    await fs.move(outputPath, inputPath);
                    resolve(inputPath);
                })
                .on('error', () => resolve(inputPath))
                .run();
        });
    }
    
    console.log(`   Input: ${parseFloat(measured.input_i).toFixed(1)} LUFS | TP: ${parseFloat(measured.input_tp).toFixed(1)} dBTP`);
    
    // ========== PASS 2: Apply correction with measured values ==========
    console.log(`   Pass 2: Normalizing...`);
    return new Promise((resolve) => {
        ffmpeg(inputPath)
            .audioFilters([
                `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:` +
                `measured_I=${measured.input_i}:` +
                `measured_TP=${measured.input_tp}:` +
                `measured_LRA=${measured.input_lra}:` +
                `measured_thresh=${measured.input_thresh}:` +
                `offset=${measured.target_offset}:` +
                `linear=true:print_format=summary`
            ])
            .outputOptions([
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k'
            ])
            .output(outputPath)
            .on('end', async () => {
                console.log(`✅ Audio normalized!`);
                
                // Measure final LUFS
                const lufs = await measureLufs(outputPath);
                if (lufs.integrated !== null) {
                    console.log(`📊 Final Loudness: ${lufs.integrated.toFixed(1)} LUFS | True Peak: ${lufs.truePeak?.toFixed(1) || '?'} dBTP`);
                }
                
                // Replace original with normalized version
                try {
                    await fs.remove(inputPath);
                    await fs.move(outputPath, inputPath);
                    console.log(`📦 Replaced original with normalized version.`);
                    resolve(inputPath);
                } catch (err) {
                    console.log(`⚠️ Could not replace original. Normalized file: ${outputPath}`);
                    resolve(outputPath);
                }
            })
            .on('error', (err) => {
                console.error('❌ Normalization failed:', err.message);
                resolve(inputPath);
            })
            .run();
    });
}

// ============================================
// Exports
// ============================================
async function recordStory(story, options = {}) {
    const outputName = options.outputName || 'story';
    try {
        const timelineData = await calculateTimeline(story);
        
        // Pass pre-calculated timeline to captureFrames
        const { framesDir } = await captureFrames(story, outputName, timelineData);
        
        const { timeline, totalDuration, introDuration, introTiming } = timelineData;
        
        const audioOptions = {
            bgMusicPath: options.bgMusicPath,
            sfxPath: options.sfxPath,
            bgmVolume: options.bgmVolume,
            sfxVolume: options.sfxVolume,
            // New options
            swooshPath: options.swooshPath,
            swooshVolume: options.swooshVolume,
            introPath: story.intro_path,
            introDuration: introDuration,
            introTiming: introTiming,  // ✅ NEW: Pass intro timing breakdown
            
            timeline: timeline,
            totalDuration: totalDuration
        };
        
        let videoPath = await assembleVideo(framesDir, outputName, audioOptions);
        // ✅ TEMP: Keep frames for debugging banding issue
        // if (!options.keepFrames) await fs.remove(framesDir);
        console.log(`📁 Frames kept at: ${framesDir} (for debugging)`);
        
        // Auto-normalize audio loudness to -14 LUFS (TikTok standard)
        if (options.normalizeAudio !== false) {
            videoPath = await normalizeAudio(videoPath, -14);
        }
        
        // Open output folder and highlight the video file
        openOutputFolder(videoPath);
        
        return videoPath;
    } catch (error) {
        console.error('Recording failed:', error);
        throw error;
    }
}

module.exports = { recordStory, calculateTimeline, CONFIG };