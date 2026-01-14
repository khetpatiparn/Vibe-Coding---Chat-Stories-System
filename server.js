/**
 * AutoChat Studio Pro - API Server
 * Handles Dashboard requests, AI generation, and Video Rendering
 */
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const open = require('open'); // Optional: opens browser on start
const multer = require('multer');
const fs = require('fs-extra');

const { db, Project, Dialogue, Character, CustomCharacter, SoundCollection, Sound, importStoryJSON, exportStoryJSON } = require('./database');
const { generateStory, continueStory } = require('./src/ai/screenwriter');
const TIMING = require('./src/config/timing');
const { recordStory } = require('./src/recorder/capture');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('src')); // Serve static files (dashboard, visualizer)
app.use('/assets', express.static('assets')); // Serve assets
app.use('/output', express.static('output')); // Serve output videos

// ============================================
// Multer Configuration for File Uploads
// ============================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'assets/avatars/custom/';
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'));
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: fileFilter
});

// Chat Image Configuration (ADDED)
const chatStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'assets/uploads/';
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'chat-img-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const uploadChat = multer({ storage: chatStorage, fileFilter: fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Sound Upload Configuration
const soundStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const type = req.body.type || 'sfx';
        const collection = req.body.collection || 'default';
        const uploadDir = `assets/sounds/${type}/${collection}/`;
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'sound-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const soundFilter = (req, file, cb) => {
    const allowedTypes = /mp3|wav|ogg|m4a/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only audio files (mp3, wav, ogg, m4a) are allowed!'));
    }
};
const uploadSound = multer({ storage: soundStorage, fileFilter: soundFilter, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// Upload Endpoint
app.post('/api/upload/image', uploadChat.single('image'), (req, res) => {
    if (!req.file) {
        console.error("Upload failed: No file received");
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const webPath = req.file.path.replace(/\\/g, '/');
    console.log("Image uploaded to:", webPath);
    res.json({ success: true, path: webPath });
});

// ============================================
// API Endpoints
// ============================================

// 0. Get Timing Config (Single Source of Truth for Frontend)
app.get('/api/config/timing', (req, res) => {
    res.json(TIMING);
});

// 1. Get All Projects
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await Project.getAll();
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Get Single Project (Full Data)
app.get('/api/projects/:id', async (req, res) => {
    try {
        const story = await exportStoryJSON(req.params.id);
        res.json(story);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.1 Update Project Title, Room Name & Settings
app.put('/api/projects/:id', async (req, res) => {
    try {
        const { title, room_name, show_partner_name, show_my_name } = req.body;
        
        if (title !== undefined) {
            await Project.updateTitle(req.params.id, title);
        }
        if (room_name !== undefined) {
            await Project.updateRoomName(req.params.id, room_name);
        }
        if (show_partner_name !== undefined || show_my_name !== undefined) {
            // Fetch current project to merge
            const current = await Project.getById(req.params.id);
            await Project.updateSettings(req.params.id, {
                show_partner_name: show_partner_name !== undefined ? show_partner_name : current.show_partner_name,
                show_my_name: show_my_name !== undefined ? show_my_name : current.show_my_name
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Update Dialogue
app.put('/api/dialogues/:id', async (req, res) => {
    try {
        const { message, sender, imagePath, delay, reaction_delay } = req.body;
        await Dialogue.updateAll(req.params.id, { message, sender, image_path: imagePath, delay, reaction_delay });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.1 Create New Dialogue
app.post('/api/projects/:id/dialogues', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { sender, message, order, delay, reaction_delay, imagePath } = req.body;
        
        // Auto-calculate delay if not provided
        const baseDelay = 1.0;
        const charCount = (message || '').length;
        const calculatedDelay = parseFloat((baseDelay + (charCount * 0.05)).toFixed(2));
        
        const newData = {
            sender: sender || 'me',
            message: message || '...',
            delay: delay || calculatedDelay,
            reaction_delay: reaction_delay || TIMING.DEFAULT_REACTION_DELAY,
            typing_speed: 'normal',
            image_path: imagePath // Map camelCase to snake_case
        };
        
        const dialogueId = await Dialogue.add(projectId, newData, order || 999);
        
        res.json({ success: true, id: dialogueId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.1.5 Add Character to Project
app.post('/api/projects/:id/characters', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { role, name, avatar, side } = req.body;
        
        if (!role || !name) {
            return res.status(400).json({ error: 'Role and name are required' });
        }
        
        await Character.add(projectId, {
            role: role,
            name: name,
            avatar: avatar || 'assets/avatars/default.png',
            side: side || 'left'
        });
        
        console.log(`✅ Added character to project ${projectId}: ${name} (${role})`);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to add character:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3.2 Delete Dialogue
app.delete('/api/dialogues/:id', async (req, res) => {
    try {
        await Dialogue.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.3 Delete Project
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        
        // Delete all associated dialogues and characters (CASCADE should handle this)
        // But let's be explicit for safety - wrap in Promises
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM dialogues WHERE project_id = ?', [projectId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM characters WHERE project_id = ?', [projectId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM projects WHERE id = ?', [projectId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete project error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3.4 Create Blank Project
app.post('/api/projects/blank', async (req, res) => {
    try {
        const { title } = req.body;
        const projectId = await Project.create(title || 'Untitled Story', 'custom');
        
        // Add default characters (me and boss)
        // Add default characters (me and boss)
        await Character.add(projectId, {
            role: 'me',
            name: 'ฉัน',
            avatar: 'assets/avatars/person1.png',
            side: 'right'
        });
        await Character.add(projectId, {
            role: 'boss',
            name: 'เจ้านาย',
            avatar: 'assets/avatars/boss.png',
            side: 'left'
        });
        
        res.json({ success: true, projectId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.5 Add Character to Project
app.post('/api/projects/:id/characters', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { role, name, avatar, side } = req.body;
        
        await Character.add(projectId, {
            role, 
            name, 
            avatar, 
            side: side || 'left'
        });
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.6 Set Main Character (Right Side)
// 3.6 Set Main Character (Right Side)
app.post('/api/projects/:id/set_main_character', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { role } = req.body;
        
        console.log(`\n=== SET MAIN CHARACTER ===`);
        console.log(`Project ID: ${projectId}`);
        console.log(`Role to set as main: ${role}`);
        
        // First, check existing characters
        const existingChars = await new Promise((resolve, reject) => {
            db.all('SELECT role, side FROM characters WHERE project_id = ?', [projectId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Existing characters before update:', existingChars);
        
        // Atomic update using CASE
        await new Promise((resolve, reject) => {
            db.run(
                "UPDATE characters SET side = CASE WHEN role = ? THEN 'right' ELSE 'left' END WHERE project_id = ?",
                [role, projectId],
                function(err) {
                    if (err) {
                        console.error('Update side error:', err);
                        reject(err);
                    } else {
                        console.log(`Updated sides. Rows changed: ${this.changes}`);
                        resolve();
                    }
                }
            );
        });
        
        // Verify update
        const updatedChars = await new Promise((resolve, reject) => {
            db.all('SELECT role, side FROM characters WHERE project_id = ?', [projectId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log('Characters after update:', updatedChars);
        console.log(`=========================\n`);
        
        res.json({ success: true });
    } catch (e) {
        console.error('Set main char failed:', e);
        res.status(500).json({ error: e.message });
    }
});

// 4. Generate New Story (AI)
app.post('/api/generate', async (req, res) => {
    try {
        const { category, characters, characterData, customPrompt, projectId, relationship, length } = req.body;
        
        console.log('Generating story with settings:', { category, characters, customPrompt, projectId, relationship, length });
        console.log('Character data:', characterData);
        
        let targetProjectId = projectId;
        
        // If no projectId, create new project first
        if (!targetProjectId) {
            targetProjectId = await Project.create('AI Generated Story', category);
        }
        
        // Generate story with AI using new parameters
        const story = await generateStory({
            category: category || 'funny',
            characters: characters || ['me', 'boss'],
            characterData: characterData || [],
            customPrompt: customPrompt || null,
            relationship: relationship || 'friend',  // V2.0: Pass relationship
            length: length || 20 // Default to 20 if not provided
        });
        
        // Clear existing dialogues if generating for existing project
        if (projectId) {
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM dialogues WHERE project_id = ?', [projectId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM characters WHERE project_id = ?', [projectId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        
        // Add characters (use custom avatar if available)
        for (const [key, char] of Object.entries(story.characters)) {
            // Check if this is a custom character
            const customChar = characterData.find(c => c.id === key && c.is_custom);
            const avatarPath = customChar ? customChar.avatar_path : char.avatar;
            
            await Character.add(targetProjectId, {
                role: key,
                name: char.name,
                avatar: avatarPath,
                side: char.side || 'left' // Default to left if missing
            });
        }
        
        // Add dialogues with auto-calculated timing
        for (let i = 0; i < story.dialogues.length; i++) {
            const d = story.dialogues[i];
            // Auto-calculate delay based on message length (Thai-friendly)
            const baseDelay = 1.0;
            const charCount = (d.message || '').length;
            const calculatedDelay = parseFloat((baseDelay + (charCount * 0.05)).toFixed(2));
            
            await Dialogue.add(targetProjectId, {
                sender: d.sender,
                message: d.message,
                delay: calculatedDelay, // Always use calculated, ignore AI's default
                reaction_delay: 0.8,
                typing_speed: d.typing_speed || 'normal',
                image_path: null // Will be updated below if sticker exists
            }, i);

            // If AI suggested a sticker, fetch it and update the dialogue
            if (d.sticker_keyword) {
                try {
                    // Fetch top 1 GIF from Giphy using ENV key
                    const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC'; 
                    // console.log(`🧸 Auto-fetching sticker for '${d.sticker_keyword}' with key length: ${apiKey.length}`);

                    const response = await axios.get(`https://api.giphy.com/v1/gifs/search`, {
                        params: { api_key: apiKey, q: d.sticker_keyword, limit: 1, rating: 'pg-13' }
                    });
                    
                    if (response.data.data.length > 0) {
                        const gifUrl = response.data.data[0].images.fixed_height.url;
                        // Update the last inserted dialogue with image_path
                        // We need the ID, but Dialogue.add doesn't return ID easily in current implementation wrapper
                        // Optimization: Update immediately by updating the `add` method or separate query
                            await new Promise((resolve, reject) => {
                                 db.run(`UPDATE dialogues SET image_path = ? WHERE project_id = ? AND seq_order = ?`, 
                                    [gifUrl, targetProjectId, d.seq_order || i], (err) => {
                                    if(err) console.error("Failed to update sticker", err);
                                    resolve();
                                });
                        });
                        console.log(`🧸 Auto-added sticker for '${d.sticker_keyword}': ${gifUrl}`);
                    }
                } catch (err) {
                    console.error(`Failed to auto-fetch sticker for '${d.sticker_keyword}':`, err.message);
                }
            }
        }
        
        res.json({ success: true, projectId: targetProjectId, isMock: story.isMock || false, errorDetails: story.error || null });
    } catch (err) {
        console.error('AI generation failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4.1 Generate Continuation (AI)
app.post('/api/generate/continue', async (req, res) => {
    try {
        const { projectId, characters, topic, length, mode, relationship } = req.body;
        
        // 1. Fetch all custom characters to build name mapping
        const customChars = await CustomCharacter.getAll();
        
        // Build ID -> DisplayName and DisplayName -> ID mappings
        const idToName = {};
        const nameToId = {};
        
        // Default characters
        const defaultNames = {
            'me': 'ฉัน', 'boss': 'เจ้านาย', 'employee': 'ลูกน้อง',
            'friend': 'เพื่อน', 'girlfriend': 'แฟน', 'ghost': 'ผี'
        };
        
        Object.entries(defaultNames).forEach(([id, name]) => {
            idToName[id] = name;
            nameToId[name] = id;
        });
        
        // Custom characters  
        customChars.forEach(c => {
            const id = `custom_${c.id}`;
            idToName[id] = c.display_name;
            nameToId[c.display_name] = id;
        });
        
        // 2. Fetch recent dialogues for context (last 10)
        const recentDialogues = await new Promise((resolve, reject) => {
             db.all('SELECT * FROM dialogues WHERE project_id = ? ORDER BY seq_order DESC LIMIT 10', [projectId], (err, rows) => {
                 if (err) reject(err);
                 else resolve(rows ? rows.reverse() : []);
             });
        });
        
        // Convert dialogues to use display names for AI context
        const dialoguesWithNames = recentDialogues.map(d => ({
            ...d,
            sender: idToName[d.sender] || d.sender
        }));
        
        // Convert selected character IDs to display names for AI
        const characterNames = characters.map(id => idToName[id] || id);
        
        // 3. Call AI with display names and relationship (V2.0)
        const newDialogues = await continueStory(topic, dialoguesWithNames, characterNames, length, mode, relationship || 'friend');
        
        // 4. Convert AI response back to internal IDs
        const dialoguesWithIds = newDialogues.map(d => ({
            ...d,
            sender: nameToId[d.sender] || d.sender
        }));
        
        res.json({ success: true, dialogues: dialoguesWithIds, nameMapping: idToName });
        
    } catch (e) {
        console.error('Continue API Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 4.1.5 Update Dialogue
app.put('/api/projects/:id/dialogues/:did', async (req, res) => {
    try {
        const { id, did } = req.params; // did = dialogue id
        const updates = req.body;
        
        // Use generic update
        await Dialogue.updateData(did, updates);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Update dialogue error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4.2 Reorder Dialogues
app.post('/api/projects/:id/reorder', async (req, res) => {
    try {
        const { updates } = req.body; // Expect array of { id, seq_order }
        
        if (!updates || !Array.isArray(updates)) {
            throw new Error('Invalid updates format provided.');
        }
        
        await Dialogue.reorder(updates);
        
        res.json({ success: true });
    } catch (e) {
        console.error('Reorder failed:', e);
        res.status(500).json({ error: e.message });
    }
});
// 5. Render Video (with optional dialogue range for multi-part export)
app.post('/api/render/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { bgMusicPath, sfxPath, bgmVolume, sfxVolume, dialogueRange } = req.body;
        
        console.log(`🎥 Rendering project ${projectId}...`);
        if (dialogueRange) console.log(`📦 Range: #${dialogueRange.start} - #${dialogueRange.end}`);
        if (bgMusicPath) console.log(`🎵 With BGM: ${bgMusicPath} (vol: ${bgmVolume})`);
        if (sfxPath) console.log(`🔔 With SFX: ${sfxPath} (vol: ${sfxVolume})`);
        
        await Project.updateStatus(projectId, 'RENDERING');
        
        // Get story data
        let story = await exportStoryJSON(projectId);
        
        // Filter dialogues by range if specified
        if (dialogueRange && dialogueRange.start && dialogueRange.end) {
            const start = dialogueRange.start - 1; // Convert to 0-indexed
            const end = dialogueRange.end;
            story.dialogues = story.dialogues.slice(start, end);
            console.log(`✂️ Filtered to ${story.dialogues.length} dialogues (Part: #${dialogueRange.start}-#${dialogueRange.end})`);
        }
        
        // Generate unique filename with range info
        const rangeStr = dialogueRange ? `_part${dialogueRange.start}-${dialogueRange.end}` : '';
        const outputName = `project_${projectId}${rangeStr}_${Date.now()}`;
        
        const videoPath = await recordStory(story, {
            outputName: outputName,
            bgMusicPath: bgMusicPath || null,
            sfxPath: sfxPath || null,
            bgmVolume: bgmVolume || 0.3,
            sfxVolume: sfxVolume || 0.5
        });

        await Project.updateStatus(projectId, 'COMPLETED');
        
        res.json({ success: true, videoPath });
        
    } catch (err) {
        console.error("Render failed:", err);
        await Project.updateStatus(req.params.id, 'FAILED');
        res.status(500).json({ error: err.message });
    }
});

// 6. GIPHY Proxy
const axios = require('axios');
app.get('/api/giphy/search', async (req, res) => {
    try {
        const query = req.query.q;
        const limit = req.query.limit || 20;
        // Use ENV key if available, otherwise try public beta key
        // 403 Forbidden usually means key is invalid or quota exceeded
        const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC'; 
        
        console.log(`🔍 Searching GIPHY: ${query}`);
        console.log(`🔑 Using Key length: ${apiKey ? apiKey.length : 0} | Key start: ${apiKey ? apiKey.substring(0, 4) : 'null'}`);
        
        const response = await axios.get(`https://api.giphy.com/v1/gifs/search`, {
            params: {
                api_key: apiKey,
                q: query,
                limit: limit,
                rating: 'pg-13', // loosened rating
                lang: 'en'
            }
        });
        
        const gifs = response.data.data.map(gif => ({
            id: gif.id,
            title: gif.title,
            url: gif.images.fixed_height.url,        // Moving GIF
            preview: gif.images.fixed_height_small.url // Faster load
        }));
        
        res.json({ success: true, data: gifs });
        
    } catch (err) {
        console.error("GIPHY Error:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to fetch GIFs' });
    }
});

// ============================================
// Import/Export APIs
// ============================================

// Import JSON as new project
app.post('/api/import', async (req, res) => {
    try {
        const data = req.body;
        
        // Validate structure
        if (!data.dialogues || !Array.isArray(data.dialogues)) {
            return res.status(400).json({ error: 'Invalid JSON: missing dialogues array' });
        }
        
        const title = data.project?.title || data.title || 'Imported Story';
        
        // Create new project
        const projectId = await Project.create(title);
        
        // Import characters (if available)
        if (data.characters && typeof data.characters === 'object') {
            for (const [role, char] of Object.entries(data.characters)) {
                await Character.add(projectId, {
                    role: role,
                    name: char.name || role,
                    avatar: char.avatar || 'assets/avatars/default.png',
                    side: char.side || 'left'
                });
            }
        } else {
            // Add default characters
            await Character.add(projectId, { role: 'me', name: 'ฉัน', avatar: 'assets/avatars/person1.png', side: 'right' });
            await Character.add(projectId, { role: 'boss', name: 'เจ้านาย', avatar: 'assets/avatars/boss.png', side: 'left' });
        }
        
        // Import dialogues
        let order = 0;
        for (const d of data.dialogues) {
            // Auto-calculate delay if not provided
            const baseDelay = 1.0;
            const charCount = (d.message || '').length;
            const calculatedDelay = parseFloat((baseDelay + (charCount * 0.05)).toFixed(2));
            
            await Dialogue.add(projectId, {
                sender: d.sender || 'me',
                message: d.message || '',
                delay: d.delay || calculatedDelay,
                reaction_delay: d.reaction_delay || TIMING.DEFAULT_REACTION_DELAY,
                typing_speed: d.typing_speed || 'normal',
                image_path: d.image_path || null
            }, d.seq_order !== undefined ? d.seq_order : order++);
        }
        
        console.log(`✅ Imported ${data.dialogues.length} dialogues as new project ID: ${projectId}`);
        res.json({ success: true, projectId, dialogueCount: data.dialogues.length });
        
    } catch (err) {
        console.error('Import failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// Import JSON into existing project (replace dialogues)
app.post('/api/projects/:id/import', async (req, res) => {
    try {
        const projectId = req.params.id;
        const data = req.body;
        
        // Validate
        if (!data.dialogues || !Array.isArray(data.dialogues)) {
            return res.status(400).json({ error: 'Invalid JSON: missing dialogues array' });
        }
        
        // Check project exists
        const project = await Project.getById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Clear existing dialogues
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM dialogues WHERE project_id = ?', [projectId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Optionally update characters if provided
        if (data.characters && typeof data.characters === 'object') {
            // Clear existing and add new
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM characters WHERE project_id = ?', [projectId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            for (const [role, char] of Object.entries(data.characters)) {
                await Character.add(projectId, {
                    role: role,
                    name: char.name || role,
                    avatar: char.avatar || 'assets/avatars/default.png',
                    side: char.side || 'left'
                });
            }
        }
        
        // Import dialogues
        let order = 0;
        for (const d of data.dialogues) {
            // Auto-calculate delay if not provided
            const baseDelay = 1.0;
            const charCount = (d.message || '').length;
            const calculatedDelay = parseFloat((baseDelay + (charCount * 0.05)).toFixed(2));
            
            await Dialogue.add(projectId, {
                sender: d.sender || 'me',
                message: d.message || '',
                delay: d.delay || calculatedDelay,
                reaction_delay: d.reaction_delay || TIMING.DEFAULT_REACTION_DELAY,
                typing_speed: d.typing_speed || 'normal',
                image_path: d.image_path || null
            }, d.seq_order !== undefined ? d.seq_order : order++);
        }
        
        console.log(`✅ Replaced dialogues in project ${projectId} with ${data.dialogues.length} imported dialogues`);
        res.json({ success: true, dialogueCount: data.dialogues.length });
        
    } catch (err) {
        console.error('Import to project failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// AI Character Personality Generator
// ============================================
app.post('/api/generate-character-personality', async (req, res) => {
    const { displayName, gender } = req.body;
    
    if (!displayName) {
        return res.status(400).json({ error: 'Display name is required' });
    }
    
    const prompt = `สร้าง Personality Profile สำหรับตัวละครชื่อ "${displayName}" ${gender ? `(${gender})` : ''}

ให้ตอบเป็น JSON เท่านั้น ห้ามมี markdown:
{
  "gender": "Male" หรือ "Female" หรือ "Other",
  "personality": "บุคลิกภาพ 2-3 คำ เช่น ปากจัด, ขี้อาย, กวนตีน, ใจดี",
  "speaking_style": "สไตล์การพิมพ์ เช่น พิมพ์รวบ, ใช้คำย่อเยอะ, พิมพ์ผิดบ่อย",
  "age_group": "เลือกจาก: Child, Teenager (Gen Z), Young Adult (Gen Y), Adult (Gen X), Senior (Boomer)",
  "occupation": "อาชีพ 1-2 คำ เช่น นักศึกษา, พนักงานออฟฟิศ, แม่ค้าออนไลน์",
  "catchphrase": "คำติดปาก 1-3 คำ เช่น bro, นะจ๊ะ, ว่ะ, งับ",
  "dialect": "เลือกจาก: (ว่าง=กลาง), Isan, Northern, Southern, Suphan",
  "typing_habit": "เลือกจาก: (ว่าง=Normal), rapid_fire, long_paragraphs"
}

กรุณาสร้างบุคลิกที่สมเหตุสมผลกับชื่อ "${displayName}" และทำให้ดูเป็นธรรมชาติ`;

    // Models to try in order (Gemini 3 Pro first, then Flash, then 2.5)
    const modelsToTry = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];
    
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    let lastError = null;
    
    for (const modelName of modelsToTry) {
        try {
            console.log(`🤖 Trying ${modelName} for personality generation...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            
            const result = await model.generateContent(prompt);
            const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const personality = JSON.parse(text);
            console.log(`✅ Personality generated with ${modelName}`);
            
            return res.json({ success: true, personality });
        } catch (err) {
            console.error(`❌ ${modelName} failed:`, err.message);
            lastError = err;
            
            // Wait before trying next model if rate limited or overloaded
            const isRetryable = err.status === 429 || err.status === 503 || 
                               err.message.includes('overloaded') || err.message.includes('quota');
            if (isRetryable) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    // All models failed
    console.error('AI Personality Generation Error: All models failed');
    res.status(500).json({ error: 'API quota exceeded. Please try again in a few minutes or fill in manually.' });
});

// ============================================
// Custom Character APIs
// ============================================

// Get all custom characters
app.get('/api/characters/custom', async (req, res) => {
    try {
        const characters = await CustomCharacter.getAll();
        res.json(characters);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create custom character (with file upload)
app.post('/api/characters/custom', upload.single('avatar'), async (req, res) => {
    try {
        const { name, display_name, gender, personality, speaking_style, age_group, occupation, catchphrase, dialect, typing_habit } = req.body;
        
        if (!name || !display_name || !req.file) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Validate name format (alphanumeric + underscore only)
        if (!/^[a-z0-9_]+$/.test(name)) {
            // Delete uploaded file if validation fails
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Character name must be lowercase letters, numbers, and underscores only' });
        }
        
        const avatarPath = `assets/avatars/custom/${req.file.filename}`;
        const characterId = await CustomCharacter.add(
            name, 
            display_name, 
            avatarPath,
            gender || null,
            personality || null,
            speaking_style || null,
            age_group || null,
            occupation || null,
            catchphrase || null,
            dialect || null,
            typing_habit || null
        );
        
        res.json({ 
            success: true, 
            characterId,
            avatar_path: avatarPath
        });
    } catch (err) {
        // Delete uploaded file if database insert fails
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        
        if (err.message.includes('UNIQUE constraint failed')) {
            res.status(400).json({ error: 'Character name already exists' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// Update custom character
app.put('/api/characters/custom/:id', upload.single('avatar'), async (req, res) => {
    try {
        const { id } = req.params;
        const { display_name, gender, personality, speaking_style, age_group, occupation, catchphrase, dialect, typing_habit } = req.body;
        
        if (!display_name) {
            return res.status(400).json({ error: 'Display name is required' });
        }
        
        let avatarPath = null;
        
        // If new avatar uploaded
        if (req.file) {
            avatarPath = `assets/avatars/custom/${req.file.filename}`;
            
            // Delete old avatar
            const oldChar = await CustomCharacter.getById(id);
            if (oldChar && oldChar.avatar_path) {
                try {
                    fs.unlinkSync(oldChar.avatar_path);
                } catch (e) {
                    console.warn('Could not delete old avatar:', e.message);
                }
            }
        }
        
        await CustomCharacter.update(
            id, 
            display_name, 
            avatarPath,
            gender || null,
            personality || null,
            speaking_style || null,
            age_group || null,
            occupation || null,
            catchphrase || null,
            dialect || null,
            typing_habit || null
        );
        
        res.json({ success: true });
    } catch (err) {
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: err.message });
    }
});

// Delete custom character
app.delete('/api/characters/custom/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get character to delete avatar file
        const character = await CustomCharacter.getById(id);
        
        if (character) {
            // Delete from database
            await CustomCharacter.delete(id);
            
            // Delete avatar file
            if (character.avatar_path) {
                try {
                    fs.unlinkSync(character.avatar_path);
                } catch (e) {
                    console.warn('Could not delete avatar file:', e.message);
                }
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// Sound Library API
// ============================================

// Get all sound collections
app.get('/api/sounds/collections', async (req, res) => {
    try {
        const collections = await SoundCollection.getAll();
        res.json(collections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get collections by type (bgm or sfx)
app.get('/api/sounds/collections/:type', async (req, res) => {
    try {
        const collections = await SoundCollection.getByType(req.params.type);
        res.json(collections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new collection
app.post('/api/sounds/collections', async (req, res) => {
    try {
        const { name, type } = req.body;
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }
        const id = await SoundCollection.create(name, type);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a collection
app.delete('/api/sounds/collections/:id', async (req, res) => {
    try {
        // First delete all sounds in the collection
        const sounds = await Sound.getByCollection(req.params.id);
        for (const sound of sounds) {
            try {
                fs.unlinkSync(sound.filename);
            } catch (e) {
                console.warn('Could not delete sound file:', e.message);
            }
            await Sound.delete(sound.id);
        }
        await SoundCollection.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all sounds
app.get('/api/sounds', async (req, res) => {
    try {
        const sounds = await Sound.getAll();
        res.json(sounds);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get sounds by type (bgm or sfx)
app.get('/api/sounds/type/:type', async (req, res) => {
    try {
        const sounds = await Sound.getByType(req.params.type);
        res.json(sounds);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get sounds by collection
app.get('/api/sounds/collection/:collectionId', async (req, res) => {
    try {
        const sounds = await Sound.getByCollection(req.params.collectionId);
        res.json(sounds);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload a new sound
app.post('/api/sounds/upload', uploadSound.single('sound'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        
        const { name, collectionId, type } = req.body;
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }
        
        const filename = req.file.path.replace(/\\/g, '/');
        const id = await Sound.create(collectionId || null, name, filename, type);
        
        console.log(`Sound uploaded: ${name} -> ${filename}`);
        res.json({ success: true, id, path: filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a sound
app.delete('/api/sounds/:id', async (req, res) => {
    try {
        const sound = await Sound.getById(req.params.id);
        if (sound) {
            // Delete file
            try {
                fs.unlinkSync(sound.filename);
            } catch (e) {
                console.warn('Could not delete sound file:', e.message);
            }
            await Sound.delete(req.params.id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`\n🚀 AutoChat Studio Pro running at http://localhost:${PORT}`);
    console.log(`📂 Dashboard: http://localhost:${PORT}/dashboard`);
});
