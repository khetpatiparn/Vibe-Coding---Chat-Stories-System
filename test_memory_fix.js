const http = require('http');

const API_BASE = 'http://localhost:3000/api';

function httpRequest(url, options = {}, data = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = http.request(reqOptions, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testMemoryDistribution() {
    console.log('🧪 Starting Memory Distribution Test (HTTP Mode)...');

    try {
        // 1. Fetch Characters
        console.log('1️⃣ Fetching Custom Characters...');
        const characters = await httpRequest(`${API_BASE}/characters/custom`);

        if (!Array.isArray(characters) || characters.length < 2) {
            console.error('❌ Not enough custom characters to test (need at least 2).');
            return;
        }

        const char1 = characters[0];
        const char2 = characters[1];
        console.log(`   Using characters: ${char1.display_name} (ID:${char1.id}) and ${char2.display_name} (ID:${char2.id})`);

        // 2. Mock Story Payload
        const mockDialogues = [
            { sender: char1.display_name, message: "Hey, do you remember the fire drill yesterday?" },
            { sender: char2.display_name, message: "Yeah, it was chaotic." },
            { sender: char1.display_name, message: "I was so scared I hid under the table." },
            { sender: char2.display_name, message: "Haha, classic you." },
            { sender: char1.display_name, message: "Let's grab lunch." }
        ];

        console.log('2️⃣ Sending Summary Request (Triggering AI)...');
        console.log('   (This might take 5-10 seconds)');

        const data = await httpRequest(`${API_BASE}/memories/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            projectId: 99999, // Dummy Project ID
            dialogues: mockDialogues,
            characterIds: [char1.id, char2.id]
        });

        if (data.success) {
            console.log('✅ Summarization Successful!');
            console.log('   Summary:', data.summary);
            console.log('   Memories Created:', data.memories ? data.memories.length : 0);
            
            // 3. Verify Memories for BOTH characters
            console.log('3️⃣ Verifying Memory Distribution...');
            
            const checkMemories = async (charId, name) => {
                const mems = await httpRequest(`${API_BASE}/memories/character/${charId}`);
                // Check if the mock summary exists in recent memories
                // We check if ANY memory contains "fire drill" or matches summary text
                const hasEvent = mems.some(m => m.memory_text === data.summary);
                console.log(`   👉 Character ${name} (ID:${charId}): ${hasEvent ? '✅ Has Event Memory' : '❌ MISSING Memory'}`);
            };
            
            await checkMemories(char1.id, char1.display_name);
            await checkMemories(char2.id, char2.display_name);

        } else {
            console.error('❌ Summarization Failed:', data.message || data);
        }

    } catch (err) {
        console.error('❌ Test Failed:', err.message);
    }
}

testMemoryDistribution();
