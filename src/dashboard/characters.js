/**
 * Character Manager - JavaScript
 * Handles character CRUD operations with file upload
 */

const API_BASE = '/api';

let customCharacters = [];
let editingCharacterId = null;
let deleteCallback = null;

// DOM Elements
const modal = document.getElementById('modal-character');
const modalTitle = document.getElementById('modal-title');
const charForm = document.getElementById('char-form');
const charNameInput = document.getElementById('char-name');
const charDisplayNameInput = document.getElementById('char-display-name');
const charAvatarInput = document.getElementById('char-avatar');
const imagePreview = document.getElementById('image-preview');
const customGrid = document.getElementById('custom-characters-grid');
const charCount = document.getElementById('char-count');

// Confirm modal elements
const confirmModal = document.getElementById('modal-confirm-delete');
const deleteMessage = document.getElementById('delete-message');

// ===================================
// Custom Confirm Modal
// ===================================
function customConfirm(message, onConfirm) {
    deleteMessage.textContent = message;
    confirmModal.classList.remove('hidden');
    deleteCallback = onConfirm;
}

// ===================================
// Initialization
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    loadCustomCharacters();
    
    // Event Listeners
    document.getElementById('btn-add-character').onclick = openAddModal;
    document.getElementById('btn-cancel-char').onclick = closeModal;
    charForm.onsubmit = handleSubmit;
    charAvatarInput.onchange = handleFilePreview;
    
    // Confirmation modal
    document.getElementById('btn-cancel-delete').onclick = () => {
        confirmModal.classList.add('hidden');
        deleteCallback = null;
    };
    
    document.getElementById('btn-confirm-delete').onclick = () => {
        confirmModal.classList.add('hidden');
        if (deleteCallback) {
            deleteCallback();
            deleteCallback = null;
        }
    };
    
    // Close modals on background click
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    
    confirmModal.onclick = (e) => {
        if (e.target === confirmModal) {
            confirmModal.classList.add('hidden');
            deleteCallback = null;
        }
    };
});

// ===================================
// Load Characters
// ===================================
async function loadCustomCharacters() {
    try {
        const res = await fetch(`${API_BASE}/characters/custom`);
        customCharacters = await res.json();
        
        renderCustomCharacters();
        updateCharacterCount();
    } catch (err) {
        console.error('Failed to load characters:', err);
        customConfirm(
            `Error loading characters: ${err.message}`,
            () => {}
        );
    }
}

function renderCustomCharacters() {
    if (customCharacters.length === 0) {
        customGrid.innerHTML = `
            <div class="empty-state">
                <p>🎭</p>
                <p style="color: var(--text-gray); font-size: 0.9rem;">No custom characters yet. Click "+ Add Character" to create your first one!</p>
            </div>
        `;
        return;
    }
    
    customGrid.innerHTML = customCharacters.map(char => `
        <div class="character-card">
            <img src="/${char.avatar_path}" alt="${char.display_name}">
            <div class="char-info">
                <h3>${escapeHtml(char.display_name)}</h3>
                <span class="char-subtitle">${escapeHtml(char.name)}</span>
            </div>
            <div class="card-actions">
                <button class="btn-edit" onclick="openEditModal(${char.id})">✏️ Edit</button>
                <button class="btn-delete" onclick="deleteCharacter(${char.id}, '${escapeHtml(char.display_name)}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

function updateCharacterCount() {
    charCount.textContent = customCharacters.length;
}

// ===================================
// Modal Management
// ===================================
function openAddModal() {
    editingCharacterId = null;
    modalTitle.textContent = 'Add New Character';
    charForm.reset();
    imagePreview.innerHTML = '';
    charNameInput.disabled = false;
    charAvatarInput.required = true;
    modal.classList.remove('hidden');
}

function openEditModal(id) {
    editingCharacterId = id;
    const char = customCharacters.find(c => c.id === id);
    
    if (!char) {
        customConfirm('Character not found', () => {});
        return;
    }
    
    modalTitle.textContent = 'Edit Character';
    charNameInput.value = char.name;
    charNameInput.disabled = true; // Can't change internal name
    charDisplayNameInput.value = char.display_name;
    charAvatarInput.required = false; // Optional when editing
    
    // Show current avatar
    imagePreview.innerHTML = `
        <img src="/${char.avatar_path}" alt="${char.display_name}">
        <p style="margin-top: 8px; color: var(--text-gray); font-size: 0.85rem;">Current Avatar (upload new to replace)</p>
    `;
    
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
    charForm.reset();
    imagePreview.innerHTML = '';
    editingCharacterId = null;
}

// ===================================
// File Preview
// ===================================
function handleFilePreview(e) {
    const file = e.target.files[0];
    
    if (!file) {
        imagePreview.innerHTML = '';
        return;
    }
    
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
        customConfirm('File too large! Maximum size is 5MB', () => {});
        e.target.value = '';
        imagePreview.innerHTML = '';
        return;
    }
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        customConfirm('Invalid file type! Please upload PNG, JPG, GIF, or WebP', () => {});
        e.target.value = '';
        imagePreview.innerHTML = '';
        return;
    }
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (evt) => {
        imagePreview.innerHTML = `
            <img src="${evt.target.result}" alt="Preview">
            <p style="margin-top: 8px; color: var(--text-gray); font-size: 0.85rem;">${file.name} (${(file.size / 1024).toFixed(1)} KB)</p>
        `;
    };
    reader.readAsDataURL(file);
}

// ===================================
// Form Submit
// ===================================
async function handleSubmit(e) {
    e.preventDefault();
    
    const name = charNameInput.value.trim();
    const displayName = charDisplayNameInput.value.trim();
    const avatarFile = charAvatarInput.files[0];
    
    // Validation
    if (!name || !displayName) {
        customConfirm('Please fill in all required fields', () => {});
        return;
    }
    
    if (!/^[a-z0-9_]+$/.test(name)) {
        customConfirm('Character name must be lowercase letters, numbers, and underscores only', () => {});
        return;
    }
    
    if (!editingCharacterId && !avatarFile) {
        customConfirm('Please upload an avatar image', () => {});
        return;
    }
    
    const btn = document.getElementById('btn-save-char');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    try {
        if (editingCharacterId) {
            await updateCharacter(editingCharacterId, displayName, avatarFile);
        } else {
            await createCharacter(name, displayName, avatarFile);
        }
        
        closeModal();
        loadCustomCharacters();
    } catch (err) {
        customConfirm(`Error: ${err.message}`, () => {});
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ===================================
// API Calls
// ===================================
async function createCharacter(name, displayName, avatarFile) {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('display_name', displayName);
    formData.append('avatar', avatarFile);
    
    const res = await fetch(`${API_BASE}/characters/custom`, {
        method: 'POST',
        body: formData
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create character');
    }
    
    return data;
}

async function updateCharacter(id, displayName, avatarFile) {
    const formData = new FormData();
    formData.append('display_name', displayName);
    
    if (avatarFile) {
        formData.append('avatar', avatarFile);
    }
    
    const res = await fetch(`${API_BASE}/characters/custom/${id}`, {
        method: 'PUT',
        body: formData
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update character');
    }
    
    return data;
}

async function deleteCharacter(id, displayName) {
    customConfirm(
        `Are you sure you want to delete "${displayName}"?\n\nThis character and its avatar image will be permanently removed.`,
        async () => {
            try {
                const res = await fetch(`${API_BASE}/characters/custom/${id}`, {
                    method: 'DELETE'
                });
                
                const data = await res.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Failed to delete character');
                }
                
                loadCustomCharacters();
            } catch (err) {
                // Show error in a custom way too
                customConfirm(
                    `Error deleting character: ${err.message}`,
                    () => {} // Just close on confirm
                );
            }
        }
    );
}

// ===================================
// Utility
// ===================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
