/**
 * Test Script - Render via localhost (เหมือนระบบหลัก)
 * เพื่อทดสอบว่า CSS จาก server ถูกต้องไหม
 */

const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');

const CONFIG = {
    fps: 30,
    width: 360,
    height: 640,
    scale: 3,
    outputDir: path.join(__dirname, 'output', '00_Test'),
    framesDir: path.join(__dirname, 'output', 'temp', 'test-localhost-frames'),
};

async function captureViaLocalhost() {
    console.log('🎬 Test: Capture via localhost (เหมือนระบบหลัก)');
    console.log('================================================\n');

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

    // ใช้ localhost เหมือนระบบหลัก
    const cacheBuster = Date.now();
    console.log(`📡 Loading: http://localhost:3000/visualizer/index.html?v=${cacheBuster}`);
    
    await page.goto(`http://localhost:3000/visualizer/index.html?v=${cacheBuster}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
    });

    // แสดง intro overlay
    await page.evaluate(() => {
        const intro = document.getElementById('intro-overlay');
        const title = document.getElementById('intro-title');
        if (intro) {
            intro.classList.remove('hidden');
            intro.style.display = 'flex';
        }
        if (title) {
            title.textContent = 'Test via Localhost';
        }
    });

    // ดึงค่า background จริงที่ render
    const bgColor = await page.evaluate(() => {
        const intro = document.getElementById('intro-overlay');
        return window.getComputedStyle(intro).backgroundColor;
    });
    console.log(`🎨 Actual background color: ${bgColor}`);

    // Capture 90 frames (3 seconds)
    const totalFrames = 90;
    console.log(`\n🎥 Capturing ${totalFrames} frames...`);
    
    for (let frame = 0; frame < totalFrames; frame++) {
        const framePath = path.join(CONFIG.framesDir, `frame_${String(frame).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });
        
        if (frame % 30 === 0) {
            process.stdout.write(`\r   Frame ${frame}/${totalFrames}`);
        }
    }

    console.log('\n✅ Frame capture complete.\n');
    await browser.close();

    // Assemble
    await assembleVideo();
}

async function assembleVideo() {
    const outputPath = path.join(CONFIG.outputDir, 'test-localhost.mp4');
    const framePattern = path.join(CONFIG.framesDir, 'frame_%06d.png');

    console.log('🎬 Assembling video (same settings as test-intro)...');

    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(framePattern)
            .inputFPS(CONFIG.fps)
            .outputOptions([
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'slow',
                '-crf', '18',
                '-an'
            ])
            .output(outputPath)
            .on('end', () => {
                console.log(`✅ Video saved: ${outputPath}`);
                console.log('\n🔍 เปรียบเทียบกับ test-intro-solid.mp4');
                console.log('   ถ้าเหมือนกัน = CSS โหลดถูกต้อง');
                console.log('   ถ้าต่าง = มีปัญหาที่ CSS/server\n');
                resolve(outputPath);
            })
            .on('error', reject)
            .run();
    });
}

captureViaLocalhost().catch(console.error);
