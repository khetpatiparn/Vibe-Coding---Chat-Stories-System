const http = require('http');

const API_PORT = 3000;

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: API_PORT,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    console.error('Failed to parse JSON:', data);
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTest() {
    console.log('🧪 Starting Import JSON Feature Test (Native HTTP)...');

    try {
        // 1. Create a dummy project
        console.log('\n1. Creating dummy project...');
        const createData = await request('POST', '/projects/blank', { title: 'Test Project Native' });
        
        if (!createData.success) throw new Error('Failed to create project');
        const originalProjectId = createData.projectId;
        console.log(`   ✅ Created project ID: ${originalProjectId}`);

        // 2. Add some content
        console.log('\n2. Adding dialogues...');
        await request('POST', `/projects/${originalProjectId}/dialogues`, { sender: 'me', message: 'Hello Native', order: 1 });
        await request('POST', `/projects/${originalProjectId}/dialogues`, { sender: 'boss', message: 'Native Test', order: 2 });
        console.log('   ✅ Added 2 dialogues');

        // 3. Export JSON
        console.log('\n3. Exporting JSON...');
        const exportedJson = await request('GET', `/projects/${originalProjectId}`);
        
        if (!exportedJson.id) throw new Error('Failed to export JSON');
        console.log('   ✅ Exported JSON successfully');
        console.log(`      Title: ${exportedJson.title}`);
        console.log(`      Dialogues: ${exportedJson.dialogues.length}`);

        // 4. Test Import as NEW Project
        console.log('\n4. Testing Import as NEW Project...');
        exportedJson.project = { title: 'Imported Project Native' };
        exportedJson.title = 'Imported Project Native'; 

        const importData = await request('POST', '/import', exportedJson);
        
        if (!importData.success) throw new Error('Import failed: ' + importData.error);
        console.log(`   ✅ Imported as new project ID: ${importData.projectId}`);

        // Verify the new project
        const verifyJson = await request('GET', `/projects/${importData.projectId}`);
        if (verifyJson.dialogues.length !== 2) throw new Error('Dialogue count mismatch in imported project');
        console.log('   ✅ Verified new project data');

        // 5. Test Import REPLACE
        console.log('\n5. Testing Import REPLACE (Overwrite)...');
        exportedJson.dialogues.push({
            sender: 'me',
            message: 'New line via Import Replace',
            delay: 1,
            seq_order: 3
        });
        
        const replaceData = await request('POST', `/projects/${originalProjectId}/import`, exportedJson);
        
        if (!replaceData.success) throw new Error('Replace failed: ' + replaceData.error);
        console.log('   ✅ Replace success');
        
        // Verify Content
        const verifyReplaceJson = await request('GET', `/projects/${originalProjectId}`);
        if (verifyReplaceJson.dialogues.length !== 3) throw new Error(`Expected 3 dialogues, got ${verifyReplaceJson.dialogues.length}`);
        console.log('   ✅ Verified replaced project has 3 dialogues');

        console.log('\n✨ ALL TESTS PASSED SUCCESSFULLY! 🚀');

    } catch (err) {
        console.error('\n❌ TEST FAILED:', err.message);
    }
}

runTest();
