/**
 * Brain Tab - Character Memory & Relationship Manager
 * Part of the Sitcom Engine
 */

let characters = [];
let selectedCharacter = null;
let memories = [];
let relationships = [];

// DOM Elements
const selectCharacter = document.getElementById('select-character');
const btnAddMemory = document.getElementById('btn-add-memory');
const emptyState = document.getElementById('empty-state');
const memoryPanel = document.getElementById('memory-panel');
const memoryCount = document.getElementById('memory-count');

// Modal Elements
const modalAddMemory = document.getElementById('modal-add-memory');
const modalAddRel = document.getElementById('modal-add-relationship');

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadCharacters();
    setupEventListeners();
});

async function loadCharacters() {
    try {
        const res = await fetch('/api/characters/custom');
        characters = await res.json();
        
        // Populate dropdown
        selectCharacter.innerHTML = '<option value="">-- Select Character --</option>';
        characters.forEach(char => {
            const opt = document.createElement('option');
            opt.value = char.id;
            opt.textContent = char.display_name;
            selectCharacter.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load characters:', err);
    }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // Character selection
    selectCharacter.addEventListener('change', async (e) => {
        const charId = parseInt(e.target.value);
        if (charId) {
            selectedCharacter = characters.find(c => c.id === charId);
            btnAddMemory.disabled = false;
            await loadCharacterData(charId);
            showMemoryPanel();
        } else {
            selectedCharacter = null;
            btnAddMemory.disabled = true;
            hideMemoryPanel();
        }
    });

    // Add Memory Button
    btnAddMemory.addEventListener('click', () => {
        modalAddMemory.classList.remove('hidden');
    });

    // Cancel Memory Modal
    document.getElementById('btn-cancel-memory').addEventListener('click', () => {
        modalAddMemory.classList.add('hidden');
    });

    // Memory Form Submit
    document.getElementById('memory-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveMemory();
    });

    // Importance slider
    document.getElementById('memory-importance').addEventListener('input', (e) => {
        document.getElementById('importance-value').textContent = e.target.value;
    });

    // Relationship score slider
    document.getElementById('rel-score').addEventListener('input', (e) => {
        const val = e.target.value;
        const display = document.getElementById('rel-score-value');
        display.textContent = val;
        
        // Change color based on score
        if (val >= 70) display.style.color = '#51cf66';
        else if (val >= 40) display.style.color = '#ffd43b';
        else display.style.color = '#ff6b6b';
    });

    // Cancel Relationship Modal
    document.getElementById('btn-cancel-rel').addEventListener('click', () => {
        modalAddRel.classList.add('hidden');
    });

    // Relationship Form Submit
    document.getElementById('relationship-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveRelationship();
    });
}

// ============================================
// Data Loading
// ============================================
async function loadCharacterData(charId) {
    try {
        // Load memories
        const memRes = await fetch(`/api/memories/character/${charId}`);
        memories = await memRes.json();
        
        // Load relationships
        const relRes = await fetch(`/api/relationships/character/${charId}`);
        relationships = await relRes.json();
        
        // Update count
        memoryCount.textContent = memories.length;
        
        renderMemories();
        renderRelationships();
    } catch (err) {
        console.error('Failed to load character data:', err);
    }
}

// ============================================
// Rendering
// ============================================
function showMemoryPanel() {
    emptyState.style.display = 'none';
    memoryPanel.classList.remove('hidden');
    
    // Update header - fix avatar path
    let avatarPath = selectedCharacter.avatar_path || '/assets/avatars/person1.png';
    // If path doesn't start with http or /, add prefix
    if (avatarPath && !avatarPath.startsWith('http') && !avatarPath.startsWith('/')) {
        avatarPath = '/' + avatarPath;
    }
    document.getElementById('char-avatar').src = avatarPath;
    document.getElementById('char-name').textContent = selectedCharacter.display_name;
    document.getElementById('char-team').textContent = selectedCharacter.team_id ? `Team: ${selectedCharacter.team_id}` : 'No Team';
}

function hideMemoryPanel() {
    emptyState.style.display = 'flex';
    memoryPanel.classList.add('hidden');
}

function renderMemories() {
    const factsList = document.getElementById('facts-list');
    const eventsList = document.getElementById('events-list');
    
    const facts = memories.filter(m => m.type === 'fact');
    const events = memories.filter(m => m.type === 'event');
    
    // Render facts
    if (facts.length === 0) {
        factsList.innerHTML = '<div class="empty-memory">No facts recorded yet</div>';
    } else {
        factsList.innerHTML = facts.map(m => `
            <div class="memory-item" data-id="${m.id}">
                <span class="memory-text">${m.memory_text}</span>
                <div class="memory-meta">
                    <span class="importance-badge">⭐ ${m.importance}</span>
                    <button class="btn-delete" onclick="deleteMemory(${m.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }
    
    // Render events
    if (events.length === 0) {
        eventsList.innerHTML = '<div class="empty-memory">No events recorded yet</div>';
    } else {
        eventsList.innerHTML = events.map(m => `
            <div class="memory-item event" data-id="${m.id}">
                <span class="memory-text">${m.memory_text}</span>
                <div class="memory-meta">
                    <span class="importance-badge">⭐ ${m.importance}</span>
                    <button class="btn-delete" onclick="deleteMemory(${m.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }
}

function renderRelationships() {
    const relList = document.getElementById('relationships-list');
    
    if (relationships.length === 0) {
        relList.innerHTML = `
            <div class="empty-memory">No relationships yet</div>
            <button class="btn-add-rel" onclick="openAddRelationship()">+ Add Relationship</button>
        `;
    } else {
        let html = relationships.map(r => {
            const otherCharId = r.char_id_1 === selectedCharacter.id ? r.char_id_2 : r.char_id_1;
            const otherCharName = r.char_id_1 === selectedCharacter.id ? r.char2_name : r.char1_name;
            const otherChar = characters.find(c => c.id === otherCharId);
            
            let scoreColor = '#51cf66';
            if (r.score < 40) scoreColor = '#ff6b6b';
            else if (r.score < 70) scoreColor = '#ffd43b';
            
            return `
                <div class="relationship-item" data-id="${r.id}">
                    <div class="rel-info">
                        <img class="rel-avatar" src="${otherChar?.avatar_path || '/assets/avatars/person1.png'}" alt="">
                        <div class="rel-details">
                            <h4>${otherCharName || 'Unknown'}</h4>
                            <span class="rel-status">${getStatusEmoji(r.status)} ${r.status}</span>
                        </div>
                    </div>
                    <div class="rel-score">
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${r.score}%; background: ${scoreColor};"></div>
                        </div>
                        <span class="score-text" style="color: ${scoreColor};">${r.score}</span>
                        <button class="btn-edit" onclick="editRelationship(${otherCharId}, ${r.score}, '${r.status}')">Edit</button>
                    </div>
                </div>
            `;
        }).join('');
        
        html += '<button class="btn-add-rel" onclick="openAddRelationship()">+ Add Relationship</button>';
        relList.innerHTML = html;
    }
}

function getStatusEmoji(status) {
    const emojis = {
        stranger: '👤',
        colleague: '💼',
        friend: '🤝',
        close_friend: '👯',
        couple: '💕',
        ex: '💔',
        enemy: '⚔️'
    };
    return emojis[status] || '👤';
}

// ============================================
// CRUD Operations
// ============================================
async function saveMemory() {
    const type = document.getElementById('memory-type').value;
    const text = document.getElementById('memory-text').value;
    const importance = parseInt(document.getElementById('memory-importance').value);
    
    try {
        const res = await fetch('/api/memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ownerCharId: selectedCharacter.id,
                memoryText: text,
                type: type,
                importance: importance
            })
        });
        
        if (res.ok) {
            modalAddMemory.classList.add('hidden');
            document.getElementById('memory-form').reset();
            document.getElementById('importance-value').textContent = '5';
            await loadCharacterData(selectedCharacter.id);
        }
    } catch (err) {
        console.error('Failed to save memory:', err);
        alert('Failed to save memory');
    }
}

async function deleteMemory(id) {
    if (!confirm('Delete this memory?')) return;
    
    try {
        const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadCharacterData(selectedCharacter.id);
        }
    } catch (err) {
        console.error('Failed to delete memory:', err);
    }
}

function openAddRelationship() {
    // Populate other characters dropdown (exclude current character)
    const relOtherChar = document.getElementById('rel-other-char');
    relOtherChar.innerHTML = '<option value="">-- Select Character --</option>';
    
    characters.filter(c => c.id !== selectedCharacter.id).forEach(char => {
        const opt = document.createElement('option');
        opt.value = char.id;
        opt.textContent = char.display_name;
        relOtherChar.appendChild(opt);
    });
    
    // Reset form
    document.getElementById('rel-score').value = 50;
    document.getElementById('rel-score-value').textContent = '50';
    document.getElementById('rel-score-value').style.color = '#ffd43b';
    document.getElementById('rel-status').value = 'friend';
    
    modalAddRel.classList.remove('hidden');
}

function editRelationship(otherCharId, score, status) {
    openAddRelationship();
    
    document.getElementById('rel-other-char').value = otherCharId;
    document.getElementById('rel-score').value = score;
    document.getElementById('rel-score-value').textContent = score;
    document.getElementById('rel-status').value = status;
    
    // Update color
    const display = document.getElementById('rel-score-value');
    if (score >= 70) display.style.color = '#51cf66';
    else if (score >= 40) display.style.color = '#ffd43b';
    else display.style.color = '#ff6b6b';
}

async function saveRelationship() {
    const otherCharId = parseInt(document.getElementById('rel-other-char').value);
    const score = parseInt(document.getElementById('rel-score').value);
    const status = document.getElementById('rel-status').value;
    
    if (!otherCharId) {
        alert('Please select a character');
        return;
    }
    
    try {
        const res = await fetch('/api/relationships', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                charId1: selectedCharacter.id,
                charId2: otherCharId,
                score: score,
                status: status
            })
        });
        
        if (res.ok) {
            modalAddRel.classList.add('hidden');
            await loadCharacterData(selectedCharacter.id);
        }
    } catch (err) {
        console.error('Failed to save relationship:', err);
        alert('Failed to save relationship');
    }
}
