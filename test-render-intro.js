/**
 * Test Script - Render Intro Only
 * ทดสอบ render แค่ส่วน intro ด้วย solid color
 * ไม่มี chat, ไม่มี audio - เพื่อหาสาเหตุ banding
 */

const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');

const CONFIG = {
    fps: 30,
    width: 360,
    height: 640,
    scale: 3,  // Output: 1080x1920
    outputDir: path.join(__dirname, 'output', '00_Test'),
    framesDir: path.join(__dirname, 'output', 'temp', 'test-intro-frames'),
};

async function captureIntro() {
    console.log('🎬 Test: Capture Intro Only (Solid Color)');
    console.log('=========================================\n');

    // Clean up
    await fs.emptyDir(CONFIG.framesDir);
    await fs.ensureDir(CONFIG.outputDir);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({
        width: CONFIG.width,
        height: CONFIG.height,
        deviceScaleFactor: CONFIG.scale
    });

    // Load test HTML
    const testHtmlPath = path.join(__dirname, 'test-intro-only.html');
    await page.goto(`file://${testHtmlPath}`, { waitUntil: 'networkidle0' });

    // Get duration
    const totalDuration = await page.evaluate(() => window.getTotalDuration());
    const totalFrames = Math.ceil(totalDuration * CONFIG.fps);

    console.log(`📊 Duration: ${totalDuration}s = ${totalFrames} frames`);
    console.log(`📐 Output: ${CONFIG.width * CONFIG.scale}x${CONFIG.height * CONFIG.scale}`);
    console.log(`🖼️  Format: PNG (lossless)\n`);

    // Capture frames
    console.log('🎥 Capturing frames...');
    for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame / CONFIG.fps;
        await page.evaluate((time) => window.setCurrentTime(time), currentTime);

        const framePath = path.join(CONFIG.framesDir, `frame_${String(frame).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });

        if (frame % 30 === 0) {
            process.stdout.write(`\r   Frame ${frame}/${totalFrames} (${currentTime.toFixed(1)}s)`);
        }
    }

    console.log('\n✅ Frame capture complete.\n');
    await browser.close();

    // Assemble video
    await assembleVideo();
}

async function assembleVideo() {
    const outputPath = path.join(CONFIG.outputDir, 'test-intro-solid.mp4');
    const framePattern = path.join(CONFIG.framesDir, 'frame_%06d.png');

    console.log('🎬 Assembling video...');
    console.log('   Settings:');
    console.log('   - Codec: H.264');
    console.log('   - Pixel Format: yuv420p');
    console.log('   - CRF: 18 (high quality)');
    console.log('   - No deband filter (testing raw output)\n');

    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(framePattern)
            .inputFPS(CONFIG.fps)
            .outputOptions([
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'slow',
                '-crf', '18',
                '-an'  // No audio
            ])
            .output(outputPath)
            .on('end', () => {
                console.log(`✅ Video saved: ${outputPath}`);
                console.log('\n🔍 ตรวจสอบไฟล์ดูว่ามี banding หรือไม่');
                console.log('   ถ้าไม่มี = ปัญหาอยู่ที่ gradient/CSS');
                console.log('   ถ้ายังมี = ปัญหาอยู่ที่ FFmpeg encoding\n');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('❌ FFmpeg error:', err.message);
                reject(err);
            })
            .run();
    });
}

// Run
captureIntro().catch(console.error);
