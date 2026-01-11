/**
 * Video Recorder - Puppeteer + FFmpeg Integration
 * Captures chat animation as video frames and assembles with audio
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
const CONFIG = {
    width: 1080,
    height: 1920,
    fps: 30,
    framesDir: './output/frames',
    outputDir: './output',
    visualizerPath: './src/visualizer/index.html'
};

// ============================================
// Frame Capture
// ============================================
async function captureFrames(story, outputName = 'story') {
    const framesDir = path.join(CONFIG.framesDir, outputName);
    await fs.ensureDir(framesDir);
    await fs.emptyDir(framesDir);
    
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            `--window-size=${CONFIG.width},${CONFIG.height}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({
        width: CONFIG.width,
        height: CONFIG.height,
        deviceScaleFactor: 1
    });
    
    // Load the visualizer
    const htmlPath = path.resolve(CONFIG.visualizerPath);
    const storyParam = encodeURIComponent(JSON.stringify(story));
    await page.goto(`file://${htmlPath}?story=${storyParam}`, {
        waitUntil: 'networkidle0'
    });
    
    console.log('Starting frame capture...');
    
    let frameCount = 0;
    let isComplete = false;
    
    // Listen for story completion
    await page.exposeFunction('onStoryComplete', () => {
        isComplete = true;
    });
    
    await page.evaluate(() => {
        window.addEventListener('story-complete', () => {
            window.onStoryComplete();
        });
    });
    
    // Capture frames
    const frameInterval = 1000 / CONFIG.fps;
    const maxDuration = 60000; // 60 seconds max
    const startTime = Date.now();
    
    while (!isComplete && (Date.now() - startTime) < maxDuration) {
        const framePath = path.join(framesDir, `frame_${String(frameCount).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });
        frameCount++;
        
        // Wait for next frame
        await new Promise(resolve => setTimeout(resolve, frameInterval));
        
        if (frameCount % 30 === 0) {
            console.log(`Captured ${frameCount} frames...`);
        }
    }
    
    // Capture a few more frames after completion for ending
    for (let i = 0; i < CONFIG.fps * 2; i++) {
        const framePath = path.join(framesDir, `frame_${String(frameCount).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });
        frameCount++;
        await new Promise(resolve => setTimeout(resolve, frameInterval));
    }
    
    await browser.close();
    console.log(`Captured ${frameCount} frames in ${framesDir}`);
    
    return { framesDir, frameCount };
}

// ============================================
// Assemble Video with FFmpeg
// ============================================
async function assembleVideo(framesDir, outputName = 'story', bgMusicPath = null) {
    const outputPath = path.join(CONFIG.outputDir, `${outputName}.mp4`);
    const framePattern = path.join(framesDir, 'frame_%06d.png');
    
    await fs.ensureDir(CONFIG.outputDir);
    
    return new Promise((resolve, reject) => {
        console.log('Assembling video...');
        
        let command = ffmpeg()
            .input(framePattern)
            .inputFPS(CONFIG.fps)
            .outputOptions([
                '-c:v libx264',
                '-pix_fmt yuv420p',
                '-preset fast',
                '-crf 23'
            ]);
        
        // Add background music if provided
        if (bgMusicPath && fs.existsSync(bgMusicPath)) {
            command = command
                .input(bgMusicPath)
                .outputOptions([
                    '-c:a aac',
                    '-b:a 128k',
                    '-shortest'
                ]);
        }
        
        command
            .output(outputPath)
            .on('start', (cmd) => {
                console.log('FFmpeg command:', cmd);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`Processing: ${Math.round(progress.percent)}%`);
                }
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                reject(err);
            })
            .on('end', () => {
                console.log(`Video saved to: ${outputPath}`);
                resolve(outputPath);
            })
            .run();
    });
}

// ============================================
// Full Recording Pipeline
// ============================================
async function recordStory(story, options = {}) {
    const outputName = options.outputName || story.title?.replace(/[^a-zA-Z0-9ก-๙]/g, '_') || 'story';
    const bgMusicPath = options.bgMusicPath || null;
    
    try {
        // Step 1: Capture frames
        const { framesDir, frameCount } = await captureFrames(story, outputName);
        
        if (frameCount === 0) {
            throw new Error('No frames captured');
        }
        
        // Step 2: Assemble video
        const videoPath = await assembleVideo(framesDir, outputName, bgMusicPath);
        
        // Step 3: Clean up frames (optional)
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
module.exports = {
    captureFrames,
    assembleVideo,
    recordStory,
    CONFIG
};

// ============================================
// CLI Test
// ============================================
if (require.main === module) {
    const testStory = {
        title: "Test Story",
        characters: {
            a: { name: "คนที่ 1", avatar: "", side: "left" },
            b: { name: "คนที่ 2", avatar: "", side: "right" }
        },
        dialogues: [
            { sender: "a", message: "สวัสดีครับ!", delay: 0.5, typing_speed: "normal", camera_effect: "normal" },
            { sender: "b", message: "สวัสดีค่ะ 😊", delay: 0.5, typing_speed: "normal", camera_effect: "normal" }
        ]
    };
    
    recordStory(testStory, { keepFrames: true })
        .then(path => console.log('Done:', path))
        .catch(err => console.error('Error:', err));
}
