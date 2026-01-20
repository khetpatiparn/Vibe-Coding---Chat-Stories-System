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
    document.getElementById('btn-import-json').onclick = openImportModal;
    document.getElementById('btn-save-memory').onclick = saveToMemory;
    
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
        window.customCharacters = await res.json();
        // Fix: Sync local variable with window variable
        customCharacters = window.customCharacters;
        console.log(`✅ Loaded ${window.customCharacters.length} custom characters`);
    } catch (err) {
        console.error('Failed to load custom characters:', err);
        window.customCharacters = [];
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
    // Custom Characters only
    // User requested removal of defaults (Me/Boss)
    const allCharacters = customCharacters.map(c => ({
        value: `custom_${c.id}`,
        label: `<img src="/${c.avatar_path}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:4px;object-fit:cover;"> ${c.display_name}`,
        checked: false
    }));
    
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
    const relationship = document.getElementById('story-relationship')?.value || 'friend';  // V2.0
    
    // Build character data with custom character info
    const characterData = selectedCharacters.map(charId => {
        if (charId.startsWith('custom_')) {
            const customId = parseInt(charId.replace('custom_', ''));
            const customChar = customCharacters.find(c => c.id === customId);
            if (customChar) {
                return {
                    id: charId,
                    is_custom: true,
                    display_name: customChar.display_name,
                    avatar_path: customChar.avatar_path,
                    gender: customChar.gender,
                    personality: customChar.personality,
                    speaking_style: customChar.speaking_style,
                    age_group: customChar.age_group,
                    occupation: customChar.occupation,
                    catchphrase: customChar.catchphrase,
                    dialect: customChar.dialect,
                    typing_habit: customChar.typing_habit
                };
            }
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
                projectId: currentProject,
                relationship  // V2.0
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
    
    // Open Render Range Modal instead of rendering directly
    openRenderModal();
}

function openRenderModal() {
    const modal = document.getElementById('modal-render-range');
    const totalDialogues = currentDialogues.length;
    
    if (totalDialogues === 0) {
        showToast('ไม่มี Dialogue ให้ Render', 'error');
        return;
    }
    
    // Set default values
    document.getElementById('render-start').value = 1;
    document.getElementById('render-start').max = totalDialogues;
    document.getElementById('render-end').value = Math.min(15, totalDialogues);
    document.getElementById('render-end').max = totalDialogues;
    
    // Update info
    document.getElementById('render-range-info').textContent = 
        `มี ${totalDialogues} Dialogues - เลือก Range ที่ต้องการ Render`;
    
    // Calculate parts suggestion
    updateRenderPartsSuggestion(totalDialogues);
    
    // Show modal
    modal.classList.remove('hidden');
}

function updateRenderPartsSuggestion(total) {
    const partsDiv = document.getElementById('render-range-parts');
    const dialoguesPerPart = 15;
    const numParts = Math.ceil(total / dialoguesPerPart);
    
    if (numParts <= 1) {
        partsDiv.innerHTML = '✅ สามารถ Render เป็นคลิปเดียวได้';
        return;
    }
    
    let html = `📦 แนะนำแบ่งเป็น <strong>${numParts} Parts</strong>:<br><br>`;
    
    for (let i = 0; i < numParts; i++) {
        const start = (i * dialoguesPerPart) + 1;
        const end = Math.min((i + 1) * dialoguesPerPart, total);
        html += `<span style="color: ${i === 0 ? '#10b981' : 'var(--text-gray)'};">Part ${i + 1}: #${start} - #${end} (${end - start + 1} msgs)</span><br>`;
    }
    
    partsDiv.innerHTML = html;
}

async function executeRender(startDialogue, endDialogue) {
    const modal = document.getElementById('modal-render-range');
    const btn = document.getElementById('btn-render-range');
    const btnAll = document.getElementById('btn-render-all');
    
    btn.disabled = true;
    btnAll.disabled = true;
    btn.textContent = 'Rendering... 🎬';
    
    // Get audio settings
    const audioSettings = getAudioSettings();
    
    try {
        const res = await fetch(`${API_BASE}/render/${currentProject}`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...audioSettings,
                dialogueRange: {
                    start: startDialogue,
                    end: endDialogue
                }
            })
        });
        const data = await res.json();
        
        if (data.success) {
            const filename = data.videoPath.split('/').pop().split('\\').pop();
            showToast(`🎬 Render สำเร็จ! ${filename} (Part: #${startDialogue}-#${endDialogue})`, 'success');
            loadProjects();
            modal.classList.add('hidden');
        } else {
            showToast('❌ Render ล้มเหลว: ' + data.error, 'error');
        }
    } catch (err) {
        showToast('❌ Network Error', 'error');
    } finally {
        btn.disabled = false;
        btnAll.disabled = false;
        btn.textContent = '🎬 Render Range';
    }
}

// Event listeners for Render Range Modal
document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-cancel-render-range') {
        document.getElementById('modal-render-range').classList.add('hidden');
    }
    
    if (e.target.id === 'btn-render-all') {
        executeRender(1, currentDialogues.length);
    }
    
    if (e.target.id === 'btn-render-range') {
        const start = parseInt(document.getElementById('render-start').value);
        const end = parseInt(document.getElementById('render-end').value);
        
        if (start > end) {
            showToast('Start ต้องน้อยกว่าหรือเท่ากับ End', 'error');
            return;
        }
        
        executeRender(start, end);
    }
});

// Update parts suggestion when inputs change
document.getElementById('render-start')?.addEventListener('change', () => {
    updateRenderPartsSuggestion(currentDialogues.length);
});
document.getElementById('render-end')?.addEventListener('change', () => {
    updateRenderPartsSuggestion(currentDialogues.length);
});

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
            typing_speed: d.typing_speed,
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

// ===================================
// Save to Memory (Sitcom Engine)
// ===================================
async function saveToMemory() {
    if (!currentProject || currentDialogues.length < 5) {
        showToast('⚠️ ต้องมีอย่างน้อย 5 Dialogues เพื่อสรุปเป็น Memory', 'error');
        return;
    }
    
    const btn = document.getElementById('btn-save-memory');
    const originalText = btn.innerHTML;
    btn.innerHTML = '🧠 Saving...';
    btn.disabled = true;
    
    try {
        // Get unique senders from dialogues and find their custom character IDs
        const senders = [...new Set(currentDialogues.map(d => d.sender))];
        const characterIds = [];
        
        for (const sender of senders) {
            // Check if sender matches a custom character
            const customChar = customCharacters.find(c => 
                c.display_name === sender || 
                c.name === sender ||
                `custom_${c.id}` === sender
            );
            if (customChar) {
                characterIds.push(customChar.id);
            }
        }
        
        if (characterIds.length === 0) {
            showToast('⚠️ ไม่พบตัวละคร Custom ใน Story นี้', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        
        // Transform dialogues: replace sender IDs with display_name for AI clarity
        const transformedDialogues = currentDialogues.map(d => {
            let senderName = d.sender;
            // Try to find character by various matching strategies
            const char = customCharacters.find(c => 
                c.display_name === d.sender || 
                c.name === d.sender ||
                `custom_${c.id}` === d.sender
            );
            if (char) {
                senderName = char.display_name; // Use human-readable name
            }
            return { ...d, sender: senderName };
        });
        
        const res = await fetch(`${API_BASE}/memories/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: currentProject,
                dialogues: transformedDialogues, // Use transformed version
                characterIds: characterIds
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            const memCount = data.memories?.length || 0;
            showToast(`🧠 สรุป Memory สำเร็จ! บันทึก ${memCount} ข้อมูลใหม่`, 'success');
            
            if (data.summary) {
                console.log('📝 Story Summary:', data.summary);
            }
            if (data.relationship_change) {
                console.log('💕 Relationship Change:', data.relationship_change);
            }
        } else {
            showToast(`⚠️ ${data.message || 'Failed to summarize'}`, 'error');
        }
    } catch (err) {
        console.error('Save to memory error:', err);
        showToast('❌ Error: ' + err.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ===================================
// Import JSON (Restore)
// ===================================
let importData = null;

function openImportModal() {
    const modal = document.getElementById('modal-import-json');
    const preview = document.getElementById('import-preview');
    const fileInput = document.getElementById('import-file-input');
    const confirmBtn = document.getElementById('btn-confirm-import');
    
    // Reset state
    importData = null;
    preview.style.display = 'none';
    confirmBtn.disabled = true;
    fileInput.value = '';
    
    // Reset mode selection
    document.querySelectorAll('.import-mode-option').forEach(opt => {
        opt.classList.remove('selected');
        if (opt.dataset.mode === 'new') {
            opt.classList.add('selected');
            opt.querySelector('input').checked = true;
        }
    });
    
    modal.classList.remove('hidden');
    
    // Set up event listeners
    setupImportModalListeners();
}

function setupImportModalListeners() {
    const modal = document.getElementById('modal-import-json');
    const fileInput = document.getElementById('import-file-input');
    const cancelBtn = document.getElementById('btn-cancel-import');
    const confirmBtn = document.getElementById('btn-confirm-import');
    const modeOptions = document.querySelectorAll('.import-mode-option');
    
    // Close modal
    cancelBtn.onclick = () => {
        modal.classList.add('hidden');
        importData = null;
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            importData = null;
        }
    };
    
    // File selection
    fileInput.onchange = handleFileSelect;
    
    // Mode selection styling
    modeOptions.forEach(opt => {
        opt.onclick = () => {
            modeOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            opt.querySelector('input').checked = true;
            
            // Disable replace mode if no project selected
            if (opt.dataset.mode === 'replace' && !currentProject) {
                showToast('⚠️ กรุณาเลือก Project ก่อน เพื่อใช้โหมดแทนที่', 'error');
                modeOptions.forEach(o => {
                    o.classList.remove('selected');
                    if (o.dataset.mode === 'new') {
                        o.classList.add('selected');
                        o.querySelector('input').checked = true;
                    }
                });
            }
        };
    });
    
    // Confirm import
    confirmBtn.onclick = executeImport;
    
    // Drag and drop
    const dropZone = document.querySelector('.file-upload-label');
    
    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.background = 'rgba(147, 51, 234, 0.1)';
    };
    
    dropZone.ondragleave = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = 'var(--bg-dark)';
    };
    
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = 'var(--bg-dark)';
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.json')) {
            fileInput.files = files;
            handleFileSelect({ target: fileInput });
        } else {
            showToast('⚠️ กรุณาเลือกไฟล์ .json', 'error');
        }
    };
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validate structure
            if (!data.dialogues || !Array.isArray(data.dialogues)) {
                throw new Error('Invalid JSON structure: missing dialogues array');
            }
            
            // Store for later
            importData = data;
            
            // Show preview
            showImportPreview(data);
            
        } catch (err) {
            showToast('❌ ไฟล์ JSON ไม่ถูกต้อง: ' + err.message, 'error');
            importData = null;
        }
    };
    
    reader.readAsText(file);
}

function showImportPreview(data) {
    const previewEl = document.getElementById('import-preview');
    const contentEl = document.getElementById('import-preview-content');
    const confirmBtn = document.getElementById('btn-confirm-import');
    
    // Build preview HTML
    const title = data.project?.title || data.title || 'Unknown Title';
    const dialogueCount = data.dialogues?.length || 0;
    const charCount = Object.keys(data.characters || {}).length;
    const exportDate = data.exportedAt ? new Date(data.exportedAt).toLocaleString('th-TH') : 'Unknown';
    
    contentEl.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div><strong>📖 Title:</strong> ${title}</div>
            <div><strong>📅 Exported:</strong> ${exportDate}</div>
            <div><strong>💬 Dialogues:</strong> ${dialogueCount}</div>
            <div><strong>👥 Characters:</strong> ${charCount}</div>
        </div>
        ${dialogueCount > 0 ? `
        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--border);">
            <strong>ตัวอย่าง Dialogues:</strong>
            <ul style="margin: 5px 0 0 20px; list-style: disc;">
                ${data.dialogues.slice(0, 3).map(d => `<li>${d.sender}: ${(d.message || '').substring(0, 40)}${d.message?.length > 40 ? '...' : ''}</li>`).join('')}
                ${dialogueCount > 3 ? `<li style="color: var(--text-gray);">... และอีก ${dialogueCount - 3} ข้อความ</li>` : ''}
            </ul>
        </div>
        ` : ''}
    `;
    
    previewEl.style.display = 'block';
    confirmBtn.disabled = false;
}

async function executeImport() {
    if (!importData) {
        showToast('⚠️ ไม่มีข้อมูลให้ Import', 'error');
        return;
    }
    
    const mode = document.querySelector('input[name="import-mode"]:checked').value;
    const confirmBtn = document.getElementById('btn-confirm-import');
    const originalText = confirmBtn.textContent;
    
    confirmBtn.textContent = 'กำลัง Import...';
    confirmBtn.disabled = true;
    
    try {
        let response;
        
        if (mode === 'new') {
            // Create new project with imported data
            response = await fetch(`${API_BASE}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(importData)
            });
        } else if (mode === 'replace') {
            // Replace dialogues in current project
            if (!currentProject) {
                throw new Error('No project selected');
            }
            response = await fetch(`${API_BASE}/projects/${currentProject}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(importData)
            });
        }
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('modal-import-json').classList.add('hidden');
            importData = null;
            
            // Reload and select the project
            await loadProjects();
            
            if (mode === 'new' && result.projectId) {
                await selectProject(result.projectId);
            } else {
                await selectProject(currentProject);
            }
            
            showToast(`✅ Import สำเร็จ! (${result.dialogueCount || 0} dialogues)`, 'success');
        } else {
            throw new Error(result.error || 'Unknown error');
        }
        
    } catch (err) {
        showToast('❌ Import ล้มเหลว: ' + err.message, 'error');
    } finally {
        confirmBtn.textContent = originalText;
        confirmBtn.disabled = false;
    }
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
    const defaultReaction = window.TIMING_CONFIG?.DEFAULT_REACTION_DELAY || 0.8;
    
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
        // Find avatar (sender might be 'boss', 'me', or 'custom_XX')
        let char = characters[d.sender];
        if (d.sender === 'time_divider') {
             char = { 
                 name: 'Time Divider', 
                 avatar: 'https://ui-avatars.com/api/?name=T+D&background=000&color=fff&rounded=true' 
             };
        } else if (!char) {
            // Try to find from custom characters if sender starts with 'custom_'
            if (d.sender.startsWith('custom_')) {
                const customId = parseInt(d.sender.split('_')[1]);
                const customChar = (window.customCharacters || []).find(c => c.id === customId);
                if (customChar) {
                    char = { 
                        name: customChar.display_name, 
                        avatar: customChar.avatar_path || 'assets/avatars/person1.png'
                    };
                } else {
                    char = { name: d.sender, avatar: 'assets/avatars/person1.png' };
                }
            } else {
                char = { name: d.sender, avatar: 'assets/avatars/person1.png' };
            }
        }
        
        let avatarSrc = char.avatar;
        if (avatarSrc.startsWith('assets')) avatarSrc = '/' + avatarSrc; // Make absolute
        
        // Calculate delay if not set
        const delayValue = d.delay || calculateAutoDelay(d.message);
        const reactionValue = d.reaction_delay !== undefined ? d.reaction_delay : (window.TIMING_CONFIG?.DEFAULT_REACTION_DELAY || 0.8);
        
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
                    <!-- Debug: ${d.image_path} -->
                    <img src="${(d.image_path.startsWith('http') || d.image_path.startsWith('data:')) ? d.image_path : '/' + d.image_path}" 
                         style="max-height: 100px; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; transition: opacity 0.2s;"
                         onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"
                         onclick="openReplaceSticker(${d.id})"
                         title="Click to replace sticker"
                         onerror="console.error('Failed to load image:', '${d.image_path}'); this.src='https://placehold.co/100x100?text=Error';">
                    <button onclick="event.stopPropagation(); removeDialogueImage(${index}, ${d.id})" style="position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer;">x</button>
                </div>
                ` : ''}

                <textarea class="dialogue-input" rows="1" 
                    oninput="autoResize(this)" placeholder="Type a message..."
                    onchange="updateDialogue(this, ${index}, ${d.id})">${d.message}</textarea>
                <div class="dialogue-meta">
                    
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
                message: currentDlg.message
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
                sender: dlg.sender
            })
        });

        
        // Trigger replay immediately
        reloadPreview();
        
   } catch(e) { console.error(e); }
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
            // Wait for signal
        } else {
            currentBgm = new Audio('/' + selectedBgmPath);
            currentBgm.loop = true;
            currentBgm.volume = bgmVolume;
            // Wait for signal
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
let previewNameMapping = {}; // ID -> DisplayName mapping from API

async function openContinueSettings() {
    if (!currentProject) {
        alert('Please select a project first.');
        return;
    }
    
    // Fetch custom characters from API first
    try {
        const res = await fetch(`${API_BASE}/characters/custom`);
        window.customCharacters = await res.json();
        console.log('✅ Loaded custom characters:', window.customCharacters.length);
    } catch (err) {
        console.error('Failed to load custom characters:', err);
        window.customCharacters = [];
    }
    
    // Render Character Checkboxes
    const container = document.getElementById('continue-character-selector');
    
    // 1. Current Project Characters (ensure they are prioritized)
    const projectCharsObj = window.currentProjectCharacters || {};
    const projectCharKeys = Object.keys(projectCharsObj);
    
    // 2. All Custom Characters (Global)
    // Filter out those already in project to avoid duplicates
    const availableCustom = (window.customCharacters || []).filter(c => {
        const role = `custom_${c.id}`;
        return !projectCharsObj[role];
    });

    // 3. Default Characters
    // 3. Default Characters REMOVED by user request
    const availableDefaults = [];

    // Build HTML
    let html = '';

    // Map project character keys to objects for rendering
    const projectChars = projectCharKeys.map(key => ({
        id: key,
        name: projectCharsObj[key].name,
        avatar: projectCharsObj[key].avatar
    }));

    // A. Project Characters (Checked by default)
    if (projectChars.length > 0) {
        html += `<div style="background: rgba(147, 51, 234, 0.1); border: 1px solid rgba(147, 51, 234, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <div style="font-size: 0.75rem; color: #a855f7; margin-bottom: 8px; font-weight: 600;">📍 IN PROJECT</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">`;
        html += projectChars.map(char => {
            let avatar = char.avatar || 'assets/avatars/default.png';
            if (avatar.startsWith('assets')) avatar = '/' + avatar;
            return `
                <label class="character-option" style="display: flex; align-items: center; padding: 8px; background: var(--bg-dark); border-radius: 6px; cursor: pointer;">
                    <input type="checkbox" name="continue-char" value="${char.id}" checked style="margin-right: 8px;">
                    <img src="${avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; margin-right: 6px;">
                    <span style="font-size: 0.85rem; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${char.name}</span>
                </label>`;
        }).join('');
        html += '</div></div>';
    }

    // B. Guest Characters (Only Custom Characters from Character Management)
    if (availableCustom.length > 0) {
        html += `<div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px;">
            <div style="font-size: 0.75rem; color: #60a5fa; margin-bottom: 8px; font-weight: 600;">🌟 GUEST CHARACTERS (from Character Manager)</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">`;
        
        html += availableCustom.map(c => {
            let avatar = c.avatar_path || 'assets/avatars/default.png';
            if (avatar.startsWith('assets')) avatar = '/' + avatar;
            return `
                <label class="character-option" style="display: flex; align-items: center; padding: 8px; background: var(--bg-dark); border-radius: 6px; cursor: pointer;">
                    <input type="checkbox" name="continue-char" value="custom_${c.id}" style="margin-right: 8px;">
                    <img src="${avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; margin-right: 6px;">
                    <span style="font-size: 0.85rem; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.display_name}</span>
                </label>`;
        }).join('');
        
        html += '</div></div>';
    }

    if (html === '') {
        container.innerHTML = '<p style="color:var(--text-gray);">No characters found.</p>';
    } else {
        container.innerHTML = html;
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
    const length = document.getElementById('continue-length').value;
    const mode = document.getElementById('continue-mode').value;
    const relationship = document.getElementById('continue-relationship')?.value || 'friend';  // V2.0

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
                topic: prompt,
                length: length,
                mode: mode,
                relationship  // V2.0
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            previewDialogues = data.dialogues;
            previewNameMapping = data.nameMapping || {}; // Store name mapping
            renderPreviewList(previewDialogues, previewNameMapping);
            
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

function renderPreviewList(dialogues, nameMapping = {}) {
    const container = document.getElementById('ai-preview-list');
    const statsContainer = document.getElementById('ai-preview-stats');
    const splitBtn = document.getElementById('btn-split-parts');
    
    if (!dialogues || dialogues.length === 0) {
        container.innerHTML = '<p>No content generated.</p>';
        if (statsContainer) statsContainer.innerHTML = '';
        if (splitBtn) splitBtn.style.display = 'none';
        return;
    }
    
    // Calculate stats
    const totalMessages = dialogues.length;
    const totalChars = dialogues.reduce((sum, d) => sum + (d.message?.length || 0), 0);
    const avgCharsPerMsg = Math.round(totalChars / totalMessages);
    const longMessages = dialogues.filter(d => (d.message?.length || 0) > 80).length;
    
    // Show stats
    if (statsContainer) {
        statsContainer.innerHTML = `📊 ${totalMessages} messages | Avg: ${avgCharsPerMsg} chars/msg${longMessages > 0 ? ` | ⚠️ ${longMessages} long bubbles` : ''}`;
    }
    
    // Show split button if 20+ dialogues
    if (splitBtn) {
        splitBtn.style.display = totalMessages >= 20 ? 'inline-block' : 'none';
    }
    
    container.innerHTML = dialogues.map((d, index) => {
        // Convert internal ID to display name
        const displayName = nameMapping[d.sender] || d.sender;
        const isLong = (d.message?.length || 0) > 80;
        
        let contentHtml = `<div class="preview-message">${d.message || ''}${isLong ? ' <span style="color:#f59e0b;font-size:0.75rem;">(ยาว)</span>' : ''}</div>`;
        
        if (d.image_path) {
            contentHtml = `
            <div class="preview-sticker" style="margin-top:5px;">
                <img src="${d.image_path}" style="max-height:100px; border-radius:8px; border:1px solid #333;">
            </div>`;
        } else if (d.sticker_keyword) {
             contentHtml += `<div class="preview-sticker-tag" style="font-size: 0.75rem; color: #ec4899; margin-top: 4px;">🧸 Sticker: ${d.sticker_keyword}</div>`;
        }
        
        return `
        <div class="preview-dialogue-item" ${isLong ? 'style="border-left: 3px solid #f59e0b;"' : ''}>
            <div class="preview-sender" style="text-transform: capitalize;">${displayName}</div>
            ${contentHtml}
        </div>
    `;
    }).join('');
}

async function commitContinuation() {
    const btn = document.getElementById('btn-confirm-preview');
    btn.textContent = 'Adding...';
    btn.disabled = true;
    
    try {
        // 1. First, ensure all guest characters used in dialogues are added to the project
        const usedSenders = [...new Set(previewDialogues.map(d => d.sender))];
        const projectCharsObj = window.currentProjectCharacters || {};
        
        for (const sender of usedSenders) {
            // Skip if already in project
            if (projectCharsObj[sender]) continue;
            
            // Check if it's a custom character (e.g., custom_10)
            if (sender.startsWith('custom_')) {
                const customId = sender.replace('custom_', '');
                await addCustomCharacterToProject(customId);
            }
        }
        
        // 2. Add dialogues
        // Note: Sticker logic is now handled on server-side during generation (splitting bubbles).
        // The previewDialogues already contain separate items for stickers (with image_path) and text.

        // 3. Sequentially add dialogues with explicit order and timing
        let startOrder = 0;
        if (currentDialogues && currentDialogues.length > 0) {
            startOrder = Math.max(...currentDialogues.map(d => d.seq_order !== undefined ? d.seq_order : 0)) + 1;
        }

        for (let i = 0; i < previewDialogues.length; i++) {
            const d = previewDialogues[i];
            // Auto-calculate delay based on message length (Thai-friendly)
            const baseDelay = 1.0;
            const charCount = (d.message || '').length;
            const calculatedDelay = parseFloat((baseDelay + (charCount * 0.05)).toFixed(2));
            
            await fetch(`${API_BASE}/projects/${currentProject}/dialogues`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender: d.sender,
                    message: d.message,
                    order: startOrder + i,
                    delay: calculatedDelay,
                    reaction_delay: window.TIMING_CONFIG?.DEFAULT_REACTION_DELAY || 0.8,
                    image_path: d.image_path // IMPORTANT: Pass the image path!
                })
            });
        }
        
        // 4. Refresh Project (this updates characters and dialogues)
        await selectProject(currentProject);
        
        // 5. Force reload preview with delay to ensure DB is synced
        setTimeout(() => {
            reloadPreview();
        }, 500);
        
        // 6. Close Modal
        document.getElementById('modal-ai-preview').classList.add('hidden');
        previewDialogues = [];
        document.getElementById('continue-prompt').value = '';
        
    } catch (err) {
        alert('Failed to add dialogues: ' + err.message);
    } finally {
        btn.textContent = '✅ Add to Story';
        btn.disabled = false;
    }
}

// Event Listeners for Continuation - EVENT DELEGATION (More Robust)
document.addEventListener('click', (e) => {
    // 1. Open Modal (delegated)
    if (e.target && (e.target.id === 'btn-continue-ai' || e.target.closest('#btn-continue-ai'))) {
        console.log('✅ Click detected on Continue AI');
        openContinueSettings();
    }

    // 2. Generate
    if (e.target && e.target.id === 'btn-generate-continue') {
        generateContinuation();
    }

    // 3. Confirm / Add
    if (e.target && e.target.id === 'btn-confirm-preview') {
        commitContinuation();
    }
    
    // 4. Split into Parts
    if (e.target && e.target.id === 'btn-split-parts') {
        splitDialoguesIntoParts();
    }

    // Modal Close handlers (delegated)
    if (e.target.id === 'btn-cancel-continue') {
        document.getElementById('modal-continue-settings').classList.add('hidden');
    }
    if (e.target.id === 'btn-cancel-preview') {
        document.getElementById('modal-ai-preview').classList.add('hidden');
    }
    if (e.target.id === 'btn-retry-preview') {
        document.getElementById('modal-ai-preview').classList.add('hidden');
        document.getElementById('modal-continue-settings').classList.remove('hidden');
    }
});

// Split dialogues into multiple parts for TikTok
function splitDialoguesIntoParts() {
    if (!previewDialogues || previewDialogues.length < 20) {
        alert('ต้องมี 20+ dialogues ขึ้นไปถึงจะแบ่ง Part ได้');
        return;
    }
    
    const totalDialogues = previewDialogues.length;
    const dialoguesPerPart = 15; // ~15 dialogues per TikTok video
    const numParts = Math.ceil(totalDialogues / dialoguesPerPart);
    
    let message = `📦 สามารถแบ่งเป็น ${numParts} Parts:\n\n`;
    
    for (let i = 0; i < numParts; i++) {
        const start = i * dialoguesPerPart;
        const end = Math.min(start + dialoguesPerPart, totalDialogues);
        message += `Part ${i + 1}: Dialogue #${start + 1} - #${end} (${end - start} messages)\n`;
    }
    
    message += `\n🎬 แนะนำ: Add to Story ทีละ Part เพื่อ Export แยกคลิป\n\nต้องการแบ่งเป็น Part แรก (${dialoguesPerPart} dialogues) ไหม?`;
    
    if (confirm(message)) {
        // Keep only first part
        previewDialogues = previewDialogues.slice(0, dialoguesPerPart);
        renderPreviewList(previewDialogues, previewNameMapping);
        
        alert(`✅ เหลือเฉพาะ Part 1 (${previewDialogues.length} messages)\n\nเมื่อ Add to Story แล้ว สามารถ "Continue with AI" เพื่อสร้าง Part 2 ได้ โดยเลือก "Wrap Up" ถ้าต้องการจบเรื่อง`);
    }
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
        
        // Load SFX (Pop)
        const sfxRes = await fetch(`${API_BASE}/sounds/collection-name/pop`);
        const sfxSounds = await sfxRes.json();
        const sfxSelect = document.getElementById('select-sfx');
        if (sfxSelect) {
            sfxSelect.innerHTML = '<option value="">ปิด</option>';
            for (const sound of sfxSounds) {
                sfxSelect.innerHTML += `<option value="${sound.filename}">${sound.collection_name ? sound.collection_name + ' - ' : ''}${sound.name}</option>`;
            }
        }
        
        // Load Swoosh (Intro transition)
        // Load Swoosh (Intro transition)
        // Fetch from the specific collection named "swoosh"
        const swooshRes = await fetch(`${API_BASE}/sounds/collection-name/swoosh`);
        const swooshSounds = await swooshRes.json();
        const swooshSelect = document.getElementById('select-swoosh');
        if (swooshSelect) {
            swooshSelect.innerHTML = '<option value="">ปิด</option>';
            for (const sound of swooshSounds) {
                swooshSelect.innerHTML += `<option value="${sound.filename}">${sound.collection_name ? sound.collection_name + ' - ' : ''}${sound.name}</option>`;
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
let swooshVolume = 0.7;
let selectedSwooshPath = null;

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

function onSwooshVolumeChange(value) {
    swooshVolume = value / 100;
    window.swooshVolume = swooshVolume;
}

function onSwooshChange() {
    const select = document.getElementById('select-swoosh');
    selectedSwooshPath = select.value || null;
    window.swooshPath = selectedSwooshPath;
    console.log('Swoosh changed:', selectedSwooshPath);
}

// Get audio settings for render
function getAudioSettings() {
    return {
        bgMusicPath: bgmEnabled ? selectedBgmPath : null,
        sfxPath: sfxEnabled ? selectedSfxPath : null,
        swooshPath: selectedSwooshPath, // NEW: Intro swoosh sound
        bgmVolume: bgmVolume,
        sfxVolume: sfxVolume,
        swooshVolume: swooshVolume // NEW
    };
}

// Load audio options when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadAudioOptions();
});

// ===================================
// GIPHY Picker Logic
// ===================================
const modalGiphy = document.getElementById('modal-giphy-picker');
let giphyTargetDialogueIndex = -1; // -1 = add new, >=0 = replace exisiting

function initGiphyListeners() {
    const btnOpen = document.getElementById('btn-open-giphy');
    if (btnOpen) {
        console.log("✅ GIPHY Button found and listener attached");
        btnOpen.addEventListener('click', () => {
             console.log("🧸 Opening GIF Picker");
            giphyTargetDialogueIndex = -1; 
            modalGiphy.classList.remove('hidden');
            document.getElementById('giphy-search-input').focus();
        });
    } else {
        console.error("❌ GIPHY Button not found");
    }

    document.getElementById('btn-close-giphy')?.addEventListener('click', () => {
        modalGiphy.classList.add('hidden');
    });

    document.getElementById('btn-search-giphy')?.addEventListener('click', searchGiphy);
    document.getElementById('giphy-search-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchGiphy();
    });
}

// Call init when DOM is ready or immediately if already ready
if (document.readyState === 'loading') {    
    document.addEventListener('DOMContentLoaded', initGiphyListeners);
} else {
    initGiphyListeners();
}

async function searchGiphy() {
    const query = document.getElementById('giphy-search-input').value;
    const container = document.getElementById('giphy-results');
    
    if (!query) return;
    
    container.innerHTML = '<p style="text-align:center; color:gray;">Searching... 🧸</p>';
    
    try {
        const res = await fetch(`${API_BASE}/giphy/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(gif => `
                <div class="giphy-item" onclick="selectGiphy('${gif.url}')" style="cursor: pointer; border-radius: 8px; overflow: hidden; transition: transform 0.2s;">
                    <img src="${gif.preview}" alt="${gif.title}" style="width: 100%; height: 100px; object-fit: cover; display: block;">
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p style="text-align:center; color:white;">No results found.</p>';
        }
    } catch (err) {
        container.innerHTML = '<p style="text-align:center; color:red;">Error fetching GIFs.</p>';
    }
}

// Store pending GIF URL for character selection
let pendingGiphyUrl = null;

async function selectGiphy(url) {
    modalGiphy.classList.add('hidden');
    
    // Check if we're in replacement mode
    if (replaceStickerDialogueId) {
        await confirmReplaceSticker(url);
        return;
    }
    
    // Store the URL and show character selector (for new sticker)
    pendingGiphyUrl = url;
    const grid = document.getElementById('character-selector-grid');
    const chars = window.currentProjectCharacters || {};
    
    grid.innerHTML = Object.entries(chars).map(([key, char]) => {
        let avatarSrc = char.avatar || '/assets/fallback-avatar.png';
        if (avatarSrc.startsWith('assets')) avatarSrc = '/' + avatarSrc;
        
        return `
            <div class="character-card" onclick="confirmGiphyWithCharacter('${key}')" style="cursor: pointer;">
                <img src="${avatarSrc}" alt="${char.name || key}" onerror="this.src='/assets/fallback-avatar.png'">
                <span>${char.name || key}</span>
            </div>
        `;
    }).join('');
    
    // Update title
    document.getElementById('char-selector-title').textContent = '🧸 Who sends this sticker?';
    
    // Show modal
    modalCharacterSelector.classList.remove('hidden');
}
window.selectGiphy = selectGiphy; // Expose to global scope for onclick handler

// Store dialogue ID for replacement mode
let replaceStickerDialogueId = null;

// Open GIPHY picker to replace an existing sticker
function openReplaceSticker(dialogueId) {
    replaceStickerDialogueId = dialogueId;
    modalGiphy.classList.remove('hidden');
    document.getElementById('giphy-search-input').focus();
}
window.openReplaceSticker = openReplaceSticker;

// Called when user selects a character for the sticker (or confirms replacement)
async function confirmGiphyWithCharacter(charKey) {
    modalCharacterSelector.classList.add('hidden');
    
    if (!pendingGiphyUrl) return;
    
    try {
        await fetch(`${API_BASE}/projects/${currentProject}/dialogues`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender: charKey,
                message: '',
                imagePath: pendingGiphyUrl,
                delay: 1.0,
                reaction_delay: 0.8,
                order: currentDialogues.length + 1
            })
        });
        
        showToast('🧸 Added Sticker', 'success');
        await selectProject(currentProject); // Refresh
        
    } catch (err) {
        showToast('Failed to add sticker: ' + err.message, 'error');
    }
    
    pendingGiphyUrl = null;
}
window.confirmGiphyWithCharacter = confirmGiphyWithCharacter;

// Called when selecting a new sticker in replacement mode
async function confirmReplaceSticker(url) {
    if (!replaceStickerDialogueId) return;
    
    try {
        await fetch(`${API_BASE}/projects/${currentProject}/dialogues/${replaceStickerDialogueId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_path: url })
        });
        
        showToast('🔄 Sticker replaced', 'success');
        await selectProject(currentProject); // Refresh
        
    } catch (err) {
        showToast('Failed to replace sticker: ' + err.message, 'error');
    }
    
    replaceStickerDialogueId = null;
}
window.confirmReplaceSticker = confirmReplaceSticker;

// ============================================
// Cross-Origin Messaging (iframe visualizer -> dashboard)
// ============================================
window.addEventListener('message', (event) => {
    // Handle BGM Start Signal (e.g., after intro finishes)
    if (event.data && event.data.type === 'bgm-start') {
        if (bgmEnabled && selectedBgmPath && currentBgm) {
            console.log('🎵 Received bgm-start signal. Playing BGM...');
            currentBgm.play().catch(e => console.log('BGM play error:', e));
        }
    }
});
