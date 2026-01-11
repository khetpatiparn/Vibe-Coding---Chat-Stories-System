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
            typing_speed TEXT,
            camera_effect TEXT,
            seq_order INTEGER,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )`);

        // 4. Custom Characters Table
        db.run(`CREATE TABLE IF NOT EXISTS custom_characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            avatar_path TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Failed to create custom_characters table:', err);
            else console.log('✅ custom_characters table ready');
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
            const { sender, message, delay, typing_speed, camera_effect } = data;
            db.run(`INSERT INTO dialogues (project_id, sender, message, delay, typing_speed, camera_effect, seq_order) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                [projectId, sender, message, delay, typing_speed, camera_effect, order], function(err) {
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

    update: (id, text) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE dialogues SET message = ? WHERE id = ?`, [text, id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },
    
    updateAll: (id, data) => {
        return new Promise((resolve, reject) => {
             const { message, sender, camera_effect } = data;
             db.run(`UPDATE dialogues SET message = ?, sender = ?, camera_effect = ? WHERE id = ?`, 
                [message, sender, camera_effect, id], function(err) {
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
        typing_speed: d.typing_speed,
        camera_effect: d.camera_effect,
        seq_order: d.seq_order
    }));
    
    return {
        id: project.id,
        title: project.title,
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
    
    async add(name, displayName, avatarPath) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO custom_characters (name, display_name, avatar_path) VALUES (?, ?, ?)',
                [name, displayName, avatarPath],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },
    
    async update(id, displayName, avatarPath) {
        return new Promise((resolve, reject) => {
            let query = 'UPDATE custom_characters SET display_name = ?';
            let params = [displayName];
            
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

module.exports = {
    db,
    Project,
    Character,
    Dialogue,
    CustomCharacter,
    importStoryJSON,
    exportStoryJSON
};
