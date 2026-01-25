/**
 * Test Script - Render with Audio (เหมือนระบบหลักทุกอย่าง)
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
    framesDir: path.join(__dirname, 'output', 'temp', 'test-audio-frames'),
};

async function testWithAudio() {
    console.log('🎬 Test: Render WITH Audio (เหมือนระบบหลัก)');
    console.log('================================================\n');

    await fs.emptyDir(CONFIG.framesDir);
    await fs.ensureDir(CONFIG.outputDir);

    // Capture frames (same as before)
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({
        width: CONFIG.width,
        height: CONFIG.height,
        deviceScaleFactor: CONFIG.scale
    });

    const cacheBuster = Date.now();
    await page.goto(`http://localhost:3000/visualizer/index.html?v=${cacheBuster}`, {
        waitUntil: 'networkidle0'
    });

    await page.evaluate(() => {
        const intro = document.getElementById('intro-overlay');
        const title = document.getElementById('intro-title');
        if (intro) {
            intro.classList.remove('hidden');
            intro.style.display = 'flex';
        }
        if (title) title.textContent = 'Test with Audio';
    });

    const totalFrames = 90;
    console.log(`🎥 Capturing ${totalFrames} frames...`);
    
    for (let frame = 0; frame < totalFrames; frame++) {
        const framePath = path.join(CONFIG.framesDir, `frame_${String(frame).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });
        if (frame % 30 === 0) process.stdout.write(`\r   Frame ${frame}/${totalFrames}`);
    }

    console.log('\n✅ Frame capture complete.\n');
    await browser.close();

    // Find a BGM file to test
    const bgmPath = path.join(__dirname, 'assets', 'sounds', 'chill', 'chill_lofi_1.mp3');
    const hasBgm = fs.existsSync(bgmPath);
    
    console.log(`🔊 BGM: ${hasBgm ? bgmPath : 'NOT FOUND'}`);

    // Assemble with audio (เหมือนระบบหลัก)
    await assembleWithAudio(hasBgm ? bgmPath : null);
}

async function assembleWithAudio(bgmPath) {
    const outputPath = path.join(CONFIG.outputDir, 'test-with-audio.mp4');
    const framePattern = path.join(CONFIG.framesDir, 'frame_%06d.png');

    console.log('\n🎬 Assembling video WITH audio (same as main system)...');

    return new Promise((resolve, reject) => {
        const command = ffmpeg()
            .input(framePattern)
            .inputFPS(CONFIG.fps);

        if (bgmPath) {
            command.input(bgmPath);
            
            // ใช้ complexFilter เหมือนระบบหลัก
            const filterComplex = `[0:v]fps=30[vout];[1:a]volume=0.3[aout]`;
            
            console.log(`   Filter: ${filterComplex}`);
            
            command
                .complexFilter(filterComplex)
                .outputOptions([
                    '-map', '[vout]',
                    '-map', '[aout]',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'slow',
                    '-crf', '18',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-t', '3'
                ]);
        } else {
            // No audio
            command
                .videoFilters(['fps=30'])
                .outputOptions([
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'slow',
                    '-crf', '18',
                    '-an'
                ]);
        }

        command
            .output(outputPath)
            .on('end', () => {
                console.log(`\n✅ Video saved: ${outputPath}`);
                console.log('\n🔍 เปรียบเทียบกับ test-localhost.mp4');
                console.log('   ถ้าต่างกัน = Audio mixing เป็นสาเหตุ');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('❌ Error:', err.message);
                reject(err);
            })
            .run();
    });
}

testWithAudio().catch(console.error);
