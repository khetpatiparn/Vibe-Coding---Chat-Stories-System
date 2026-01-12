/**
 * AutoChat Studio Pro - Dashboard Controller
 * Handles Project listing, Editing, and Rendering triggers
 */

const API_BASE = 'http://localhost:3000/api';

// State
let currentProject = null;
let currentDialogues = [];
let projects = [];

// DOM Elements
const elProjectList = document.getElementById('project-list');
const elDialogueList = document.getElementById('dialogue-list');
const elPreviewFrame = document.getElementById('preview-frame');
const elTitle = document.getElementById('current-project-title');
const elStatus = document.getElementById('current-project-status');
const modalCreate = document.getElementById('modal-new-story');
const modalConfirm = document.getElementById('modal-confirm');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const btnConfirmAction = document.getElementById('btn-confirm-action');
const btnCancelConfirm = document.getElementById('btn-cancel-confirm');
// Character Selector Elements
const modalCharacterSelector = document.getElementById('modal-character-selector');
const elCharacterGrid = document.getElementById('character-selector-grid');

// ===================================
// Custom Confirm Modal
// ===================================
let currentConfirmCallback = null;

function customConfirm(title, message, onConfirm) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    modalConfirm.classList.remove('hidden');
    
    // Store callback
    currentConfirmCallback = onConfirm;
}

// Set up modal event listeners once (not in customConfirm)
document.addEventListener('DOMContentLoaded', () => {
    // Confirm button
    document.getElementById('btn-confirm-action').onclick = () => {
        modalConfirm.classList.add('hidden');
        if (currentConfirmCallback) {
            currentConfirmCallback();
            currentConfirmCallback = null;
        }
    };
    
    // Cancel button
    document.getElementById('btn-cancel-confirm').onclick = () => {
        modalConfirm.classList.add('hidden');
        currentConfirmCallback = null;
    };
    
    // Close on background click
    modalConfirm.onclick = (e) => {
        if (e.target === modalConfirm) {
            modalConfirm.classList.add('hidden');
            currentConfirmCallback = null;
        }
    };
});

// ===================================
// Initialization
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
    loadCustomCharacters(); // NEW - Load custom characters
    
    // Event Listeners
    document.getElementById('btn-new-story').onclick = () => modalCreate.classList.remove('hidden');
    document.getElementById('btn-cancel-create').onclick = () => modalCreate.classList.add('hidden');
    document.getElementById('btn-create-blank').onclick = () => createStory(false);
    document.getElementById('btn-create-ai').onclick = createStoryWithAI;
    document.getElementById('btn-render').onclick = renderVideo;
    document.getElementById('btn-add-dialogue').onclick = addDialogue;
    document.getElementById('btn-generate-ai').onclick = openStorySettings;
    document.getElementById('btn-export-json').onclick = exportProjectAsJSON;
    
    // Room Name Input - Auto-save on change
    document.getElementById('room-name-input').onchange = saveRoomName;
    
    // Toggle Buttons - Auto-save
    document.getElementById('toggle-partner-name').onchange = saveSettings;
    document.getElementById('toggle-my-name').onchange = saveSettings;
    
    // Story Settings Modal
    document.getElementById('btn-cancel-settings').onclick = () => {
        document.getElementById('modal-story-settings').classList.add('hidden');
    };
    document.getElementById('btn-confirm-settings').onclick = generateWithAI;
    
    document.getElementById('btn-confirm-settings').onclick = generateWithAI;
    
    // Character Selector Modal
    document.getElementById('btn-cancel-char-select').onclick = () => {
        modalCharacterSelector.classList.add('hidden');
    };
    modalCharacterSelector.onclick = (e) => {
        if (e.target === modalCharacterSelector) modalCharacterSelector.classList.add('hidden');
    };

    // Modal confirm buttons are set up in customConfirm section above
    
    // Project title editing
    const titleInput = document.getElementById('current-project-title');
    const editTitleBtn = document.getElementById('btn-edit-title');
    
    titleInput.addEventListener('click', () => {
        if (currentProject) {
            titleInput.readOnly = false;
            titleInput.focus();
            titleInput.select();
        }
    });
    
    titleInput.addEventListener('blur', saveProjectTitle);
    titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            titleInput.blur();
        } else if (e.key === 'Escape') {
            titleInput.value = projects.find(p => p.id === currentProject)?.title || 'Untitled Story';
            titleInput.blur();
        }
    });
});

async function saveProjectTitle() {
    const titleInput = document.getElementById('current-project-title');
    const newTitle = titleInput.value.trim();
    
    if (!currentProject || !newTitle) {
        titleInput.readOnly = true;
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/projects/${currentProject}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
        
        if (res.ok) {
            // Update local projects array
            const project = projects.find(p => p.id === currentProject);
            if (project) {
                project.title = newTitle;
                renderProjectList();
            }
        }
    } catch (err) {
        console.error('Failed to update title:', err);
    } finally {
        titleInput.readOnly = true;
    }
}

// ===================================
// Custom Characters
// ===================================
let customCharacters = [];

async function loadCustomCharacters() {
    try {
        const res = await fetch(`${API_BASE}/characters/custom`);
        customCharacters = await res.json();
        console.log(`✅ Loaded ${customCharacters.length} custom characters`);
    } catch (err) {
        console.error('Failed to load custom characters:', err);
        customCharacters = [];
    }
}

// Open Story Settings Modal
function openStorySettings() {
    if (!currentProject) {
        alert('Please select or create a project first');
        return;
    }
    
    // Render character selector with custom characters
    renderCharacterSelector();
    
    document.getElementById('modal-story-settings').classList.remove('hidden');
}

// Save Settings (Auto-save)
async function saveSettings() {
    if (!currentProject) return;
    
    const show_partner_name = document.getElementById('toggle-partner-name').checked ? 1 : 0;
    const show_my_name = document.getElementById('toggle-my-name').checked ? 1 : 0;
    
    try {
        await fetch(`${API_BASE}/projects/${currentProject}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ show_partner_name, show_my_name })
        });
        
        // Update local state
        const project = projects.find(p => p.id === currentProject);
        if (project) {
            project.show_partner_name = show_partner_name;
            project.show_my_name = show_my_name;
            reloadPreview();
        }
        showToast('Settings saved', 'success');
    } catch(e) {
        console.error('Failed to save settings:', e);
    }
}

// Render Character Selector (default + custom)
function renderCharacterSelector() {
    const container = document.querySelector('.character-selector');
    
    // Default characters
    // Default characters
    const defaultChars = [
        { value: 'me', label: '👤 Me (ฉัน)', checked: true },
        { value: 'boss', label: '👔 Boss (เจ้านาย)', checked: true }
    ];
    
    // Custom characters with avatars
    const customChars = customCharacters.map(c => ({
        value: `custom_${c.id}`,
        label: `<img src="/${c.avatar_path}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:4px;object-fit:cover;"> ${c.display_name}`,
        checked: false
    }));
    
    const allCharacters = [...defaultChars, ...customChars];
    
    container.innerHTML = allCharacters.map(char => `
        <label class="character-option">
            <input type="checkbox" name="character" value="${char.value}" ${char.checked ? 'checked' : ''}>
            <span>${char.label}</span>
        </label>
    `).join('');
}

// Generate story with AI using settings
async function generateWithAI() {
    // Collect selected characters
    const checkboxes = document.querySelectorAll('input[name="character"]:checked');
    const selectedCharacters = Array.from(checkboxes).map(cb => cb.value);
    
    // Validate at least 2 characters
    if (selectedCharacters.length < 2) {
        alert('Please select at least 2 characters');
        return;
    }
    
    const customPrompt = document.getElementById('custom-prompt').value.trim();
    const category = document.getElementById('story-category').value;
    
    // Build character data with custom character info
    const characterData = selectedCharacters.map(charId => {
        if (charId.startsWith('custom_')) {
            const customId = parseInt(charId.replace('custom_', ''));
            const custom = customCharacters.find(c => c.id === customId);
            return custom ? {
                id: charId,
                name: custom.name,
                display_name: custom.display_name,
                avatar_path: custom.avatar_path,
                is_custom: true
            } : null;
        }
        return {
            id: charId,
            is_custom: false
        };
    }).filter(c => c !== null);
    
    const btn = document.getElementById('btn-confirm-settings');
    const originalText = btn.textContent;
    btn.textContent = 'Generating... 🤖';
    btn.disabled = true;
    
    try {
        const res = await fetch(`${API_BASE}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category,
                characters: selectedCharacters,
                characterData: characterData, // NEW - Send full character data
                customPrompt: customPrompt || null,
                projectId: currentProject
            })
        });
        
        const data = await res.json();
        if (data.success) {
            document.getElementById('modal-story-settings').classList.add('hidden');
            // Reload current project to show new dialogues
            selectProject(currentProject);
            
            if (data.isMock) {
                alert('⚠️ AI Failed (Quota Full?)\nUsing Demo Story instead.\nError: ' + data.errorDetails);
            }
        } else {
            alert('Generation failed: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ===================================
// API Actions
// ===================================

async function loadProjects() {
    try {
        const res = await fetch(`${API_BASE}/projects`);
        projects = await res.json();
        renderProjectList();
        
        // Update story counter
        document.getElementById('story-count').textContent = projects.length;
        
        // If current project was deleted or doesn't exist, select first project
        const currentExists = projects.find(p => p.id === currentProject);
        
        if (!currentExists && projects.length > 0) {
            // Current project no longer exists, select first one
            selectProject(projects[0].id);
        } else if (!currentProject && projects.length > 0) {
            // No project selected, select first one
            selectProject(projects[0].id);
        } else if (projects.length === 0) {
            // No projects at all, clear UI
            elTitle.textContent = 'No Projects';
            elStatus.textContent = '';
            elDialogueList.innerHTML = '<p style="color: var(--text-gray); text-align: center; padding: 40px;">Create your first story to get started!</p>';
        }
    } catch (err) {
        console.error('Failed to load projects', err);
    }
}

async function selectProject(id) {
    currentProject = id;
    renderProjectList(); // Update active state
    
    try {
        const res = await fetch(`${API_BASE}/projects/${id}`);
        const data = await res.json();
        
        // Update UI
        document.getElementById('current-project-title').value = data.title;
        document.getElementById('current-project-title').readonly = true;
        elStatus.textContent = data.status;
        
        // Store for local access
        currentDialogues = data.dialogues;
        window.currentProjectCharacters = data.characters;
        console.log('Loaded Project Characters:', window.currentProjectCharacters);
        
        // Load Room Name
        document.getElementById('room-name-input').value = data.room_name || '';
        
        // Load Toggles
        const valPartner = data.show_partner_name !== undefined ? data.show_partner_name : 1;
        document.getElementById('toggle-partner-name').checked = valPartner === 1;
        
        const valMe = data.show_my_name !== undefined ? data.show_my_name : 0;
        document.getElementById('toggle-my-name').checked = valMe === 1;
        
        // Update dialogue counter
        const dialogueCounter = document.getElementById('dialogue-counter');
        const dialogueCount = document.getElementById('dialogue-count');
        dialogueCount.textContent = data.dialogues.length;
        dialogueCounter.style.display = 'flex'; // Show counter
        
        // Load Dialogues
        renderDialogues(data.dialogues, data.characters);
        
        // Update Preview
        reloadPreview();
        
    } catch (err) {
        console.error('Failed to load project details', err);
    }
}

async function createStory(fromAI = false) {
    const btnId = fromAI ? 'btn-create-ai' : 'btn-create-blank';
    const btn = document.getElementById(btnId);
    const originalText = fromAI ? '<div style="font-size: 2rem; margin-bottom: 10px;">✨</div><h3 style="color: white; margin-bottom: 5px;">Generate with AI</h3><p style="color: var(--text-gray); font-size: 0.9rem;">Auto-create plot & dialogue</p>' : 
        '<div style="font-size: 2rem; margin-bottom: 10px;">📝</div><h3 style="color: white; margin-bottom: 5px;">Blank Story</h3><p style="color: var(--text-gray); font-size: 0.9rem;">Start from scratch</p>';
    
    // Simple loading text
    btn.innerHTML = fromAI ? '<h3>Creating...</h3>' : '<h3>Creating...</h3>';
    btn.disabled = true;
    
    try {
        const res = await fetch(`${API_BASE}/projects/blank`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Untitled Story' })
        });
        
        const data = await res.json();
        if (data.success) {
            modalCreate.classList.add('hidden');
            await loadProjects();
            await selectProject(data.projectId);
            
            if (fromAI) {
                openStorySettings();
            }
        } else {
            alert('Failed to create story: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function createStoryWithAI() {
    await createStory(true);
}

async function renderVideo() {
    if (!currentProject) return;
    
    const btn = document.getElementById('btn-render');
    const originalText = btn.textContent;
    btn.textContent = 'Rendering... 🎬';
    btn.disabled = true;
    
    // Get audio settings (respects toggle state)
    const audioSettings = getAudioSettings();
    
    try {
        const res = await fetch(`${API_BASE}/render/${currentProject}`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(audioSettings)
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('🎬 Render สำเร็จ! ' + data.videoPath.split('/').pop(), 'success');
            loadProjects(); // Update status
        } else {
            showToast('❌ Render ล้มเหลว: ' + data.error, 'error');
        }
    } catch (err) {
        showToast('❌ Network Error', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ===================================
// Export JSON (Data Backup)
// ===================================
function exportProjectAsJSON() {
    if (!currentProject) {
        showToast('กรุณาเลือก Project ก่อน', 'error');
        return;
    }
    
    // Collect project data
    const projectInfo = projects.find(p => p.id === currentProject);
    const exportData = {
        exportedAt: new Date().toISOString(),
        project: {
            id: currentProject,
            title: projectInfo?.title || 'Untitled',
            status: projectInfo?.status || 'DRAFT'
        },
        characters: window.currentProjectCharacters || {},
        dialogues: currentDialogues.map(d => ({
            id: d.id,
            sender: d.sender,
            message: d.message,
            delay: d.delay,
            reaction_delay: d.reaction_delay,
            typing_speed: d.typing_speed,
            camera_effect: d.camera_effect,
            seq_order: d.seq_order,
            image_path: d.image_path
        }))
    };
    
    // Create and download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectInfo?.title || 'story'}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('📦 Export สำเร็จ!', 'success');
}

// Save Room Name (Auto-save)
async function saveRoomName() {
    if (!currentProject) return;
    const value = document.getElementById('room-name-input').value.trim();
    
    try {
        await fetch(`${API_BASE}/projects/${currentProject}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_name: value })
        });
        reloadPreview();
        showToast('💬 Room name saved', 'success');
    } catch(e) {
        console.error('Failed to save room name:', e);
    }
}

// ===================================
// UI Rendering
// ===================================

function renderProjectList() {
    elProjectList.innerHTML = projects.map(p => `
        <div class="project-item ${currentProject == p.id ? 'active' : ''}" onclick="selectProject(${p.id})">
            <span class="status-dot ${p.status.toLowerCase()}"></span>
            <div class="project-info">
                <h3>${p.title}</h3>
                <span>${p.status}</span>
            </div>
            <button class="project-delete" onclick="deleteProject(event, ${p.id})" title="Delete Project">🗑️</button>
        </div>
    `).join('');
}

// Helper: Calculate Delay (Thai-friendly)
function calculateAutoDelay(message) {
    if (!message) return 1.0;
    const baseDelay = 1.0;
    // Thai characters take time to read. 0.05s per char seems reasonable.
    // e.g. "สวัสดีครับ" (10 chars) = 1.0 + 0.5 = 1.5s
    const charCount = message.length;
    return parseFloat((baseDelay + (charCount * 0.05)).toFixed(2));
}

async function updateDelay(input, index, id) {
    const value = parseFloat(input.value);
    currentDialogues[index].delay = value;
    
    try {
        await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delay: value })
        });
        reloadPreview();
    } catch (err) {
        console.error('Failed to save delay:', err);
    }
}

async function updateReaction(input, index, id) {
    const value = parseFloat(input.value);
    currentDialogues[index].reaction_delay = value;
    
    try {
        await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reaction_delay: value })
        });
        reloadPreview();
    } catch (err) {
        console.error('Failed to save reaction:', err);
    }
}

async function resetToAutoDelay(index, id) {
    const message = currentDialogues[index].message;
    const autoDelay = calculateAutoDelay(message);
    const defaultReaction = 0.5;
    
    // Update local
    currentDialogues[index].delay = autoDelay;
    currentDialogues[index].reaction_delay = defaultReaction;
    
    // Update UI
    const delayInput = document.querySelector(`.dialogue-item[data-id="${id}"] .delay-input`);
    if (delayInput) delayInput.value = autoDelay;
    
    const reactionInput = document.querySelector(`.dialogue-item[data-id="${id}"] .reaction-input`);
    if (reactionInput) reactionInput.value = defaultReaction;
    
    // Save to DB
    try {
        await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delay: autoDelay, reaction_delay: defaultReaction })
        });
        reloadPreview();
    } catch (err) {
        console.error('Failed to reset delays:', err);
    }
}

function renderDialogues(dialogues, characters) {
    elDialogueList.innerHTML = dialogues.map((d, index) => {
        // Find avatar (sender might be 'boss' or 'me')
        let char = characters[d.sender];
        if (d.sender === 'time_divider') {
             char = { 
                 name: 'Time Divider', 
                 avatar: 'https://ui-avatars.com/api/?name=T+D&background=000&color=fff&rounded=true' 
             };
        } else if (!char) {
             char = { name: d.sender, avatar: 'assets/avatars/default.png' };
        }
        
        let avatarSrc = char.avatar;
        if (avatarSrc.startsWith('assets')) avatarSrc = '/' + avatarSrc; // Make absolute
        
        // Calculate delay if not set
        const delayValue = d.delay || calculateAutoDelay(d.message);
        const reactionValue = d.reaction_delay !== undefined ? d.reaction_delay : 0.5;
        
        return `
        <div class="dialogue-item" data-id="${d.id}" draggable="true">
            <div class="drag-handle" style="display:flex;align-items:center;padding-right:10px;cursor:grab;opacity:0.5;">
                ⋮⋮
            </div>
            <div class="dialogue-avatar" onclick="toggleSender(${index}, ${d.id})" style="cursor: pointer; border: 2px solid transparent; transition: border 0.2s;" title="Click to Switch Character">
                <img src="${avatarSrc}" onerror="this.src='https://placehold.co/40'">
            </div>
            <div class="dialogue-content">
                <div class="dialogue-header">
                    <strong>${char.name}</strong>
                    <div class="dialogue-controls">
                        <span class="seq-number">#${index + 1}</span>
                        <label class="btn-icon" title="Attach Image" style="cursor: pointer;">
                            🖼️ <input type="file" accept="image/*" style="display:none" onchange="uploadDialogueImage(this, ${index}, ${d.id})">
                        </label>
                        <button onclick="playFrom(event, ${index})" class="btn-icon" title="Play from here">▶</button>
                        <button onclick="deleteDialogue(event, ${d.id})" class="btn-icon text-red" title="Delete">🗑️</button>
                    </div>
                </div>
                
                ${d.image_path ? `
                <div class="dialogue-attachment" style="margin-bottom: 5px; position: relative; display: inline-block;">
                    <img src="${d.image_path.startsWith('data:') ? d.image_path : '/' + d.image_path}" style="max-height: 100px; border-radius: 8px; border: 1px solid var(--border);">
                    <button onclick="removeDialogueImage(${index}, ${d.id})" style="position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer;">x</button>
                </div>
                ` : ''}

                <textarea class="dialogue-input" rows="1" 
                    oninput="autoResize(this)" placeholder="Type a message..."
                    onchange="updateDialogue(this, ${index}, ${d.id})">${d.message}</textarea>
                <div class="dialogue-meta">
                    <span class="meta-tag" onclick="cycleEffect(${index}, ${d.id})">🎥 ${d.camera_effect}</span>
                    
                    <!-- Reaction Control (New) -->
                    <div class="reaction-control" style="display:inline-flex; align-items:center; gap:5px; margin-left:10px;">
                        <span style="font-size:0.8rem; color:var(--text-gray);" title="Reaction Time (Silent Gap)">⏱️</span>
                        <input type="number" step="0.1" class="reaction-input" 
                            value="${reactionValue}" 
                            onchange="updateReaction(this, ${index}, ${d.id})"
                            style="width:50px; padding:2px; border-radius:4px; border:1px solid var(--border); background:var(--bg-dark); color:white; font-size:0.8rem; text-align:center;">
                    </div>

                    <!-- Delay Control -->
                    <div class="delay-control" style="display:inline-flex; align-items:center; gap:5px; margin-left:10px;">
                        <span style="font-size:0.8rem; color:var(--text-gray);" title="Typing Duration">💬</span>
                        <input type="number" step="0.1" class="delay-input" 
                            value="${delayValue}" 
                            onchange="updateDelay(this, ${index}, ${d.id})"
                            style="width:50px; padding:2px; border-radius:4px; border:1px solid var(--border); background:var(--bg-dark); color:white; font-size:0.8rem; text-align:center;">
                        <button class="btn-icon" onclick="resetToAutoDelay(${index}, ${d.id})" title="Auto Calculate Reaction & Delay" style="font-size:0.7rem; padding:2px 5px;">🔄</button>
                    </div>
                </div>
            </div>
        </div>
    `}).join('');
    
    initDragAndDrop();
    
    // Auto-resize all textareas after render
    document.querySelectorAll('.dialogue-input').forEach(textarea => {
        autoResize(textarea);
    });
}

function autoResize(el) {
    el.style.height = 'auto'; // Reset
    el.style.height = el.scrollHeight + 'px';
}

function initDragAndDrop() {
    const draggables = document.querySelectorAll('.dialogue-item');
    const container = document.getElementById('dialogue-list');
    
    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', () => {
            draggable.classList.add('draggable-dragging');
        });
        
        draggable.addEventListener('dragend', async () => {
            draggable.classList.remove('draggable-dragging');
            // Save new order
            await saveOrder();
        });
    });
    
    container.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const draggable = document.querySelector('.draggable-dragging');
        if (afterElement == null) {
            container.appendChild(draggable);
        } else {
            container.insertBefore(draggable, afterElement);
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.dialogue-item:not(.draggable-dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveOrder() {
    const items = document.querySelectorAll('.dialogue-item');
    const updates = [];
    
    items.forEach((item, index) => {
        updates.push({
            id: parseInt(item.dataset.id),
            seq_order: index + 1
        });
        
        // Update visual numbering #1, #2...
        const numberSpan = item.querySelector('.dialogue-header span');
        if (numberSpan) {
            // Keep existing HTML inside span (delete button)
            const deleteBtn = numberSpan.querySelector('button');
            numberSpan.childNodes[0].nodeValue = `#${index + 1} `;
        }
    });
    
    try {
        await fetch(`${API_BASE}/projects/${currentProject}/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        
        // Success: Refresh Preview and Data
        // We re-select to ensure 'currentDialogues' is synced with backend order
        // and to trigger the visualizer refresh (which selectProject does? No, verify)
        
        // Update local state without full re-render if possible? 
        // For now, full reload is safest to Sync everything.
        await selectProject(currentProject);
        
    } catch (e) {
        console.error('Save order failed:', e);
        alert('Failed to save new order');
    }
}

// ===================================
// Delete & Undo Logic
// ===================================
let deleteTimeout = null;
let pendingDeleteId = null;
let pendingDeletedItem = null;
let pendingDeleteIndex = null;

// Initial Toast HTML injection
if (!document.getElementById('undo-toast-container')) {
    const container = document.createElement('div');
    container.id = 'undo-toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
}

function showUndoToast(message, onUndo) {
    const container = document.getElementById('undo-toast-container');
    container.innerHTML = `
        <div class="toast">
            <span>${message}</span>
            <button class="btn-undo" onclick="triggerUndo()">Undo</button>
        </div>
    `;
    
    window.triggerUndo = () => {
        if (onUndo) onUndo();
        container.innerHTML = ''; // Hide toast
    };

    // Auto cleanup toast UI only (logic handled by timeout)
    // Actually, timeout handles logic cleanup
}

window.deleteDialogue = async function(event, id) {
    if (event) event.stopPropagation();
    console.log("Attempting delete for ID:", id);
    
    // 1. If there's already a pending delete, execute it immediately
    if (deleteTimeout) {
        clearTimeout(deleteTimeout);
        await executePendingDelete();
    }

    // Safety: If list is empty but we have an ID, try to reload data first
    if (currentDialogues.length === 0 && currentProject) {
         console.warn("Empty list detected during delete. Reloading project...");
         await selectProject(currentProject);
    }

    // 2. Find and Store item locally
    // Use == for safety (string vs number)
    const index = currentDialogues.findIndex(d => d.id == id);
    
    // DEBUG: Alert
    // alert(`Debug: Delete ID ${id}, Found Index ${index}`);
     
    if (index === -1) {
        console.error("Delete failed: ID not found", id);
        alert(`Error: Could not find dialogue with ID ${id}. List size: ${currentDialogues.length}`);
        return;
    }

    pendingDeletedItem = currentDialogues[index];
    pendingDeleteId = id;
    pendingDeleteIndex = index;

    // 3. Optimistic Update: Remove from UI array
    currentDialogues.splice(index, 1);
    renderDialogues(currentDialogues, window.currentProjectCharacters);

    // 4. Show Undo Toast
    showUndoToast("🗑️ Dialogue deleted", () => {
        // UNDO ACTION
        clearTimeout(deleteTimeout);
        deleteTimeout = null;
        
        // Restore item
        currentDialogues.splice(pendingDeleteIndex, 0, pendingDeletedItem);
        pendingDeletedItem = null;
        pendingDeleteId = null;
        renderDialogues(currentDialogues, window.currentProjectCharacters);
    });

    // 5. Set Timeout for Actual Delete
    deleteTimeout = setTimeout(async () => {
        await executePendingDelete();
        document.getElementById('undo-toast-container').innerHTML = ''; // Hide toast
        deleteTimeout = null;
    }, 4000); // 4 seconds to undo
}

async function executePendingDelete() {
    if (!pendingDeleteId) return;

    try {
        await fetch(`${API_BASE}/dialogues/${pendingDeleteId}`, { method: 'DELETE' });
        // console.log('Permanently deleted', pendingDeleteId);
        pendingDeleteId = null;
        pendingDeletedItem = null;
        // No need to render, already removed
    } catch (e) {
        console.error('Failed to delete', e);
        // If failed, maybe restore? For now, alert
        // alert("Delete failed on server");
    }
}

// Ensure pending deletes happen if user leaves/refreshes?
// Hard to guarantee on close, but we can try beforeunload or page hide.
window.addEventListener('beforeunload', () => {
    if (deleteTimeout) {
        // Best effort: usage of sendBeacon or sync XHR if supported, 
        // but simple fetch might fail. We accept this risk for simple Undo.
        // Or we could trigger it synchronously?
    }
});


// ===================================
// Character Selector Logic
// ===================================
let selectorContext = null;

function openCharacterSelector(mode, id = null, index = null) {
    selectorContext = { mode, id, index };
    
    // 1. Current Project Characters
    const projectCharsObj = window.currentProjectCharacters || {};
    const projectCharKeys = Object.keys(projectCharsObj);
    
    // 2. All Custom Characters (Global)
    // Filter out those already in project
    const availableCustom = (customCharacters || []).filter(c => {
        const role = `custom_${c.id}`;
        return !projectCharsObj[role];
    });
    
    let html = '';
    
    // Render Project Characters
    projectCharKeys.forEach(key => {
        const char = projectCharsObj[key];
        const isSelected = (mode === 'edit' && currentDialogues[index].sender === key);
        html += renderCharCard(key, char, isSelected, false); 
    });
    
    // Render Available Global Custom Characters
    availableCustom.forEach(c => {
         const key = `custom_${c.id}`;
         const char = { 
             name: c.display_name, // Fix: use display_name
             avatar: c.avatar_path 
         };
         html += renderCharCard(key, char, false, true);
    });

    // 3. Available Default Characters
    const DEFAULT_ROLES = [
        { role: 'me', name: 'ฉัน', avatar: 'assets/avatars/person1.png' },
        { role: 'boss', name: 'เจ้านาย', avatar: 'assets/avatars/boss.png' }
    ];

    const availableDefaults = DEFAULT_ROLES.filter(def => !projectCharsObj[def.role]);
    
    if (availableDefaults.length > 0) {
        availableDefaults.forEach(def => {
             html += renderCharCard(def.role, { name: def.name, avatar: def.avatar }, false, true);
        });
    }

    // 4. Time Divider Option
    const isDividerSelected = (mode === 'edit' && currentDialogues[index] && currentDialogues[index].sender === 'time_divider');
    html += `
        <div class="character-card-large ${isDividerSelected ? 'selected' : ''}" onclick="selectCharacter('time_divider', false)">
            <div style="width:60px;height:60px;border-radius:50%;background:#000;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 10px;">⏰</div>
            <div class="character-card-name">Time Divider</div>
            <div class="character-card-role">Scene Break</div>
        </div>
    `;
    
    if (html === '') {
        html = '<p style="color:var(--text-gray);text-align:center;width:100%;">No characters found.</p>';
    }
    
    elCharacterGrid.innerHTML = html;
    modalCharacterSelector.classList.remove('hidden');
}

function renderCharCard(key, char, isSelected, isNew) {
    let avatar = char.avatar || 'assets/avatars/default.png';
    if (avatar.startsWith('assets')) avatar = '/' + avatar;
    
    // Star Toggle (Only for established project characters)
    const starBtn = !isNew ? 
        `<button class="char-side-btn ${char.side === 'right' ? 'active' : ''}" 
            onclick="toggleMainCharacter(event, '${key}')" 
            title="${char.side === 'right' ? 'Main Character (Right Side)' : 'Set as Main Character'}">
            ★
        </button>` : '';

    return `
        <div class="character-card-large ${isSelected ? 'selected' : ''}" onclick="selectCharacter('${key}', ${isNew})">
            ${starBtn}
            <img src="${avatar}" class="character-card-img" onerror="this.src='https://placehold.co/60'">
            <div class="character-card-name">${char.name || key}</div>
            <div class="character-card-role">${char.display_name || key}</div>
        </div>
    `;
}

window.toggleMainCharacter = async function(event, role) {
    event.stopPropagation(); 
    if (!currentProject) return;

    try {
        await fetch(`${API_BASE}/projects/${currentProject}/set_main_character`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
        });
        
        // Reload project to update sides
        await selectProject(currentProject);
        
        // Re-render selector to update stars
        if (selectorContext && !modalCharacterSelector.classList.contains('hidden')) {
             openCharacterSelector(selectorContext.mode, selectorContext.id, selectorContext.index);
        }

    } catch(e) {
        alert('Failed to set main character: ' + e.message);
    }
}

window.selectCharacter = async function(key, isNew = false) {
    modalCharacterSelector.classList.add('hidden');
    
    if (!selectorContext) return;

    // Time Divider Handler
    if (key === 'time_divider') {
        try {
            if (selectorContext.mode === 'add') {
                await addDialogue('time_divider');
            } else if (selectorContext.mode === 'edit') {
                await performEditSender(selectorContext.id, 'time_divider', selectorContext.index);
            }
        } catch(e) {
            console.error(e);
        }
        return;
    }
    
    // If New Global Character, Add to Project first
    if (isNew) {
        const id = parseInt(key.replace('custom_', ''));
        const customChar = (customCharacters || []).find(c => c.id === id);
        if (customChar) {
             try {
                 await fetch(`${API_BASE}/projects/${currentProject}/characters`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                         role: key,
                         name: customChar.display_name, 
                         avatar: customChar.avatar_path,
                         side: 'left'
                     })
                 });
                 // Sync Project Data
                 await selectProject(currentProject); 
             } catch(e) {
                 alert('Failed to add character: ' + e.message);
                 return;
             }
        }
    }
    
    try {
        if (selectorContext.mode === 'add') {
            await addDialogue(key);
        } else if (selectorContext.mode === 'edit') {
            await performEditSender(selectorContext.id, key, selectorContext.index);
        }
    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
    }
}

async function performEditSender(id, newSender, index) {
    const currentDlg = currentDialogues[index];
    
    // Optimistic update
    currentDlg.sender = newSender;
    const projectChars = window.currentProjectCharacters || {};
    // Re-render immediately (optional, or wait for reload)
    
    try {
        await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                sender: newSender,
                message: currentDlg.message,
                camera_effect: currentDlg.camera_effect
            })
        });
        
        // Reload Project to sync everything
        selectProject(currentProject);
        showToast('Character changed!', 'success');
    } catch (err) {
        console.error('Failed to change character:', err);
        showToast('Failed to change character', 'error');
    }
}

window.toggleSender = function(index, id) {
    openCharacterSelector('edit', id, index);
}

window.updateDialogue = async function(textarea, index, id) {
   const val = textarea.value;
   const dlg = currentDialogues[index];
   
   try {
        await fetch(`${API_BASE}/dialogues/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: val,
                sender: dlg.sender,
                camera_effect: dlg.camera_effect
            })
        });

        
        // Trigger replay immediately
        reloadPreview();
        
   } catch(e) { console.error(e); }
}

// Camera Effects List (matches style.css classes)
const CAMERA_EFFECTS = ['normal', 'zoom-in', 'zoom-shake', 'shake', 'darken'];

window.cycleEffect = async function(index, id) {
    const dialogue = currentDialogues[index];
    if (!dialogue) return;
    
    // Get current effect and cycle to next
    const currentEffect = dialogue.camera_effect || 'normal';
    const currentIndex = CAMERA_EFFECTS.indexOf(currentEffect);
    const nextIndex = (currentIndex + 1) % CAMERA_EFFECTS.length;
    const newEffect = CAMERA_EFFECTS[nextIndex];
    
    // Update local state
    dialogue.camera_effect = newEffect;
    
    // Update UI element text (meta-tag with camera emoji)
    const effectSpan = document.querySelector(`.dialogue-item[data-id="${id || dialogue.id}"] .meta-tag`);
    if (effectSpan) {
        effectSpan.textContent = `🎥 ${newEffect}`;
    }
    
    // Save to database
    try {
        await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${dialogue.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ camera_effect: newEffect })
        });
        reloadPreview();
        showToast(`Effect: ${newEffect}`, 'success');
    } catch (err) {
        console.error('Failed to save effect:', err);
        showToast('Failed to save effect', 'error');
    }
}


function reloadPreview() {
    if (!currentProject) return;
    const timestamp = new Date().getTime();
    const tiktokParam = window.tiktokMode ? '&tiktokMode=true' : '';
    elPreviewFrame.src = `/visualizer/index.html?projectId=${currentProject}&t=${timestamp}${tiktokParam}`;
    
    // Restart BGM if enabled
    if (bgmEnabled && selectedBgmPath) {
        if (currentBgm) {
            currentBgm.pause();
            currentBgm.currentTime = 0;
            currentBgm.play().catch(e => console.log('BGM play error:', e));
        } else {
            currentBgm = new Audio('/' + selectedBgmPath);
            currentBgm.loop = true;
            currentBgm.volume = bgmVolume;
            currentBgm.play().catch(e => console.log('BGM play error:', e));
        }
    }
}

// TikTok Mode Toggle
window.tiktokMode = false;

window.toggleTiktokMode = function() {
    window.tiktokMode = !window.tiktokMode;
    
    // Update toggle UI
    const toggle = document.getElementById('tiktok-mode-toggle');
    const options = toggle.querySelectorAll('.toggle-option');
    
    if (window.tiktokMode) {
        toggle.setAttribute('data-mode', 'tiktok');
        options[0].classList.remove('active');
        options[1].classList.add('active');
    } else {
        toggle.setAttribute('data-mode', 'normal');
        options[0].classList.add('active');
        options[1].classList.remove('active');
    }
    
    // Reload preview with new mode
    reloadPreview();
}

// Expose globals
window.selectProject = selectProject;
window.createStory = createStory;

window.playFrom = function(event, index) {
    event.stopPropagation(); // Prevent row selection logic if any
    if (!currentProject) return;
    const timestamp = new Date().getTime();
    elPreviewFrame.src = `/visualizer/index.html?projectId=${currentProject}&t=${timestamp}&startAt=${index}`;
}

// Add to Event Listeners in init (via replacement content below)
    document.getElementById('btn-add-dialogue').onclick = addDialogue;

// ... (keep existing init code) ...

async function addDialogue(sender) {
    if (sender && typeof sender === 'object') sender = null;
    if (!currentProject) return;
    if (!sender) {
        openCharacterSelector('add');
        return;
    }
    
    // Add to backend
    // Fix: Use max order + 1 instead of length to avoid collision after delete
    let newOrder = 0;
    if (currentDialogues && currentDialogues.length > 0) {
        const maxOrder = Math.max(...currentDialogues.map(d => d.seq_order !== undefined ? d.seq_order : 0));
        newOrder = maxOrder + 1;
    }
    
    // Smart switch: Alternate from last speaker
    let nextSender = sender || 'me';
    const projectChars = Object.keys(window.currentProjectCharacters || {'me':{},'boss':{}});
    
    if (!sender && currentDialogues.length > 0) {
        const last = currentDialogues[currentDialogues.length - 1];
        const lastIndex = projectChars.indexOf(last.sender);
        
        if (lastIndex !== -1) {
            // Pick next character in list, cycling back to start
            const nextIndex = (lastIndex + 1) % projectChars.length;
            nextSender = projectChars[nextIndex];
        } else {
            // If last sender not in list (legacy?), pick first available
            nextSender = projectChars[0] || 'me';
        }
    } else if (!sender) {
        // No dialogues yet, start with first character
        nextSender = projectChars[0] || 'me';
    }

    try {
        const res = await fetch(`${API_BASE}/projects/${currentProject}/dialogues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender: nextSender,
                message: '...', // Placeholder
                order: newOrder
            })
        });
        
        const data = await res.json();
        if (data.success) {
            // Reload to see new item
            selectProject(currentProject);
        } else {
            alert('Failed to add dialogue: ' + data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Error adding dialogue');
    }
}

// Delete Project
window.deleteProject = async function(event, id) {
    event.stopPropagation(); // Prevent project selection
    
    const project = projects.find(p => p.id === id);
    const projectName = project ? project.title : `Project ${id}`;
    
    customConfirm(
        'Delete Project?',
        `Are you sure you want to delete "${projectName}"?\n\nThis will permanently delete the project and all its dialogues.`,
        async () => {
            try {
                // Step 1: Delete from server
                const res = await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
                const data = await res.json();
                
                if (!data.success) {
                    alert('Failed to delete project: ' + data.error);
                    return;
                }
                
                // Step 2: Update local state immediately
                projects = projects.filter(p => p.id !== id);
                
                // Step 3: Clear current project if it was deleted
                const wasCurrentProject = (currentProject === id);
                if (wasCurrentProject) {
                    currentProject = null;
                }
                
                // Step 4: Update UI - counter first
                document.getElementById('story-count').textContent = projects.length;
                
                // Step 5: Re-render project list
                renderProjectList();
                
                // Step 6: Handle project selection
                if (wasCurrentProject) {
                    if (projects.length > 0) {
                        // Select first available project
                        selectProject(projects[0].id);
                    } else {
                        // No projects left
                        elTitle.textContent = 'No Projects';
                        elStatus.textContent = '';
                        elDialogueList.innerHTML = '<p style="color: var(--text-gray); text-align: center; padding: 40px;">Create your first story to get started!</p>';
                    }
                }
                
            } catch (err) {
                console.error('Delete error:', err);
                alert('Error deleting project: ' + err.message);
            }
        }
    );
}

// ===================================
// AI Story Continuation
// ===================================

let previewDialogues = [];

function openContinueSettings() {
    if (!currentProject) {
        alert('Please select a project first.');
        return;
    }
    
    // Render Character Checkboxes
    const container = document.getElementById('continue-character-selector');
    
    // 1. Current Project Characters (ensure they are prioritized)
    const projectCharsObj = window.currentProjectCharacters || {};
    const projectCharKeys = Object.keys(projectCharsObj);
    
    // Map to array format
    const projectChars = projectCharKeys.map(key => ({
        id: key,
        name: projectCharsObj[key].name,
        avatar: projectCharsObj[key].avatar,
        checked: true // Default to checked for existing chars
    }));
    
    // Handle empty case
    if (projectChars.length === 0) {
        container.innerHTML = '<p style="color:var(--text-gray);">No characters in this project yet.</p>';
    } else {
        container.innerHTML = projectChars.map(char => {
            let avatar = char.avatar || 'assets/avatars/default.png';
            if (avatar.startsWith('assets')) avatar = '/' + avatar;
            
            return `
            <label class="character-option">
                <input type="checkbox" name="continue-char" value="${char.id}" checked>
                <img src="${avatar}" style="width:20px;height:20px;border-radius:50%;margin:0 5px;vertical-align:middle;object-fit:cover;">
                <span>${char.name}</span>
            </label>
            `;
        }).join('');
    }

    document.getElementById('modal-continue-settings').classList.remove('hidden');
}

async function generateContinuation() {
    const checkboxes = document.querySelectorAll('input[name="continue-char"]:checked');
    const selectedChars = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedChars.length === 0) {
        alert('Please select at least one character.');
        return;
    }
    
    const prompt = document.getElementById('continue-prompt').value.trim();
    const btn = document.getElementById('btn-generate-continue');
    
    btn.textContent = 'Generating... 🤖';
    btn.disabled = true;
    
    try {
        const res = await fetch(`${API_BASE}/generate/continue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: currentProject,
                characters: selectedChars,
                topic: prompt
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            previewDialogues = data.dialogues;
            renderPreviewList(previewDialogues);
            
            // Switch Modals
            document.getElementById('modal-continue-settings').classList.add('hidden');
            document.getElementById('modal-ai-preview').classList.remove('hidden');
        } else {
            alert('Generation failed: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.textContent = 'Generate Preview 🤖';
        btn.disabled = false;
    }
}

function renderPreviewList(dialogues) {
    const container = document.getElementById('ai-preview-list');
    
    if (!dialogues || dialogues.length === 0) {
        container.innerHTML = '<p>No content generated.</p>';
        return;
    }
    
    container.innerHTML = dialogues.map((d, index) => `
        <div class="preview-dialogue-item">
            <div class="preview-sender" style="text-transform: capitalize;">${d.sender}</div>
            <div class="preview-message">${d.message}</div>
        </div>
    `).join('');
}

async function commitContinuation() {
    const btn = document.getElementById('btn-confirm-preview');
    btn.textContent = 'Adding...';
    btn.disabled = true;
    
    try {
        // Sequentially add dialogues
        // We rely on backend to handle order if we send one by one
        // Better: We send one by one to use existing 'add' logic which calculates order
        // BUT current add logic relies on calculating max order.
        
        // Calculate start order from current dialogues
        let startOrder = 0;
        if (currentDialogues && currentDialogues.length > 0) {
            startOrder = Math.max(...currentDialogues.map(d => d.seq_order !== undefined ? d.seq_order : 0)) + 1;
        }

        // Sequentially add dialogues with explicit order
        for (let i = 0; i < previewDialogues.length; i++) {
            const d = previewDialogues[i];
            await fetch(`${API_BASE}/projects/${currentProject}/dialogues`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender: d.sender,
                    message: d.message,
                    order: startOrder + i // Explicitly set order
                })
            });
        }
        
        // Refresh Project
        await selectProject(currentProject);
        
        // Close Modal
        document.getElementById('modal-ai-preview').classList.add('hidden');
        previewDialogues = [];
        document.getElementById('continue-prompt').value = ''; // Reset prompt
        
    } catch (err) {
        alert('Failed to add dialogues: ' + err.message);
    } finally {
        btn.textContent = '✅ Add to Story';
        btn.disabled = false;
    }
}

// Event Listeners for Continuation
// Check if elements exist before adding listeners (safe guard)
const btnContinueAI = document.getElementById('btn-continue-ai');
if (btnContinueAI) {
    btnContinueAI.addEventListener('click', openContinueSettings);
    document.getElementById('btn-cancel-continue').addEventListener('click', () => {
        document.getElementById('modal-continue-settings').classList.add('hidden');
    });
    document.getElementById('btn-generate-continue').addEventListener('click', generateContinuation);

    document.getElementById('btn-cancel-preview').addEventListener('click', () => {
        document.getElementById('modal-ai-preview').classList.add('hidden');
    });
    document.getElementById('btn-retry-preview').addEventListener('click', () => {
        document.getElementById('modal-ai-preview').classList.add('hidden');
        document.getElementById('modal-continue-settings').classList.remove('hidden');
    });
    document.getElementById('btn-confirm-preview').addEventListener('click', commitContinuation);
}

// Expose globals
window.selectProject = selectProject;
window.createStory = createStory;
window.renderVideo = renderVideo;
window.reloadPreview = reloadPreview;
window.addDialogue = addDialogue;
window.toggleSender = toggleSender;
window.deleteDialogue = deleteDialogue;
window.deleteProject = deleteProject;
window.updateDelay = updateDelay;
window.updateReaction = updateReaction; // NEW
window.resetToAutoDelay = resetToAutoDelay;

// ===================================
// Image Upload for Dialogues (Base64)
// ===================================

window.uploadDialogueImage = async function(input, index, id) {
    const file = input.files[0];
    if (!file) return;
    
    // Validate size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
        alert('File too large! Max 5MB.');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Image = e.target.result;
        
        try {
            const res = await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_path: base64Image })
            });
            const data = await res.json();
            
            if (data.success) {
                currentDialogues[index].image_path = base64Image;
                renderDialogues(currentDialogues, window.currentProjectCharacters);
                reloadPreview();
            } else {
                alert('Error saving image: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            alert('Error saving image: ' + err.message);
        }
    };
    reader.readAsDataURL(file);
    
    input.value = '';
};

window.removeDialogueImage = async function(index, id) {
    if (!confirm('Remove attached image?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_path: null })
        });
        
        currentDialogues[index].image_path = null;
        renderDialogues(currentDialogues, window.currentProjectCharacters);
        reloadPreview();
    } catch (err) {
        console.error(err);
        alert('Error removing image');
    }
};

// Update Dialogue Text (called on textarea blur/change)
window.updateDialogue = async function(textarea, index, id) {
    const message = textarea.value;
    const newDelay = calculateAutoDelay(message);
    
    try {
        const res = await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, delay: newDelay })
        });
        const data = await res.json();
        
        if (data.success) {
            // Update local state
            currentDialogues[index].message = message;
            currentDialogues[index].delay = newDelay;
            
            // Update Delay Input UI
            const delayInput = document.querySelector(`.dialogue-item[data-id="${id}"] .delay-input`);
            if (delayInput) delayInput.value = newDelay;
            
            reloadPreview();
        } else {
            console.error('Failed to save message:', data.error);
        }
    } catch (err) {
        console.error('Error saving message:', err);
    }
};

// ============================================
// Audio Settings
// ============================================
let currentBgm = null;
let currentSfx = null;
let selectedBgmPath = '';
let selectedSfxPath = '';
let bgmEnabled = true;
let sfxEnabled = true;

// Expose to window for iframe access
window.selectedSfxPath = selectedSfxPath;
window.sfxEnabled = sfxEnabled;
window.sfxVolume = 0.5; // Default

// Toast Notification Function
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Remove after animation
    setTimeout(() => toast.remove(), 3000);
}

async function loadAudioOptions() {
    try {
        // Load BGM
        const bgmRes = await fetch(`${API_BASE}/sounds/type/bgm`);
        const bgmSounds = await bgmRes.json();
        const bgmSelect = document.getElementById('select-bgm');
        if (bgmSelect) {
            bgmSelect.innerHTML = '<option value="">ปิด</option>';
            for (const sound of bgmSounds) {
                bgmSelect.innerHTML += `<option value="${sound.filename}">${sound.collection_name ? sound.collection_name + ' - ' : ''}${sound.name}</option>`;
            }
        }
        
        // Load SFX
        const sfxRes = await fetch(`${API_BASE}/sounds/type/sfx`);
        const sfxSounds = await sfxRes.json();
        const sfxSelect = document.getElementById('select-sfx');
        if (sfxSelect) {
            sfxSelect.innerHTML = '<option value="">ปิด</option>';
            for (const sound of sfxSounds) {
                sfxSelect.innerHTML += `<option value="${sound.filename}">${sound.collection_name ? sound.collection_name + ' - ' : ''}${sound.name}</option>`;
            }
        }
    } catch (err) {
        console.error('Failed to load audio options:', err);
    }
}

function onBgmChange() {
    selectedBgmPath = document.getElementById('select-bgm').value;
    
    // Stop current BGM if playing
    if (currentBgm) {
        currentBgm.pause();
        currentBgm = null;
    }
    
    if (selectedBgmPath && bgmEnabled) {
        // Start playing new BGM
        currentBgm = new Audio('/' + selectedBgmPath);
        currentBgm.loop = true;
        currentBgm.volume = bgmVolume;
        currentBgm.play().catch(e => console.log('BGM autoplay blocked:', e));
        showToast('🎵 กำลังเล่น: ' + selectedBgmPath.split('/').pop(), 'success');
    } else if (selectedBgmPath) {
        showToast('เลือก BGM: ' + selectedBgmPath.split('/').pop(), 'success');
    }
}

function onSfxChange() {
    selectedSfxPath = document.getElementById('select-sfx').value;
    window.selectedSfxPath = selectedSfxPath; // Sync for iframe
    if (selectedSfxPath) {
        showToast('เลือก SFX: ' + selectedSfxPath.split('/').pop(), 'success');
    }
}

function toggleBgm() {
    bgmEnabled = !bgmEnabled;
    const btn = document.getElementById('toggle-bgm');
    if (btn) {
        btn.classList.toggle('active', bgmEnabled);
    }
    
    // Control playback
    if (currentBgm) {
        if (bgmEnabled) {
            currentBgm.play().catch(e => console.log('BGM play error:', e));
        } else {
            currentBgm.pause();
        }
    } else if (bgmEnabled && selectedBgmPath) {
        // Start playing if we have a selection
        currentBgm = new Audio('/' + selectedBgmPath);
        currentBgm.loop = true;
        currentBgm.volume = bgmVolume;
        currentBgm.play().catch(e => console.log('BGM play error:', e));
    }
    
    showToast(bgmEnabled ? '🔊 เปิด BGM แล้ว' : '🔇 ปิด BGM แล้ว', bgmEnabled ? 'success' : 'info');
}

function toggleSfx() {
    sfxEnabled = !sfxEnabled;
    window.sfxEnabled = sfxEnabled; // Sync for iframe
    const btn = document.getElementById('toggle-sfx');
    if (btn) {
        btn.classList.toggle('active', sfxEnabled);
    }
    showToast(sfxEnabled ? 'เปิด SFX แล้ว' : 'ปิด SFX แล้ว', sfxEnabled ? 'success' : 'info');
}

// Volume controls
let bgmVolume = 0.3;
let sfxVolume = 0.5;

function onBgmVolumeChange(value) {
    bgmVolume = value / 100;
    window.bgmVolume = bgmVolume;
    // Update live BGM volume
    if (currentBgm) {
        currentBgm.volume = bgmVolume;
    }
}

function onSfxVolumeChange(value) {
    sfxVolume = value / 100;
    window.sfxVolume = sfxVolume;
}

// Get audio settings for render
function getAudioSettings() {
    return {
        bgMusicPath: bgmEnabled ? selectedBgmPath : null,
        sfxPath: sfxEnabled ? selectedSfxPath : null,
        bgmVolume: bgmVolume,
        sfxVolume: sfxVolume
    };
}

// Load audio options when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadAudioOptions();
});
