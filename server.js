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

const { db, Project, Dialogue, Character, CustomCharacter, importStoryJSON, exportStoryJSON } = require('./database');
const { generateStory, continueStory } = require('./src/ai/screenwriter');
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

// 2.1 Update Project Title
app.put('/api/projects/:id', async (req, res) => {
    try {
        const { title } = req.body;
        await Project.updateTitle(req.params.id, title);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Update Dialogue
app.put('/api/dialogues/:id', async (req, res) => {
    try {
        const { message, sender, camera_effect } = req.body;
        await Dialogue.updateAll(req.params.id, { message, sender, camera_effect });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.1 Create New Dialogue
app.post('/api/projects/:id/dialogues', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { sender, message, order } = req.body; // Basic fields
        
        // Defaults
        const newData = {
            sender: sender || 'me',
            message: message || '...',
            delay: 1.0,
            typing_speed: 'normal',
            camera_effect: 'normal'
        };
        
        // We need to know the order (sequence). Ideally frontend sends it or we find max.
        // For simplicity, we just use Date.now() or auto-increment order if Logic permits.
        // Our DB schema has 'seq_order'.
        // Let's assume frontend sends a reasonable order or we append to end.
        
        // For quick fix: just use current max order + 1 (implemented via DB query or just rely on frontend)
        // Let's trust frontend to reload or simplistic append.
        
        // Wait, Database.js `Dialogue.add` takes `(projectId, data, order)`.
        const dialogueId = await Dialogue.add(projectId, newData, order || 999);
        
        res.json({ success: true, id: dialogueId });
    } catch (err) {
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
        const { category, characters, characterData, customPrompt, projectId } = req.body;
        
        console.log('Generating story with settings:', { category, characters, customPrompt, projectId });
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
            characterData: characterData || [], // NEW - Pass character data to AI
            customPrompt: customPrompt || null
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
        
        // Add dialogues
        for (let i = 0; i < story.dialogues.length; i++) {
            const d = story.dialogues[i];
            await Dialogue.add(targetProjectId, {
                sender: d.sender,
                message: d.message,
                delay: d.delay || 1.0,
                typing_speed: d.typing_speed || 'normal',
                camera_effect: d.camera_effect || 'normal'
            }, i);
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
        const { projectId, characters, topic } = req.body;
        
        // 1. Fetch recent dialogues for context (last 10)
        const recentDialogues = await new Promise((resolve, reject) => {
             db.all('SELECT * FROM dialogues WHERE project_id = ? ORDER BY seq_order DESC LIMIT 10', [projectId], (err, rows) => {
                 if (err) reject(err);
                 else resolve(rows ? rows.reverse() : []);
             });
        });
        
        if (recentDialogues.length === 0) {
            // No context? Just treat as new story? Or fail?
            // Let's allow it but warn.
        }

        // 2. Call AI
        const newDialogues = await continueStory(topic, recentDialogues);
        
        res.json({ success: true, dialogues: newDialogues });
        
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

// 5. Render Video
app.post('/api/render/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        console.log(`🎥 Rendering project ${projectId}...`);
        
        await Project.updateStatus(projectId, 'RENDERING');
        
        const story = await exportStoryJSON(projectId);
        
        // Adjust avatar paths for Node.js context (if needed) or keep relative
        // Capture expects specific structure. 
        
        // Make sure assets paths are correct relative to project root
        // If story.characters has "assets/...", it works if run from root.
        
        const videoPath = await recordStory(story, {
            outputName: `project_${projectId}_${Date.now()}`
        });

        await Project.updateStatus(projectId, 'COMPLETED');
        
        res.json({ success: true, videoPath });
        
    } catch (err) {
        console.error("Render failed:", err);
        await Project.updateStatus(req.params.id, 'FAILED');
        res.status(500).json({ error: err.message });
    }
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
        const { name, display_name } = req.body;
        
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
        const characterId = await CustomCharacter.add(name, display_name, avatarPath);
        
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
        const { display_name } = req.body;
        
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
        
        await CustomCharacter.update(id, display_name, avatarPath);
        
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
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`\n🚀 AutoChat Studio Pro running at http://localhost:${PORT}`);
    console.log(`📂 Dashboard: http://localhost:${PORT}/dashboard`);
});
