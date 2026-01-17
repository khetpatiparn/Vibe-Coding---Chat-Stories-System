const fs = require('fs');
const { Blob } = require('buffer');

async function test() {
    console.log('Testing PNG Upload...');
    try {
        const formData = new FormData();
        formData.append('name', 'test_png_' + Date.now());
        formData.append('display_name', 'Test PNG');
        
        // Mock PNG file
        // We use an existing file or create a dummy one
        let buffer;
        try {
            buffer = fs.readFileSync('assets/avatars/person1.png');
        } catch (e) {
            // Create dummy png header if file missing
            buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); 
        }
        
        const blob = new Blob([buffer], { type: 'image/png' });
        formData.append('avatar', blob, 'test_image.png');
        
        // Add other fields required by characters.js validation?
        // Server validation might be loose.
        
        const res = await fetch('http://localhost:3000/api/characters/custom', {
            method: 'POST',
            body: formData
        });
        
        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Body:', text);
        
        if (res.ok) {
            console.log('✅ Upload Successful!');
        } else {
            console.log('❌ Upload Failed');
        }
    } catch (e) {
        console.error('❌ Connection Failed:', e.message);
    }
}

// Wait for server to start if running immediately
setTimeout(test, 2000);
