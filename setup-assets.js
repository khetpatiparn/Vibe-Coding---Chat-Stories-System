/**
 * Setup Script - Copy assets to proper locations
 */
const fs = require('fs-extra');
const path = require('path');

const BRAIN_DIR = 'C:/Users/patip/.gemini/antigravity/brain/526928c3-6dad-4934-86ed-54d719c57158';
const ASSETS_DIR = './assets/avatars';

const avatarFiles = [
    { src: 'boss_avatar_1768041593394.png', dest: 'boss.png' },
    { src: 'employee_avatar_1768041608552.png', dest: 'employee.png' },
    { src: 'girlfriend_avatar_1768041625228.png', dest: 'girlfriend.png' },
    { src: 'ghost_avatar_1768041643740.png', dest: 'ghost.png' },
    { src: 'friend_avatar_1768041659520.png', dest: 'friend.png' }
];

async function setupAssets() {
    console.log('Setting up assets...');
    
    // Ensure directory exists
    await fs.ensureDir(ASSETS_DIR);
    
    for (const file of avatarFiles) {
        const srcPath = path.join(BRAIN_DIR, file.src);
        const destPath = path.join(ASSETS_DIR, file.dest);
        
        try {
            await fs.copy(srcPath, destPath);
            console.log(`✅ Copied: ${file.dest}`);
        } catch (err) {
            console.error(`❌ Failed to copy ${file.src}: ${err.message}`);
        }
    }
    
    console.log('\nAssets setup complete!');
}

setupAssets();
