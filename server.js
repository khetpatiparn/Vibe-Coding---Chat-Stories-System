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

const { db, Project, Dialogue, Character, CustomCharacter, SoundCollection, Sound, Memory, Relationship, importStoryJSON, exportStoryJSON } = require('./database');
const { generateStory, continueStory, summarizeStory } = require('./src/ai/screenwriter');
const TIMING = require('./src/config/timing');
const { recordStory } = require('./src/recorder/capture');
const { generateIntroTTS } = require('./src/ai/intro-tts');

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
    // Some systems send 'image/x-png', so we relax the check or explicitly add it.
    // Actually, let's just trust the extension if it matches, and simple 'image/' mime type start.
    const isImage = file.mimetype.startsWith('image/');
    
    if (extname && isImage) {
        return cb(null, true);
    } else {
        console.error('File rejected:', file.originalname, file.mimetype);
        cb(new Error('Only image files are allowed! (jpeg, jpg, png, gif, webp)'));
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
// Helper: Build Smart Relationship Context
// ดึง relationship จริงจาก DB มาสร้าง context ให้ AI
// ============================================
async function buildRelationshipContext(characterIds, customChars) {
    // Extract numeric IDs from 'custom_XX' format
    const numericIds = characterIds
        .filter(id => id.startsWith('custom_'))
        .map(id => parseInt(id.replace('custom_', '')));
    
    if (numericIds.length < 2) {
        return 'friend'; // Fallback: single character or no custom chars
    }
    
    // Build name lookup
    const idToName = {};
    customChars.forEach(c => {
        idToName[c.id] = c.display_name;
    });
    
    // Fetch relationships between all pairs
    const relationshipPairs = [];
    const strangerPairs = [];
    
    for (let i = 0; i < numericIds.length; i++) {
        for (let j = i + 1; j < numericIds.length; j++) {
            const id1 = numericIds[i];
            const id2 = numericIds[j];
            const name1 = idToName[id1] || `Character ${id1}`;
            const name2 = idToName[id2] || `Character ${id2}`;
            
            const rel = await Relationship.get(id1, id2);
            
            if (rel) {
                const level = rel.score >= 70 ? 'สนิทกันมาก (Close)' :
                              rel.score >= 50 ? 'รู้จักกัน (Acquaintance)' :
                              rel.score >= 30 ? 'รู้จักแต่ไม่สนิท' : 'ไม่ค่อยถูกกัน';
                relationshipPairs.push(`${name1} <-> ${name2}: ${level} (score: ${rel.score})`);
            } else {
                strangerPairs.push(`${name1} <-> ${name2}: ไม่เคยรู้จักกัน (Strangers)`);
            }
        }
    }
    
    // Build context string
    let context = '';
    if (relationshipPairs.length > 0) {
        context += 'คู่ที่รู้จักกัน:\n' + relationshipPairs.join('\n');
    }
    if (strangerPairs.length > 0) {
        if (context) context += '\n\n';
        context += '⚠️ คู่ที่ไม่เคยเจอกัน (ต้องมีการแนะนำตัว/ถามว่าเป็นใคร):\n' + strangerPairs.join('\n');
    }
    
    if (!context) {
        return 'friend'; // Fallback if no relationship data
    }
    
    console.log('📊 Built relationship context:\n' + context);
    return context;
}

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
        const { title, room_name, show_partner_name, show_my_name, custom_header_name } = req.body;
        
        if (title !== undefined) {
            await Project.updateTitle(req.params.id, title);
        }
        if (room_name !== undefined) {
            await Project.updateRoomName(req.params.id, room_name);
            
            // 🆕 Auto-regenerate intro TTS when room name changes
            try {
                const project = await Project.getById(req.params.id);
                const introResult = await generateIntroTTS(room_name, req.params.id, project.category);
                if (introResult) {
                    await Project.updateIntroPath(req.params.id, introResult.audioPath);
                    console.log(`🎙️ Re-generated intro TTS for room name change: ${room_name}`);
                }
            } catch (ttsErr) {
                console.error('TTS regeneration failed:', ttsErr.message);
                // Don't fail the whole request if TTS fails
            }
        }
        if (custom_header_name !== undefined) {
            await Project.updateCustomHeaderName(req.params.id, custom_header_name);
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
        const { sender, message, order, delay, reaction_delay, imagePath, image_path } = req.body;
        
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
            image_path: image_path || imagePath // Support both snake_case (frontend) and camelCase (legacy)
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
        const { category, characters, characterData, customPrompt, projectId, relationship, length, messageCount } = req.body;
        const storyLength = messageCount || length; // messageCount takes priority, fallback to length, then default in screenwriter
        
        console.log('Generating story with settings:', { category, characters, customPrompt, projectId, relationship, storyLength });
        console.log('Character data:', characterData);
        
        let targetProjectId = projectId;
        
        // If no projectId, create new project first
        if (!targetProjectId) {
            targetProjectId = await Project.create('AI Generated Story', category);
        }
        
        // ============================================
        // Sitcom Engine: Fetch Memory Context
        // ============================================
        let memoryContext = null;
        try {
            // Extract custom character IDs from characterData
            const customCharIds = characterData
                .filter(c => c.is_custom && c.id)
                .map(c => parseInt(c.id.toString().replace('custom_', '')));
            
            if (customCharIds.length > 0) {
                console.log('🧠 Fetching memories for character IDs:', customCharIds);
                
                // Fetch memories (Optimized: Recent 20 + Important >= 7)
                const memories = await Memory.getForCharactersOptimized(customCharIds, {
                    recentLimit: 20,
                    importanceThreshold: 7
                });
                
                // Fetch relationships between characters
                const relationships = [];
                for (let i = 0; i < customCharIds.length; i++) {
                    for (let j = i + 1; j < customCharIds.length; j++) {
                        const rel = await Relationship.get(customCharIds[i], customCharIds[j]);
                        if (rel) {
                            const char1 = await CustomCharacter.getById(customCharIds[i]);
                            const char2 = await CustomCharacter.getById(customCharIds[j]);
                            rel.char1_name = char1?.display_name || 'Unknown';
                            rel.char2_name = char2?.display_name || 'Unknown';
                            relationships.push(rel);
                        }
                    }
                }
                
                if (memories.length > 0 || relationships.length > 0) {
                    memoryContext = { memories, relationships };
                    console.log(`🧠 Found ${memories.length} memories, ${relationships.length} relationships`);
                }
            }
        } catch (memErr) {
            console.warn('⚠️ Failed to fetch memory context:', memErr.message);
        }
        
        // Generate story with AI using new parameters + memory context
        const story = await generateStory({
            category: category || 'funny',
            characters: characters || ['me', 'boss'],
            characterData: characterData || [],
            customPrompt: customPrompt || null,
            relationship: relationship || 'friend',  // V2.0: Pass relationship
            length: storyLength, // Custom message count or default range
            memoryContext: memoryContext  // Sitcom Engine: Pass memory context
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

        // NEW: Auto-apply Theme based on Category
        const { THEMES, CATEGORY_THEME_MAP } = require('./src/config/themes');
        const theme = CATEGORY_THEME_MAP[category] || THEMES.DEFAULT;
        if (theme !== THEMES.DEFAULT) {
            await Project.updateTheme(targetProjectId, theme);
            console.log(`👻 Auto-applied theme: ${theme}`);
        }
        
        // NEW: Update room_name with AI-generated title (Curiosity Gap)
        if (story.title) {
            await Project.updateRoomName(targetProjectId, story.title);
            
            // Generate Intro TTS
            const introResult = await generateIntroTTS(story.title, targetProjectId, category);
            if (introResult) {
                await Project.updateIntroPath(targetProjectId, introResult.audioPath);
                console.log(`🎙️ Auto-generated intro: ${introResult.audioPath}`);
            }
        }

        
        // Add dialogues with SMART TIMING LOGIC (Burst Mode + Speed Multiplier)
        let currentOrder = 0;
        let previousSender = null; // ตัวแปรจำคนส่งคนล่าสุด

        // ============================================
        // OPTIMIZATION: Batch GIPHY Requests (Parallel)
        // ลด latency จาก N sequential calls เป็น 1 parallel batch
        // ============================================
        const stickerDialogues = story.dialogues.filter(d => d.sticker_keyword);
        const stickerMap = new Map(); // keyword -> gifUrl
        
        if (stickerDialogues.length > 0) {
            console.log(`🧸 Batch fetching ${stickerDialogues.length} stickers...`);
            const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';
            
            // Parallel fetch all stickers
            const stickerPromises = stickerDialogues.map(async (d) => {
                try {
                    const response = await axios.get(`https://api.giphy.com/v1/stickers/search`, {
                        params: { api_key: apiKey, q: d.sticker_keyword, limit: 10, rating: 'pg-13' }
                    });
                    
                    if (response.data.data.length > 0) {
                        const randomIndex = Math.floor(Math.random() * response.data.data.length);
                        return { keyword: d.sticker_keyword, url: response.data.data[randomIndex].images.fixed_height.url };
                    }
                    return null;
                } catch (err) {
                    console.error(`Failed to fetch sticker for '${d.sticker_keyword}':`, err.message);
                    return null;
                }
            });
            
            const stickerResults = await Promise.all(stickerPromises);
            stickerResults.filter(Boolean).forEach(r => stickerMap.set(r.keyword, r.url));
            console.log(`✅ Fetched ${stickerMap.size} stickers in parallel`);
        }

        for (const d of story.dialogues) {
            
            // 1. Handle Sticker (Insert as separate dialogue FIRST)
            if (d.sticker_keyword && stickerMap.has(d.sticker_keyword)) {
                const gifUrl = stickerMap.get(d.sticker_keyword);
                
                // Smart Reaction: ถ้าคนเดิมพิมพ์ต่อกัน ลด reaction
                const stickerReaction = (d.sender === previousSender) 
                    ? TIMING.BURST_REACTION_DELAY 
                    : TIMING.DEFAULT_REACTION_DELAY;
                
                await Dialogue.add(targetProjectId, {
                    sender: d.sender,
                    message: '',
                    delay: 0.8,
                    reaction_delay: stickerReaction,
                    typing_speed: 'fast',
                    image_path: gifUrl
                }, currentOrder++);
                
                previousSender = d.sender;
                console.log(`🧸 Added sticker for '${d.sticker_keyword}' (reaction: ${stickerReaction}s)`);
            }

            // 2. Handle Text (Insert as separate dialogue SECOND)
            const isPlaceholder = d.message && /^[\s.]*$/.test(d.message);
            const shouldAddText = d.sticker_keyword ? !isPlaceholder : (d.message && d.message.trim().length > 0);

            if (shouldAddText) {
                // --- SMART TIMING CALCULATION V3 (Long Message Fix) ---
                
                // 1. Burst Check: ถ้าคนเดิมพิมพ์ต่อกัน ให้ Reaction ไว
                let reactionTime = TIMING.DEFAULT_REACTION_DELAY; // 0.6
                if (d.sender === previousSender) {
                    reactionTime = TIMING.BURST_REACTION_DELAY; // 0.4 (Burst Mode!)
                }

                // 2. Typing Speed Adjustment: ปรับตามอารมณ์ที่ AI ส่งมา
                let speedMultiplier = TIMING.SPEED_MULTIPLIER[d.typing_speed] || 1.0;

                // 3. Base Calculation
                const charCount = d.message.length;
                
                // *** 4. Long Message Logic (NEW) ***
                // ถ้าข้อความยาว (>50 ตัวอักษร) ให้คูณเวลาเพิ่มอีก 1.2 เท่า
                // เพราะการขึ้นบรรทัดใหม่ใช้เวลาสายตามากกว่าปกติ
                if (charCount > TIMING.LONG_MESSAGE_THRESHOLD) {
                    speedMultiplier *= TIMING.LONG_MESSAGE_BONUS; // 1.2x
                }

                // สูตรคำนวณ
                let finalDelay = (TIMING.BASE_DELAY + (charCount * TIMING.DELAY_PER_CHAR)) * speedMultiplier;
                
                // Clamp: Min 1.2s (กันสั้นหาย), Max 7.0s (ให้ยาวโชว์ครบ)
                finalDelay = Math.max(TIMING.MIN_DELAY, Math.min(finalDelay, TIMING.MAX_DELAY));
                
                // --- CALCULATION END ---

                await Dialogue.add(targetProjectId, {
                    sender: d.sender,
                    message: d.message,
                    delay: parseFloat(finalDelay.toFixed(2)), 
                    reaction_delay: parseFloat(reactionTime.toFixed(2)),
                    typing_speed: d.typing_speed || 'normal',
                    image_path: null
                }, currentOrder++);

                previousSender = d.sender;
            }
        }
        
        res.json({ success: true, projectId: targetProjectId, isMock: story.isMock || false, errorDetails: story.error || null });
    } catch (err) {
        console.error('AI generation failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4.1 Generate Continuation (AI) - WITH SMART RELATIONSHIP CONTEXT
app.post('/api/generate/continue', async (req, res) => {
    try {
        const { projectId, characters, topic, length, mode } = req.body;
        // Note: 'relationship' dropdown is now IGNORED - we use real DB relationships instead
        
        // 1. Fetch all custom characters to build name mapping
        const customChars = await CustomCharacter.getAll();
        
        // Build ID <-> Name mappings
        const idToName = {};
        const nameToId = {};
        
        // Custom characters only (no defaults)
        customChars.forEach(c => {
            const id = `custom_${c.id}`;
            idToName[id] = c.display_name;
            nameToId[c.display_name] = id;
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
        
        // Convert selected character IDs to display names for AI (Context only)
        // const characterNames = characters.map(id => idToName[id] || id); // Legacy, now passing IDs
        
        // 2.5 Build Detailed Character Data (NEW)
        const detailedCharacterData = characters.map(charId => {
             if (charId.startsWith('custom_')) {
                 const dbId = parseInt(charId.replace('custom_', ''));
                 const c = customChars.find(x => x.id === dbId);
                 if (c) {
                     return {
                         id: charId,
                         is_custom: true,
                         display_name: c.display_name,
                         name: c.name, // Added for Nickname support
                         gender: c.gender,
                         personality: c.personality,
                         speaking_style: c.speaking_style,
                         age_group: c.age_group,
                         occupation: c.occupation,
                         catchphrase: c.catchphrase,
                         dialect: c.dialect,
                         typing_habit: c.typing_habit,
                         avatar_path: c.avatar_path
                     };
                 }
             }
             return { id: charId, is_custom: false };
        });

        // ============================================
        // SMART RELATIONSHIP CONTEXT (NEW!)
        // ดึง relationship จริงจาก DB มาบอก AI ว่าใครรู้จักใคร
        // ============================================
        const relationshipContext = await buildRelationshipContext(characters, customChars);
        console.log('🤝 Relationship Context:', relationshipContext);

        // 3. Call AI with IDs, Profile Data, and Relationship Context (V2.2)
        const newDialogues = await continueStory(topic, dialoguesWithNames, characters, length, mode, relationshipContext, detailedCharacterData);
        
        // 4. Convert AI response back to internal IDs and Process Stickers with SMART TIMING
        const processedDialogues = [];
        const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';
        let previousSender = null; // Track previous sender for Burst Mode

        for (const d of newDialogues) {
            // Map Sender Name -> ID
            const internalSender = nameToId[d.sender] || d.sender;

            // 1. Handle Sticker
            if (d.sticker_keyword) {
                try {
                    const response = await axios.get(`https://api.giphy.com/v1/stickers/search`, {
                        params: { api_key: apiKey, q: d.sticker_keyword, limit: 25, rating: 'pg-13' }
                    });
                    
                    if (response.data.data.length > 0) {
                        const randomIndex = Math.floor(Math.random() * response.data.data.length);
                        const gifUrl = response.data.data[randomIndex].images.fixed_height.url;
                        
                        // Smart Reaction: Burst Mode
                        const stickerReaction = (internalSender === previousSender) 
                            ? TIMING.BURST_REACTION_DELAY 
                            : TIMING.DEFAULT_REACTION_DELAY;
                        
                        processedDialogues.push({
                            sender: internalSender,
                            message: '',
                            sticker_keyword: d.sticker_keyword, 
                            image_path: gifUrl,
                            delay: 0.8,
                            reaction_delay: stickerReaction,
                            typing_speed: 'fast'
                        });
                        
                        previousSender = internalSender;
                    }
                } catch (err) {
                    console.error(`Failed to fetch sticker for '${d.sticker_keyword}':`, err.message);
                }
            }

            // 2. Handle Text with SMART TIMING
            const isPlaceholder = d.message && /^[\s.]*$/.test(d.message);
            const shouldAddText = d.sticker_keyword ? !isPlaceholder : (d.message && d.message.trim().length > 0);

            if (shouldAddText) {
                // --- SMART TIMING V3 (Long Message Fix) ---
                
                // Burst Check
                let reactionTime = TIMING.DEFAULT_REACTION_DELAY;
                if (internalSender === previousSender) {
                    reactionTime = TIMING.BURST_REACTION_DELAY;
                }

                // Speed Multiplier
                let speedMultiplier = TIMING.SPEED_MULTIPLIER[d.typing_speed] || 1.0;

                // Calculate Delay
                const charCount = d.message.length;
                
                // Long Message Bonus
                if (charCount > TIMING.LONG_MESSAGE_THRESHOLD) {
                    speedMultiplier *= TIMING.LONG_MESSAGE_BONUS; // 1.2x
                }
                
                let finalDelay = (TIMING.BASE_DELAY + (charCount * TIMING.DELAY_PER_CHAR)) * speedMultiplier;
                finalDelay = Math.max(TIMING.MIN_DELAY, Math.min(finalDelay, TIMING.MAX_DELAY));

                processedDialogues.push({
                    sender: internalSender,
                    message: d.message,
                    delay: parseFloat(finalDelay.toFixed(2)),
                    reaction_delay: parseFloat(reactionTime.toFixed(2)),
                    typing_speed: d.typing_speed || 'normal'
                });
                
                previousSender = internalSender;
            }
        }
        
        res.json({ success: true, dialogues: processedDialogues, nameMapping: idToName });
        
    } catch (e) {
        console.error('Continue API Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 4.1.6 Generate TikTok Descriptions
app.post('/api/projects/:id/generate-descriptions', async (req, res) => {
    try {
        const projectId = req.params.id;
        
        // Get project data
        const project = await Project.getById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Get dialogues and characters
        const dialogues = await Dialogue.getByProject(projectId);
        const characters = await Character.getByProject(projectId);
        
        // Convert characters array to object format
        const charObj = {};
        characters.forEach(char => {
            charObj[char.role] = char;
        });
        
        // Generate descriptions
        const { generateDescriptions } = require('./src/ai/description-generator');
        const result = await generateDescriptions(
            dialogues,
            charObj,
            project.room_name,
            project.theme
        );
        
        if (result.success) {
            res.json({
                success: true,
                descriptions: result.descriptions,
                analysis: result.analysis
            });
        } else {
            res.json({
                success: false,
                error: result.error,
                descriptions: result.descriptions // Fallback templates
            });
        }
        
    } catch (err) {
        console.error('Description generation error:', err);
        res.status(500).json({ error: err.message });
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
        if (req.body.swooshPath) console.log(`🌊 With Swoosh: ${req.body.swooshPath} (vol: ${req.body.swooshVolume || 0.7})`);
        
        await Project.updateStatus(projectId, 'RENDERING');
        
        // Get story data
        let story = await exportStoryJSON(projectId);
        
        // 🆕 Auto-generate TTS if missing but has room_name
        if (!story.intro_path && story.room_name) {
            try {
                console.log(`🎙️ No intro TTS found, generating for: ${story.room_name}`);
                const introResult = await generateIntroTTS(story.room_name, projectId, story.category || 'funny');
                if (introResult && introResult.audioPath) {
                    await Project.updateIntroPath(projectId, introResult.audioPath);
                    story.intro_path = introResult.audioPath; // Update story object too
                    console.log(`✅ Auto-generated intro TTS: ${introResult.audioPath}`);
                }
            } catch (ttsErr) {
                console.warn('Auto TTS generation failed:', ttsErr.message);
            }
        }
        
        // Filter dialogues by range if specified
        if (dialogueRange && dialogueRange.start && dialogueRange.end) {
            const start = dialogueRange.start - 1; // Convert to 0-indexed
            const end = dialogueRange.end;
            story.dialogues = story.dialogues.slice(start, end);
            console.log(`✂️ Filtered to ${story.dialogues.length} dialogues (Part: #${dialogueRange.start}-#${dialogueRange.end})`);
        }
        
        // Smart filename: YYYY-MM-DD_category_title
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const category = story.category || 'story';
        // Clean title for filename (remove special chars, limit length)
        const cleanTitle = (story.title || story.room_name || `p${projectId}`)
            .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, '_')  // Keep Thai + alphanumeric
            .replace(/_+/g, '_')                         // Remove multiple underscores
            .substring(0, 30);                           // Limit length
        const rangeStr = dialogueRange ? `_part${dialogueRange.start}-${dialogueRange.end}` : '';
        const outputName = `${dateStr}_${category}${rangeStr}_${cleanTitle}`;
        
        const videoPath = await recordStory(story, {
            outputName: outputName,
            bgMusicPath: bgMusicPath || null,
            sfxPath: sfxPath || null,
            swooshPath: req.body.swooshPath || null, // Pass swoosh path
            bgmVolume: bgmVolume || 0.3,
            sfxVolume: sfxVolume || 0.5,
            swooshVolume: req.body.swooshVolume || 0.7 // Pass swoosh volume
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
        const limit = req.query.limit || 100; // Increased to 100 stickers
        // Use ENV key if available, otherwise try public beta key
        // 403 Forbidden usually means key is invalid or quota exceeded
        const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC'; 
        
        console.log(`🔍 Searching GIPHY: ${query}`);
        
        const response = await axios.get(`https://api.giphy.com/v1/stickers/search`, {
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

// 6.1 GIPHY Trending - Get popular stickers
app.get('/api/giphy/trending', async (req, res) => {
    try {
        const limit = req.query.limit || 100;
        const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';
        
        console.log(`🔥 Fetching Trending GIPHY stickers`);
        
        const response = await axios.get(`https://api.giphy.com/v1/stickers/trending`, {
            params: {
                api_key: apiKey,
                limit: limit,
                rating: 'pg-13'
            }
        });
        
        const gifs = response.data.data.map(gif => ({
            id: gif.id,
            title: gif.title,
            url: gif.images.fixed_height.url,
            preview: gif.images.fixed_height_small.url
        }));
        
        res.json({ success: true, data: gifs });
        
    } catch (err) {
        console.error("GIPHY Trending Error:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to fetch trending GIFs' });
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
        
        // 🆕 Import all project settings (theme, room_name, visibility, etc.)
        const roomName = data.room_name || data.project?.room_name || title;
        const theme = data.theme || data.project?.theme || 'default';
        const category = data.category || data.project?.category || 'funny';
        const customHeaderName = data.custom_header_name || data.project?.custom_header_name || null;
        const showPartnerName = data.show_partner_name ?? data.project?.show_partner_name ?? 1;
        const showMyName = data.show_my_name ?? data.project?.show_my_name ?? 0;
        
        // Apply all settings
        if (roomName) await Project.updateRoomName(projectId, roomName);
        if (theme !== 'default') await Project.updateTheme(projectId, theme);
        if (customHeaderName) await Project.updateCustomHeaderName(projectId, customHeaderName);
        await Project.updateSettings(projectId, {
            show_partner_name: showPartnerName,
            show_my_name: showMyName
        });
        
        // Auto-generate TTS
        if (roomName) {
            try {
                const introResult = await generateIntroTTS(roomName, projectId, category);
                if (introResult && introResult.audioPath) {
                    await Project.updateIntroPath(projectId, introResult.audioPath);
                    console.log(`🎙️ Auto-generated intro TTS for imported project: ${roomName}`);
                }
            } catch (ttsErr) {
                console.warn('TTS generation skipped:', ttsErr.message);
            }
        }
        
        console.log(`📦 Imported settings: theme=${theme}, room=${roomName}, header=${customHeaderName}`);
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

// Get sounds by collection name (for swoosh dropdown)
app.get('/api/sounds/collection-name/:name', async (req, res) => {
    try {
        const collectionName = req.params.name;
        // First find the collection by name
        const collections = await SoundCollection.getAll();
        const collection = collections.find(c => c.name.toLowerCase() === collectionName.toLowerCase());
        
        if (!collection) {
            return res.json([]); // Return empty if collection not found
        }
        
        const sounds = await Sound.getByCollection(collection.id);
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
// Sitcom Engine: Memory API (Phase 3)
// ============================================

// Get memories for specific characters (for story generation context)
app.get('/api/memories/characters', async (req, res) => {
    try {
        const charIds = req.query.ids ? req.query.ids.split(',').map(Number) : [];
        if (charIds.length === 0) {
            return res.json({ memories: [], relationships: [] });
        }
        
        const memories = await Memory.getForCharacters(charIds);
        
        // Get relationships between these characters
        const relationships = [];
        for (let i = 0; i < charIds.length; i++) {
            for (let j = i + 1; j < charIds.length; j++) {
                const rel = await Relationship.get(charIds[i], charIds[j]);
                if (rel) {
                    // Add display names
                    const char1 = await CustomCharacter.getById(charIds[i]);
                    const char2 = await CustomCharacter.getById(charIds[j]);
                    rel.char1_name = char1?.display_name || 'Unknown';
                    rel.char2_name = char2?.display_name || 'Unknown';
                    relationships.push(rel);
                }
            }
        }
        
        res.json({ memories, relationships });
    } catch (err) {
        console.error('Memory fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all memories for a single character (Brain Tab)
app.get('/api/memories/character/:charId', async (req, res) => {
    try {
        const memories = await Memory.getAllForCharacter(Number(req.params.charId));
        res.json(memories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a memory manually
app.post('/api/memories', async (req, res) => {
    try {
        const { ownerCharId, aboutCharId, memoryText, type, importance, sourceProjectId } = req.body;
        if (!ownerCharId || !memoryText) {
            return res.status(400).json({ error: 'ownerCharId and memoryText required' });
        }
        const id = await Memory.add(ownerCharId, aboutCharId || null, memoryText, type || 'fact', importance || 5, sourceProjectId || null);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a memory
app.delete('/api/memories/:id', async (req, res) => {
    try {
        await Memory.delete(Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a memory (Edit)
app.put('/api/memories/:id', async (req, res) => {
    try {
        const { memoryText, type, importance } = req.body;
        if (!memoryText) {
            return res.status(400).json({ error: 'memoryText required' });
        }
        await Memory.update(Number(req.params.id), memoryText, type, importance);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Summarize and save story memories (Auto-Journaling)
app.post('/api/memories/summarize', async (req, res) => {
    try {
        const { projectId, dialogues, characterIds } = req.body;
        if (!dialogues || dialogues.length < 5) {
            return res.json({ success: false, message: 'Story too short' });
        }
        
        console.log('🧠 Summarizing story for memory...');
        console.log('📋 Received characterIds:', characterIds);
        const summary = await summarizeStory(dialogues);
        
        if (!summary) {
            return res.json({ success: false, message: 'Summarization failed' });
        }
        
        // Save facts to memories table
        const savedMemories = [];
        
        // Fetch all participating characters first for better matching
        const participatingChars = [];
        if (characterIds && characterIds.length > 0) {
            for (const id of characterIds) {
                const char = await CustomCharacter.getById(id);
                if (char) {
                    participatingChars.push(char);
                    console.log(`  ✓ Found character ID ${id}: ${char.display_name}`);
                } else {
                    console.log(`  ✗ Character ID ${id} not found in custom_characters`);
                }
            }
        }
        console.log(`📊 Found ${participatingChars.length} participating characters`);
        
        if (summary.facts && participatingChars.length > 0) {
            for (const fact of summary.facts) {
                // Improved Matching Strategy:
                // 1. Exact match display_name
                // 2. Contains match (e.g. "Boss" in "Boss Somchai")
                // 3. Name match (english name)
                
                const targetName = fact.about.toLowerCase();
                let aboutChar = participatingChars.find(c => c.display_name.toLowerCase() === targetName);
                
                if (!aboutChar) {
                    // Try partial match
                    aboutChar = participatingChars.find(c => c.display_name.toLowerCase().includes(targetName) || targetName.includes(c.display_name.toLowerCase()));
                }
                
                if (!aboutChar) {
                    // Try matching with 'name' field (often english)
                    aboutChar = participatingChars.find(c => c.name.toLowerCase() === targetName);
                }
                
                if (aboutChar) {
                    const memId = await Memory.add(
                        aboutChar.id,           // owner
                        null,                   // about (self-fact)
                        fact.fact,              // text
                        'fact',                 // type
                        fact.importance || 5,   // importance
                        projectId               // source
                    );
                    savedMemories.push({ id: memId, fact: fact.fact, owner: aboutChar.display_name });
                }
            }
            console.log(`Saved ${savedMemories.length} facts`);
        }
        
        // Save event summary to ALL participating characters (Shared Memory)
        if (summary.event_summary && characterIds && characterIds.length > 0) {
            for (const charId of characterIds) {
                await Memory.add(charId, null, summary.event_summary, 'event', 7, projectId);
            }
            console.log(`Saved event summary to ${characterIds.length} characters`);
        }
        
        // Update relationships (Round Robin for all pairs)
        // REQUIRES: At least 2 custom characters to create a relationship
        console.log(`💕 Relationship check: ${characterIds?.length || 0} characters, impact: ${summary.relationship_impact?.change}`);
        if (summary.relationship_impact && characterIds && characterIds.length >= 2) {
            console.log(`💕 Creating relationships for pairs of ${characterIds.length} characters...`);
            // Update every pair in the group
             for (let i = 0; i < characterIds.length; i++) {
                for (let j = i + 1; j < characterIds.length; j++) {
                    const id1 = characterIds[i];
                    const id2 = characterIds[j];
                    
                    const currentRel = await Relationship.get(id1, id2);
                    const currentScore = currentRel ? currentRel.score : 50;
                    // Apply change (maybe diluted for group? or full impact? Let's keep full for now)
                    const newScore = Math.max(0, Math.min(100, currentScore + summary.relationship_impact.change));
                    
                    await Relationship.upsert(id1, id2, newScore, 'friend');
                    console.log(`  💕 Relationship ${id1} <-> ${id2}: ${currentScore} → ${newScore}`);
                }
            }
            console.log(`💕 Updated relationships for ${characterIds.length} characters (${summary.relationship_impact.reason})`);
        } else {
            console.log(`⚠️ Skipped relationship update: Need at least 2 custom characters (got ${characterIds?.length || 0})`);
        }
        
        // Mark project as having saved memory
        if (projectId && savedMemories.length > 0) {
            await Project.updateMemorySaved(projectId, true);
            console.log(`🧠 Marked project ${projectId} as memory_saved`);
        }
        
        res.json({ 
            success: true, 
            summary: summary.event_summary,
            memories: savedMemories,
            relationship_change: summary.relationship_impact
        });
    } catch (err) {
        console.error('Summarize error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// Sitcom Engine: Relationship API
// ============================================

// Get all relationships for a character
// IMPORTANT: This route MUST come BEFORE /:char1/:char2 to avoid path conflict
app.get('/api/relationships/character/:charId', async (req, res) => {
    try {
        const relationships = await Relationship.getAllForCharacter(Number(req.params.charId));
        res.json(relationships);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get relationship between two characters
app.get('/api/relationships/:char1/:char2', async (req, res) => {
    try {
        const rel = await Relationship.get(Number(req.params.char1), Number(req.params.char2));
        res.json(rel || { score: 50, status: 'stranger' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update relationship
app.post('/api/relationships', async (req, res) => {
    try {
        const { charId1, charId2, score, status } = req.body;
        if (!charId1 || !charId2) {
            return res.status(400).json({ error: 'charId1 and charId2 required' });
        }
        const id = await Relationship.upsert(charId1, charId2, score || 50, status || 'friend');
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete relationship
app.delete('/api/relationships/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM relationships WHERE id = ?', [id]);
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
    console.log(`🧠 Sitcom Engine: Memory API enabled`);
});
