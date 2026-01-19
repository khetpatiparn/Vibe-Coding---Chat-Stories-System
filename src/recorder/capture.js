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
    outputDir: './output',
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
    
    // Calculate Intro Duration
    let introDuration = 0;
    const isHorror = story.theme === 'horror' || (story.category && (story.category.toLowerCase() === 'horror' || story.category.toLowerCase() === 'drama'));
    
    if (isHorror) {
        introDuration = 2.0; // Text-only intro for horror
    } else if (story.intro_path) {
        // Measure audio file
        const duration = await getAudioDuration(story.intro_path);
        introDuration = duration > 0 ? duration : 2.0; // Fallback 2s
    } else {
        introDuration = 2.0; // Default text-only intro
    }
    
    console.log(`⏱️ Intro Duration: ${introDuration.toFixed(2)}s`);

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
    return { timeline, totalDuration, introDuration };
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
    
    // Inject Data
    await page.evaluateOnNewDocument((storyData, timelineData, introDuration) => {
        window.__INJECTED_STORY__ = storyData;
        window.__INJECTED_TIMELINE__ = timelineData;
        window.__INJECTED_INTRO_DURATION__ = introDuration;
        window.__INJECTED_MODE__ = true;
    }, story, timeline, timelineData.introDuration);
    
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
                try {
                window.currentFrameTime = currentTime;
                
                // Check injection
                if (typeof window.__INJECTED_STORY__ === 'undefined') {
                    if (Math.floor(currentTime) % 1 === 0) console.log('[R] FATAL: window.__INJECTED_STORY__ is undefined!');
                    return;
                }
                const storyData = window.__INJECTED_STORY__;
                
                // --- INTRO HANDLING (Render Mode) ---
                const introDuration = window.__INJECTED_INTRO_DURATION__ || 0;
                const introOverlay = document.getElementById('intro-overlay');
                const introTitle = document.getElementById('intro-title');
                
                // Debug Log (only once per second)
                if (Math.floor(currentTime * 10) % 10 === 0) {
                    console.log(`[R] Time: ${currentTime.toFixed(2)}s | Intro: ${introDuration}s | Overlay: ${introOverlay ? 'found' : 'null'} | Title: ${introTitle ? introTitle.textContent : 'null'}`);
                }
                
                if (currentTime < introDuration) {
                    // Create or get dynamic intro overlay for render mode
                    let renderIntro = document.getElementById('render-intro-overlay');
                    let contentWrap;
                    
                    if (!renderIntro) {
                        renderIntro = document.createElement('div');
                        renderIntro.id = 'render-intro-overlay';
                        renderIntro.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999999; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #075e54, #128c7e);';
                        
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
                    
                    // Match introFadeIn keyframe: scale 0.9→1, opacity 0→1 over 0.5s
                    const fadeInDuration = 0.5; // seconds
                    let progress = Math.min(1, currentTime / fadeInDuration);
                    // Ease-out effect
                    progress = 1 - Math.pow(1 - progress, 3);
                    
                    let opacity = progress;
                    let scale = 0.9 + (0.1 * progress); // 0.9 → 1.0
                    
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
    
    const { bgMusicPath, sfxPath, timeline, bgmVolume = 0.3, sfxVolume = 0.5, totalDuration, swooshPath, swooshVolume = 0.7, introPath, introDuration = 0 } = audioOptions;
    
    return new Promise((resolve, reject) => {
        console.log(`Assembling video... (duration: ${totalDuration?.toFixed(1) || '?'}s)`);
        
        // Log all audio paths for debugging
        console.log(`🔊 Audio Debug:`);
        console.log(`  - introPath: ${introPath || 'null'} | exists: ${introPath ? fs.existsSync(introPath) : 'N/A'}`);
        console.log(`  - swooshPath: ${swooshPath || 'null'} | exists: ${swooshPath ? fs.existsSync(swooshPath) : 'N/A'}`);
        console.log(`  - bgMusicPath: ${bgMusicPath || 'null'} | exists: ${bgMusicPath ? fs.existsSync(bgMusicPath) : 'N/A'}`);
        console.log(`  - sfxPath: ${sfxPath || 'null'} | exists: ${sfxPath ? fs.existsSync(sfxPath) : 'N/A'}`);
        
        // 0: Video
        let command = ffmpeg()
            .input(framePattern)
            .inputFPS(CONFIG.fps);
        
        let audioInputIndex = 1;
        let filterComplex = '';
        let mixInputs = '';
        let hasAudio = false;

        // 1. Intro Audio (if exists)
        if (introPath && fs.existsSync(introPath)) {
            command.input(introPath);
            filterComplex += `[${audioInputIndex}:a]volume=1.0[intro];`;
            mixInputs += `[intro]`;
            audioInputIndex++;
            hasAudio = true;
            console.log(`  ✅ Added intro audio`);
        }

        // 2. Swoosh Audio (if exists)
        if (swooshPath && fs.existsSync(swooshPath)) {
            command.input(swooshPath);
            const swooshDelay = Math.round(introDuration * 1000);
            filterComplex += `[${audioInputIndex}:a]adelay=${swooshDelay}|${swooshDelay},volume=${swooshVolume}[swoosh];`;
            mixInputs += `[swoosh]`;
            audioInputIndex++;
            hasAudio = true;
            console.log(`  ✅ Added swoosh audio (delay: ${swooshDelay}ms)`);
        }

        // 3. BGM (if exists)
        if (bgMusicPath && fs.existsSync(bgMusicPath)) {
            command.input(bgMusicPath).inputOptions(['-stream_loop', '-1']);
            const bgmDelay = Math.round(introDuration * 1000);
            filterComplex += `[${audioInputIndex}:a]adelay=${bgmDelay}|${bgmDelay},volume=${bgmVolume}[bgm];`;
            mixInputs += `[bgm]`;
            audioInputIndex++;
            hasAudio = true;
            console.log(`  ✅ Added BGM (delay: ${bgmDelay}ms, vol: ${bgmVolume})`);
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
            
            console.log(`  Filter: ${filterComplex.substring(0, 100)}...`);
            
            command
                .complexFilter(filterComplex)
                .outputOptions(['-map', '0:v', '-map', '[aout]']);
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
        
        const { timeline, totalDuration, introDuration } = timelineData;
        
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
            
            timeline: timeline,
            totalDuration: totalDuration  // ✅ NEW: Pass total duration to assembleVideo
        };
        
        let videoPath = await assembleVideo(framesDir, outputName, audioOptions);
        if (!options.keepFrames) await fs.remove(framesDir);
        
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