/**
 * Download Sound Assets - Fetches free sound effects from Mixkit
 */
const https = require('https');
const fs = require('fs-extra');
const path = require('path');

const SOUNDS_DIR = './assets/sounds';

// Free sound effect URLs from Mixkit (royalty-free)
const soundUrls = {
    // Keyboard typing sound
    'typing.mp3': 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
    // Message notification pop
    'pop.mp3': 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
    // Alternative notification
    'notification.mp3': 'https://assets.mixkit.co/active_storage/sfx/1512/1512-preview.mp3'
};

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadFile(response.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {}); // Delete partial file
            reject(err);
        });
    });
}

async function downloadSounds() {
    console.log('Downloading sound effects...\n');
    
    await fs.ensureDir(SOUNDS_DIR);
    
    for (const [filename, url] of Object.entries(soundUrls)) {
        const destPath = path.join(SOUNDS_DIR, filename);
        
        try {
            console.log(`Downloading: ${filename}...`);
            await downloadFile(url, destPath);
            console.log(`✅ Saved: ${destPath}`);
        } catch (err) {
            console.error(`❌ Failed to download ${filename}: ${err.message}`);
        }
    }
    
    console.log('\nSound effects download complete!');
    console.log('Note: These are preview clips from Mixkit (royalty-free).');
}

downloadSounds();
