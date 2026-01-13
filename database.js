/**
 * Database Module - SQLite3
 * schemas: projects, dialogues, characters
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

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
        // 1. Projects Table
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            status TEXT DEFAULT 'DRAFT',
            room_name TEXT,
            show_partner_name INTEGER DEFAULT 1,
            show_my_name INTEGER DEFAULT 0,
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
            reaction_delay REAL DEFAULT 0.5,
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
                            db.run("ALTER TABLE dialogues ADD COLUMN reaction_delay REAL DEFAULT 0.5", (err) => {
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
        
        console.log('Database schema initialized.');
    });
}

// ============================================
// Helper Methods
// ============================================

const Project = {
    create: (title) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO projects (title, status) VALUES (?, ?)`, [title, 'DRAFT'], function(err) {
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

    updateSettings: (id, settings) => {
         return new Promise((resolve, reject) => {
             // settings = { show_partner_name, show_my_name }
             const sql = `UPDATE projects SET show_partner_name = ?, show_my_name = ? WHERE id = ?`;
             db.run(sql, [settings.show_partner_name, settings.show_my_name, id], function(err) {
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
    add: (projectId, data, order) => {
        return new Promise((resolve, reject) => {
            const { sender, message, delay, typing_speed } = data;
            db.run(`INSERT INTO dialogues (project_id, sender, message, delay, typing_speed, seq_order) 
                VALUES (?, ?, ?, ?, ?, ?)`, 
                [projectId, sender, message, delay, typing_speed, order], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
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
                
                stmt.finalize();
                
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

    if (usedCustomIds.size > 0) {
        for (const id of usedCustomIds) {
            try {
                const customChar = await CustomCharacter.getById(id);
                if (customChar) {
                    characters[`custom_${id}`] = {
                        name: customChar.display_name,
                        avatar: customChar.avatar_path,
                        side: 'left' // Default side for guests
                    };
                }
            } catch (err) {
                console.error(`Failed to inject custom character ${id}`, err);
            }
        }
    }
    
    return {
        id: project.id,
        title: project.title,
        room_name: project.room_name, // Room name for header
        show_partner_name: project.show_partner_name, // [NEW] Checkbox
        show_my_name: project.show_my_name, // [NEW] Checkbox
        status: project.status,
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

module.exports = {
    db,
    Project,
    Character,
    Dialogue,
    CustomCharacter,
    SoundCollection,
    Sound,
    importStoryJSON,
    exportStoryJSON
};
