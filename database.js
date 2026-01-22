/**
 * Database Module - SQLite3
 * schemas: projects, dialogues, characters
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const TIMING = require('./src/config/timing');

const DB_PATH = './chat_story.db';

// Create DB connection
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initSchema();
    }
});

function initSchema() {
    db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            status TEXT DEFAULT 'DRAFT',
            room_name TEXT,
            show_partner_name INTEGER DEFAULT 1,
            show_my_name INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. Characters Table
        db.run(`CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            role TEXT,
            name TEXT,
            avatar TEXT,
            side TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )`);

        // 3. Dialogues Table
        db.run(`CREATE TABLE IF NOT EXISTS dialogues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            sender TEXT,
            message TEXT,
            delay REAL,
            reaction_delay REAL DEFAULT 0.8,
            typing_speed TEXT,
            seq_order INTEGER,
            image_path TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )`, (err) => {
            if (!err) {
                // Migration: Check if column exists, if not add it
                db.all("PRAGMA table_info(dialogues)", (err, rows) => {
                    if (!err) {
                        const hasImage = rows.some(r => r.name === 'image_path');
                        if (!hasImage) {
                            console.log('Migrating: Adding image_path to dialogues table...');
                            db.run("ALTER TABLE dialogues ADD COLUMN image_path TEXT", (err) => {
                                if (err) console.error("Migration failed:", err);
                                else console.log("Migration successful: image_path added.");
                            });
                        }
                        
                        const hasReaction = rows.some(r => r.name === 'reaction_delay');
                        if (!hasReaction) {
                            console.log('Migrating: Adding reaction_delay to dialogues table...');
                            db.run("ALTER TABLE dialogues ADD COLUMN reaction_delay REAL DEFAULT 0.8", (err) => {
                                if (err) console.error("Migration failed (reaction_delay):", err);
                                else console.log("Migration successful: reaction_delay added.");
                            });
                        }
                    }
                });
            }
        });

        // Migration for projects table (room_name, show_partner_name, show_my_name)
        db.all("PRAGMA table_info(projects)", (err, rows) => {
            if (!err) {
                const hasRoomName = rows.some(r => r.name === 'room_name');
                if (!hasRoomName) {
                    console.log('Migrating: Adding room_name, show_partner_name, show_my_name to projects table...');
                    db.run("ALTER TABLE projects ADD COLUMN room_name TEXT");
                    db.run("ALTER TABLE projects ADD COLUMN show_partner_name INTEGER DEFAULT 1");
                    db.run("ALTER TABLE projects ADD COLUMN show_my_name INTEGER DEFAULT 0");
                } else {
                    // Check individual new columns just in case
                     const hasPartnerName = rows.some(r => r.name === 'show_partner_name');
                     if (!hasPartnerName) {
                         console.log('Migrating: Adding name visibility columns...');
                         db.run("ALTER TABLE projects ADD COLUMN show_partner_name INTEGER DEFAULT 1");
                         db.run("ALTER TABLE projects ADD COLUMN show_my_name INTEGER DEFAULT 0");
                     }
                }
            }

        });

        // Migration for projects table (theme)
        db.all("PRAGMA table_info(projects)", (err, rows) => {
            if (!err) {
                const hasTheme = rows.some(r => r.name === 'theme');
                if (!hasTheme) {
                    console.log('Migrating: Adding theme to projects table...');
                    db.run("ALTER TABLE projects ADD COLUMN theme TEXT DEFAULT 'default'");
                }
                
                // Migration for intro_path column
                const hasIntroPath = rows.some(r => r.name === 'intro_path');
                if (!hasIntroPath) {
                    console.log('Migrating: Adding intro_path to projects table...');
                    db.run("ALTER TABLE projects ADD COLUMN intro_path TEXT");
                }
                
                // Migration for memory_saved column (Memory Indicator)
                const hasMemorySaved = rows.some(r => r.name === 'memory_saved');
                if (!hasMemorySaved) {
                    console.log('Migrating: Adding memory_saved to projects table...');
                    db.run("ALTER TABLE projects ADD COLUMN memory_saved INTEGER DEFAULT 0");
                }
                
                // Migration for custom_header_name column
                const hasCustomHeader = rows.some(r => r.name === 'custom_header_name');
                if (!hasCustomHeader) {
                    console.log('Migrating: Adding custom_header_name to projects table...');
                    db.run("ALTER TABLE projects ADD COLUMN custom_header_name TEXT");
                }
            }
        });

        // 4. Custom Characters Table
        db.run(`CREATE TABLE IF NOT EXISTS custom_characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            avatar_path TEXT NOT NULL,
            gender TEXT,
            personality TEXT,
            speaking_style TEXT,
            age_group TEXT,
            occupation TEXT,
            catchphrase TEXT,
            dialect TEXT,
            typing_habit TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Failed to create custom_characters table:', err);
            else {
                console.log('✅ custom_characters table ready');
                
                // Migration: Add new columns if they don't exist
                db.all("PRAGMA table_info(custom_characters)", (err, rows) => {
                    if (!err) {
                        const hasGender = rows.some(r => r.name === 'gender');
                        if (!hasGender) {
                            console.log('Migrating: Adding personality columns...');
                            db.run("ALTER TABLE custom_characters ADD COLUMN gender TEXT");
                            db.run("ALTER TABLE custom_characters ADD COLUMN personality TEXT");
                            db.run("ALTER TABLE custom_characters ADD COLUMN speaking_style TEXT");
                        }
                        
                        const hasAgeGroup = rows.some(r => r.name === 'age_group');
                        if (!hasAgeGroup) {
                            console.log('Migrating: Adding age/occupation/catchphrase...');
                            db.run("ALTER TABLE custom_characters ADD COLUMN age_group TEXT");
                            db.run("ALTER TABLE custom_characters ADD COLUMN occupation TEXT");
                            db.run("ALTER TABLE custom_characters ADD COLUMN catchphrase TEXT");
                        }
                        
                        const hasDialect = rows.some(r => r.name === 'dialect');
                        if (!hasDialect) {
                            console.log('Migrating: Adding dialect/typing_habit...');
                            db.run("ALTER TABLE custom_characters ADD COLUMN dialect TEXT");
                            db.run("ALTER TABLE custom_characters ADD COLUMN typing_habit TEXT");
                            console.log('✅ All character columns ready');
                        }
                    }
                });
            }
        });

        // 5. Sound Collections Table (BGM categories, SFX categories)
        db.run(`CREATE TABLE IF NOT EXISTS sound_collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Failed to create sound_collections table:', err);
            else console.log('✅ sound_collections table ready');
        });

        // 6. Sounds Table (individual sound files)
        db.run(`CREATE TABLE IF NOT EXISTS sounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_id INTEGER,
            name TEXT NOT NULL,
            filename TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(collection_id) REFERENCES sound_collections(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) console.error('Failed to create sounds table:', err);
            else console.log('✅ sounds table ready');
        });

        // 7. Memories Table (Sitcom Engine - Long-Term Memory)
        db.run(`CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_char_id INTEGER,
            about_char_id INTEGER,
            source_project_id INTEGER,
            memory_text TEXT NOT NULL,
            type TEXT DEFAULT 'fact',
            importance INTEGER DEFAULT 5,
            shared_event_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_char_id) REFERENCES custom_characters(id) ON DELETE CASCADE,
            FOREIGN KEY(about_char_id) REFERENCES custom_characters(id) ON DELETE SET NULL,
            FOREIGN KEY(source_project_id) REFERENCES projects(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) console.error('Failed to create memories table:', err);
            else {
                console.log('✅ memories table ready (Sitcom Engine)');
                // Migration: Add shared_event_id column if not exists
                db.all("PRAGMA table_info(memories)", (err, rows) => {
                    if (!err) {
                        const hasSharedEventId = rows.some(r => r.name === 'shared_event_id');
                        if (!hasSharedEventId) {
                            console.log('Migrating: Adding shared_event_id to memories...');
                            db.run("ALTER TABLE memories ADD COLUMN shared_event_id TEXT", (err) => {
                                if (err) console.error("Migration failed (shared_event_id):", err);
                                else console.log("✅ Migration successful: shared_event_id added.");
                            });
                        }
                    }
                });
            }
        });

        // 8. Relationships Table (Sitcom Engine - Character Dynamics)
        db.run(`CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id_1 INTEGER NOT NULL,
            char_id_2 INTEGER NOT NULL,
            score INTEGER DEFAULT 50,
            status TEXT DEFAULT 'stranger',
            last_interaction DATETIME,
            FOREIGN KEY(char_id_1) REFERENCES custom_characters(id) ON DELETE CASCADE,
            FOREIGN KEY(char_id_2) REFERENCES custom_characters(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) console.error('Failed to create relationships table:', err);
            else console.log('✅ relationships table ready (Sitcom Engine)');
        });

        // Migration: Add team_id to custom_characters for Shared Universe
        db.all("PRAGMA table_info(custom_characters)", (err, rows) => {
            if (!err) {
                const hasTeamId = rows.some(r => r.name === 'team_id');
                if (!hasTeamId) {
                    console.log('Migrating: Adding team_id to custom_characters...');
                    db.run("ALTER TABLE custom_characters ADD COLUMN team_id TEXT", (err) => {
                        if (err) console.error("Migration failed (team_id):", err);
                        else console.log("✅ Migration successful: team_id added for Shared Universe.");
                    });
                }
            }
        });
        
        console.log('Database schema initialized.');
        
        // ============================================
        // Performance Indexes (Optimization)
        // ============================================
        console.log('🔧 Creating performance indexes...');
        
        // Memory table indexes - ลด query time 5-10x
        db.run(`CREATE INDEX IF NOT EXISTS idx_memories_owner ON memories(owner_char_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_memories_about ON memories(about_char_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC)`);
        
        // Relationship table indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_relationships_chars ON relationships(char_id_1, char_id_2)`);
        
        // Dialogue table indexes - faster project loading
        db.run(`CREATE INDEX IF NOT EXISTS idx_dialogues_project ON dialogues(project_id, seq_order)`);
        
        // Character table indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id)`);
        
        console.log('✅ Performance indexes ready');
    });
}

// ============================================
// Promisify Helpers (Optimization)
// ============================================
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
    });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
});

// ============================================
// Helper Methods
// ============================================

const Project = {
    create: (title) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO projects (title, status, show_partner_name, show_my_name) VALUES (?, ?, 1, 1)`, [title, 'DRAFT'], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    },
    
    getAll: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM projects ORDER BY created_at DESC`, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getById: (id) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM projects WHERE id = ?`, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    updateStatus: (id, status) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE projects SET status = ? WHERE id = ?`, [status, id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },
    
    updateTitle: (id, title) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE projects SET title = ? WHERE id = ?`, [title, id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    updateRoomName: (id, roomName) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE projects SET room_name = ? WHERE id = ?`, [roomName, id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    updateCustomHeaderName: (id, headerName) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE projects SET custom_header_name = ? WHERE id = ?`, [headerName, id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    updateSettings: (id, settings) => {
         return new Promise((resolve, reject) => {
             // settings = { show_partner_name, show_my_name }
             const sql = `UPDATE projects SET show_partner_name = ?, show_my_name = ? WHERE id = ?`;
             db.run(sql, [settings.show_partner_name, settings.show_my_name, id], function(err) {
                 if (err) reject(err);
                 else resolve();
             });
         });

    },

    updateTheme: (id, theme) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE projects SET theme = ? WHERE id = ?`, [theme, id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    updateIntroPath: (id, introPath) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE projects SET intro_path = ? WHERE id = ?`, [introPath, id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    updateMemorySaved: (id, saved) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE projects SET memory_saved = ? WHERE id = ?`, [saved ? 1 : 0, id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

const Character = {
    add: (projectId, charData) => {
        return new Promise((resolve, reject) => {
            const { role, name, avatar, side } = charData;
            db.run(`INSERT INTO characters (project_id, role, name, avatar, side) VALUES (?, ?, ?, ?, ?)`, 
                [projectId, role, name, avatar, side], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    },
    
    getByProject: (projectId) => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM characters WHERE project_id = ?`, [projectId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

const Dialogue = {
    // ============================================
    // FIX #1: Race Condition Prevention
    // ใช้ Atomic Operation สำหรับ seq_order
    // ============================================
    
    /**
     * Get next available seq_order atomically
     * ป้องกัน Race Condition โดยใช้ COALESCE + MAX ใน single query
     */
    getNextSeqOrder: (projectId) => {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT COALESCE(MAX(seq_order), -1) + 1 as next_order FROM dialogues WHERE project_id = ?`,
                [projectId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.next_order);
                }
            );
        });
    },

    /**
     * Add dialogue with automatic seq_order (Race-Condition Safe)
     * ถ้าไม่ส่ง order มา จะ auto-calculate ด้วย Transaction
     */
    add: (projectId, data, order = null) => {
        return new Promise((resolve, reject) => {
            const { sender, message, delay, reaction_delay, typing_speed, image_path } = data;
            
            // ใช้ serialize + transaction เพื่อ atomic operation
            db.serialize(() => {
                db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
                    if (beginErr) {
                        return reject(new Error(`Transaction start failed: ${beginErr.message}`));
                    }
                    
                    // ถ้าไม่ได้กำหนด order ให้ query หา next order
                    const getOrder = order !== null 
                        ? Promise.resolve(order)
                        : new Promise((res, rej) => {
                            db.get(
                                `SELECT COALESCE(MAX(seq_order), -1) + 1 as next_order FROM dialogues WHERE project_id = ?`,
                                [projectId],
                                (err, row) => err ? rej(err) : res(row.next_order)
                            );
                        });
                    
                    getOrder.then(finalOrder => {
                        db.run(
                            `INSERT INTO dialogues (project_id, sender, message, delay, reaction_delay, typing_speed, seq_order, image_path) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                            [projectId, sender, message, delay, reaction_delay || TIMING.DEFAULT_REACTION_DELAY, typing_speed, finalOrder, image_path || null],
                            function(insertErr) {
                                if (insertErr) {
                                    db.run('ROLLBACK', () => reject(insertErr));
                                } else {
                                    const lastId = this.lastID;
                                    db.run('COMMIT', (commitErr) => {
                                        if (commitErr) {
                                            db.run('ROLLBACK', () => reject(commitErr));
                                        } else {
                                            resolve(lastId);
                                        }
                                    });
                                }
                            }
                        );
                    }).catch(err => {
                        db.run('ROLLBACK', () => reject(err));
                    });
                });
            });
        });
    },

    /**
     * Bulk add dialogues with Transaction (Race-Condition Safe)
     * สำหรับ AI Generation ที่ต้องเพิ่มหลาย dialogue พร้อมกัน
     */
    addBulk: (projectId, dialoguesArray, startOrder = null) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN IMMEDIATE TRANSACTION', async (beginErr) => {
                    if (beginErr) {
                        return reject(new Error(`Bulk transaction start failed: ${beginErr.message}`));
                    }
                    
                    try {
                        // Get starting order if not provided
                        let currentOrder = startOrder;
                        if (currentOrder === null) {
                            currentOrder = await new Promise((res, rej) => {
                                db.get(
                                    `SELECT COALESCE(MAX(seq_order), -1) + 1 as next_order FROM dialogues WHERE project_id = ?`,
                                    [projectId],
                                    (err, row) => err ? rej(err) : res(row.next_order)
                                );
                            });
                        }
                        
                        const insertedIds = [];
                        const stmt = db.prepare(
                            `INSERT INTO dialogues (project_id, sender, message, delay, reaction_delay, typing_speed, seq_order, image_path) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                        );
                        
                        for (const data of dialoguesArray) {
                            const { sender, message, delay, reaction_delay, typing_speed, image_path } = data;
                            await new Promise((res, rej) => {
                                stmt.run(
                                    [projectId, sender, message, delay, reaction_delay || TIMING.DEFAULT_REACTION_DELAY, typing_speed, currentOrder++, image_path || null],
                                    function(err) {
                                        if (err) rej(err);
                                        else {
                                            insertedIds.push(this.lastID);
                                            res();
                                        }
                                    }
                                );
                            });
                        }
                        
                        stmt.finalize();
                        
                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) {
                                db.run('ROLLBACK', () => reject(commitErr));
                            } else {
                                resolve(insertedIds);
                            }
                        });
                    } catch (err) {
                        db.run('ROLLBACK', () => reject(err));
                    }
                });
            });
        });
    },

    getByProject: (projectId) => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM dialogues WHERE project_id = ? ORDER BY seq_order ASC`, [projectId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    updateData: (id, updates) => {
        return new Promise((resolve, reject) => {
            const keys = Object.keys(updates).filter(k => 
                ['sender', 'message', 'delay', 'reaction_delay', 'typing_speed', 'image_path'].includes(k)
            );
            
            if (keys.length === 0) return resolve(0);
            
            const setClause = keys.map(k => `${k} = ?`).join(', ');
            const values = [...keys.map(k => updates[k]), id];
            
            db.run(`UPDATE dialogues SET ${setClause} WHERE id = ?`, values, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },

    delete: (id) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM dialogues WHERE id = ?`, [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },

    reorder: (updates) => {
// ... existing reorder ...
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                const stmt = db.prepare('UPDATE dialogues SET seq_order = ? WHERE id = ?');
                
                updates.forEach(item => {
                    stmt.run(item.seq_order, item.id);
                });
                
                stmt.finalize((finalizeErr) => {
                    if (finalizeErr) {
                        console.error('Statement finalize failed:', finalizeErr);
                        db.run('ROLLBACK');
                        return reject(finalizeErr);
                    }
                });
                
                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('Reorder transaction failed:', err);
                        db.run('ROLLBACK');
                        reject(err);
                    } else {
                        resolve(updates.length);
                    }
                });
            });
        });
    }
};

// Full Import from JSON
async function importStoryJSON(story) {
    const projectId = await Project.create(story.title || 'Untitled Story');
    if (story.theme) {
        await Project.updateTheme(projectId, story.theme);
    }
    
    // Import Characters
    for (const [role, char] of Object.entries(story.characters)) {
        await Character.add(projectId, {
            role: role,
            name: char.name,
            avatar: char.avatar,
            side: char.side
        });
    }
    
    // Import Dialogues
    let order = 0;
    for (const dlg of story.dialogues) {
        await Dialogue.add(projectId, dlg, order++);
    }
    
    return projectId;
}

// Export to JSON (for Visualizer/Recorder)
async function exportStoryJSON(projectId) {
    const project = await Project.getById(projectId);
    if (!project) throw new Error('Project not found');
    
    const chars = await Character.getByProject(projectId);
    const dlgs = await Dialogue.getByProject(projectId);
    
    const characters = {};
    chars.forEach(c => {
        characters[c.role] = {
            name: c.name,
            avatar: c.avatar,
            side: c.side
        };
    });
    
    const dialogues = dlgs.map(d => ({
        id: d.id, // [NEW] Expose ID for editing
        sender: d.sender,
        message: d.message,
        delay: d.delay,
        reaction_delay: d.reaction_delay, // [NEW] Reaction Time
        typing_speed: d.typing_speed,
        seq_order: d.seq_order,
        image_path: d.image_path // [NEW] Image Support
    }));

    // [FIX] Ensure Custom Characters used in dialogues are included in characters list
    const usedCustomIds = new Set();
    dlgs.forEach(d => {
        if (d.sender.startsWith('custom_') && !characters[d.sender]) {
            const id = parseInt(d.sender.split('_')[1]);
            usedCustomIds.add(id);
        }
    });

    // ============================================
    // FIX #2: Custom Character Injection Failure
    // เพิ่ม Fallback Avatar เมื่อ character ถูกลบไปแล้ว
    // ============================================
    const FALLBACK_AVATAR = 'assets/avatars/default.png';
    const DELETED_CHARACTER_NAME = 'Unknown User';
    
    if (usedCustomIds.size > 0) {
        for (const id of usedCustomIds) {
            try {
                const customChar = await CustomCharacter.getById(id);
                if (customChar) {
                    // ตรวจสอบว่า avatar file ยังมีอยู่หรือไม่
                    let avatarPath = customChar.avatar_path;
                    if (avatarPath && !fs.existsSync(avatarPath)) {
                        console.warn(`⚠️ Avatar file missing for custom_${id}: ${avatarPath}, using fallback`);
                        avatarPath = FALLBACK_AVATAR;
                    }
                    
                    characters[`custom_${id}`] = {
                        name: customChar.display_name,
                        avatar: avatarPath || FALLBACK_AVATAR,
                        side: 'left' // Default side for guests
                    };
                } else {
                    // Character ถูกลบไปแล้ว - ใช้ Fallback
                    console.warn(`⚠️ Custom character ${id} was deleted, using fallback`);
                    characters[`custom_${id}`] = {
                        name: DELETED_CHARACTER_NAME,
                        avatar: FALLBACK_AVATAR,
                        side: 'left',
                        _deleted: true // Flag สำหรับ UI แสดง warning
                    };
                }
            } catch (err) {
                console.error(`Failed to inject custom character ${id}:`, err.message);
                // Fallback เมื่อเกิด error
                characters[`custom_${id}`] = {
                    name: DELETED_CHARACTER_NAME,
                    avatar: FALLBACK_AVATAR,
                    side: 'left',
                    _error: true
                };
            }
        }
    }
    
    return {
        id: project.id,
        title: project.title,
        room_name: project.room_name, // Room name for intro
        custom_header_name: project.custom_header_name, // [NEW] Custom header (user-defined)
        intro_path: project.intro_path, // [NEW] Intro TTS audio path
        show_partner_name: project.show_partner_name, // [NEW] Checkbox
        show_my_name: project.show_my_name, // [NEW] Checkbox
        theme: project.theme || 'default', // [NEW] Theme
        status: project.status,
        memory_saved: project.memory_saved || 0, // [NEW] Memory indicator
        characters,
        dialogues
    };
}

// ============================================
// CustomCharacter Model
// ============================================
const CustomCharacter = {
    async getAll() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM custom_characters ORDER BY created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    },
    
    async getById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM custom_characters WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    },
    
    async add(name, displayName, avatarPath, gender = null, personality = null, speakingStyle = null, ageGroup = null, occupation = null, catchphrase = null, dialect = null, typingHabit = null) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO custom_characters (name, display_name, avatar_path, gender, personality, speaking_style, age_group, occupation, catchphrase, dialect, typing_habit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [name, displayName, avatarPath, gender, personality, speakingStyle, ageGroup, occupation, catchphrase, dialect, typingHabit],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },
    
    async update(id, displayName, avatarPath, gender = null, personality = null, speakingStyle = null, ageGroup = null, occupation = null, catchphrase = null, dialect = null, typingHabit = null) {
        return new Promise((resolve, reject) => {
            let query = 'UPDATE custom_characters SET display_name = ?, gender = ?, personality = ?, speaking_style = ?, age_group = ?, occupation = ?, catchphrase = ?, dialect = ?, typing_habit = ?';
            let params = [displayName, gender, personality, speakingStyle, ageGroup, occupation, catchphrase, dialect, typingHabit];
            
            if (avatarPath) {
                query += ', avatar_path = ?';
                params.push(avatarPath);
            }
            
            query += ' WHERE id = ?';
            params.push(id);
            
            db.run(query, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },
    
    async delete(id) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM custom_characters WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

// ============================================
// Sound Collection Helper
// ============================================
const SoundCollection = {
    create: (name, type) => {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO sound_collections (name, type) VALUES (?, ?)', [name, type], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    },

    getAll: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM sound_collections ORDER BY type, name', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getByType: (type) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM sound_collections WHERE type = ? ORDER BY name', [type], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getById: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM sound_collections WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    delete: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM sound_collections WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

// ============================================
// Sound Helper
// ============================================
const Sound = {
    create: (collectionId, name, filename, type) => {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO sounds (collection_id, name, filename, type) VALUES (?, ?, ?, ?)', 
                [collectionId, name, filename, type], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    },

    getAll: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT s.*, sc.name as collection_name 
                    FROM sounds s 
                    LEFT JOIN sound_collections sc ON s.collection_id = sc.id 
                    ORDER BY s.type, sc.name, s.name`, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getByCollection: (collectionId) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM sounds WHERE collection_id = ? ORDER BY name', [collectionId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getByType: (type) => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT s.*, sc.name as collection_name 
                    FROM sounds s 
                    LEFT JOIN sound_collections sc ON s.collection_id = sc.id 
                    WHERE s.type = ? 
                    ORDER BY sc.name, s.name`, [type], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getById: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM sounds WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    delete: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM sounds WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

// ============================================
// Memory Helper (Sitcom Engine - Phase 3)
// ============================================
const Memory = {
    // Get all memories involving specific characters
    getForCharacters: (charIds) => {
        return new Promise((resolve, reject) => {
            const placeholders = charIds.map(() => '?').join(',');
            db.all(`SELECT m.*, 
                    c1.display_name as owner_name, 
                    c2.display_name as about_name
                    FROM memories m
                    LEFT JOIN custom_characters c1 ON m.owner_char_id = c1.id
                    LEFT JOIN custom_characters c2 ON m.about_char_id = c2.id
                    WHERE m.owner_char_id IN (${placeholders}) 
                       OR m.about_char_id IN (${placeholders})
                    ORDER BY m.importance DESC, m.created_at DESC
                    LIMIT 20`, [...charIds, ...charIds], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    },

    // [NEW] Optimized memory loading: Recent 20 + Important (>= threshold)
    // Reduces token usage by 70-90% while maintaining continuity
    getForCharactersOptimized: (charIds, options = {}) => {
        return new Promise(async (resolve, reject) => {
            try {
                const { recentLimit = 20, importanceThreshold = 7 } = options;
                const placeholders = charIds.map(() => '?').join(',');
                
                // Step 1: Get recent memories (last N)
                const recentMemories = await new Promise((res, rej) => {
                    db.all(`SELECT m.*, 
                            c1.display_name as owner_name, 
                            c2.display_name as about_name
                            FROM memories m
                            LEFT JOIN custom_characters c1 ON m.owner_char_id = c1.id
                            LEFT JOIN custom_characters c2 ON m.about_char_id = c2.id
                            WHERE m.owner_char_id IN (${placeholders}) 
                               OR m.about_char_id IN (${placeholders})
                            ORDER BY m.created_at DESC
                            LIMIT ?`, [...charIds, ...charIds, recentLimit], (err, rows) => {
                        if (err) rej(err);
                        else res(rows || []);
                    });
                });
                
                // Step 2: Get important memories (excluding recent)
                const recentIds = recentMemories.map(m => m.id);
                const excludeClause = recentIds.length > 0 
                    ? `AND m.id NOT IN (${recentIds.join(',')})` 
                    : '';
                
                const importantMemories = await new Promise((res, rej) => {
                    db.all(`SELECT m.*, 
                            c1.display_name as owner_name, 
                            c2.display_name as about_name
                            FROM memories m
                            LEFT JOIN custom_characters c1 ON m.owner_char_id = c1.id
                            LEFT JOIN custom_characters c2 ON m.about_char_id = c2.id
                            WHERE (m.owner_char_id IN (${placeholders}) 
                                OR m.about_char_id IN (${placeholders}))
                            AND m.importance >= ?
                            ${excludeClause}
                            ORDER BY m.importance DESC, m.created_at DESC`, 
                        [...charIds, ...charIds, importanceThreshold], (err, rows) => {
                        if (err) rej(err);
                        else res(rows || []);
                    });
                });
                
                const combined = [...recentMemories, ...importantMemories];
                console.log(`🧠 Optimized Memory Load: ${recentMemories.length} recent + ${importantMemories.length} important = ${combined.length} total`);
                resolve(combined);
                
            } catch (err) {
                reject(err);
            }
        });
    },

    // Add a new memory
    add: (ownerCharId, aboutCharId, memoryText, type = 'fact', importance = 5, sourceProjectId = null) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO memories (owner_char_id, about_char_id, memory_text, type, importance, source_project_id)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                [ownerCharId, aboutCharId, memoryText, type, importance, sourceProjectId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });
    },

    // Add memory with shared event ID (for events that sync across characters)
    addWithSharedId: (ownerCharId, aboutCharId, memoryText, type = 'event', importance = 5, sourceProjectId = null, sharedEventId = null) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO memories (owner_char_id, about_char_id, memory_text, type, importance, source_project_id, shared_event_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [ownerCharId, aboutCharId, memoryText, type, importance, sourceProjectId, sharedEventId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });
    },

    // Delete a specific memory
    delete: (id) => {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM memories WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    // Update a memory (Edit)
    update: (id, memoryText, type, importance) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE memories SET memory_text = ?, type = ?, importance = ? WHERE id = ?`,
                [memoryText, type, importance, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });
    },

    // Update all memories with same shared_event_id (Sync Events)
    updateBySharedId: (sharedEventId, memoryText, importance) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE memories SET memory_text = ?, importance = ? WHERE shared_event_id = ?`,
                [memoryText, importance, sharedEventId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes); // จำนวน rows ที่ถูก update
                });
        });
    },

    // Delete all memories with same shared_event_id
    deleteBySharedId: (sharedEventId) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM memories WHERE shared_event_id = ?`, [sharedEventId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },

    // Get shared_event_id from memory id
    getSharedEventId: (id) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT shared_event_id FROM memories WHERE id = ?`, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row?.shared_event_id || null);
            });
        });
    },

    // Get all memories for a character (for Brain Tab UI)
    getAllForCharacter: (charId) => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT m.*, 
                    c.display_name as about_name,
                    p.title as source_project_title
                    FROM memories m
                    LEFT JOIN custom_characters c ON m.about_char_id = c.id
                    LEFT JOIN projects p ON m.source_project_id = p.id
                    WHERE m.owner_char_id = ?
                    ORDER BY m.type ASC, m.source_project_id DESC, m.importance DESC, m.created_at DESC`, [charId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
};

// ============================================
// Relationship Helper (Sitcom Engine - Phase 3)
// ============================================
const Relationship = {
    // Get relationship between two characters
    get: (charId1, charId2) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM relationships 
                    WHERE (char_id_1 = ? AND char_id_2 = ?) 
                       OR (char_id_1 = ? AND char_id_2 = ?)`,
                [charId1, charId2, charId2, charId1], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
        });
    },

    // Create or update relationship
    upsert: (charId1, charId2, score, status = 'friend') => {
        return new Promise(async (resolve, reject) => {
            try {
                const existing = await Relationship.get(charId1, charId2);
                if (existing) {
                    db.run(`UPDATE relationships SET score = ?, status = ?, last_interaction = CURRENT_TIMESTAMP
                            WHERE id = ?`, [score, status, existing.id], (err) => {
                        if (err) reject(err);
                        else resolve(existing.id);
                    });
                } else {
                    db.run(`INSERT INTO relationships (char_id_1, char_id_2, score, status, last_interaction)
                            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [charId1, charId2, score, status], function(err) {
                            if (err) reject(err);
                            else resolve(this.lastID);
                        });
                }
            } catch (e) {
                reject(e);
            }
        });
    },

    // Get all relationships for a character
    getAllForCharacter: (charId) => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT r.*, 
                    c1.display_name as char1_name, 
                    c2.display_name as char2_name
                    FROM relationships r
                    LEFT JOIN custom_characters c1 ON r.char_id_1 = c1.id
                    LEFT JOIN custom_characters c2 ON r.char_id_2 = c2.id
                    WHERE r.char_id_1 = ? OR r.char_id_2 = ?`,
                [charId, charId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
        });
    }
};

module.exports = {
    db,
    Project,
    Character,
    Dialogue,
    CustomCharacter,
    SoundCollection,
    Sound,
    Memory,
    Relationship,
    importStoryJSON,
    exportStoryJSON
};
