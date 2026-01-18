/**
 * Sound Library - JavaScript Controller
 */

const API_BASE = 'http://localhost:3000/api';

// State
let currentTab = 'bgm';
let selectedCollectionId = null;
let collections = { bgm: [], sfx: [] };
let sounds = [];

// ============================================
// Toast Notification
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadCollections('bgm');
    loadCollections('sfx');
});

// ============================================
// Tab Switching
// ============================================
function switchTab(type) {
    currentTab = type;
    selectedCollectionId = null;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    // Show/hide sections
    document.getElementById('bgm-section').style.display = type === 'bgm' ? 'block' : 'none';
    document.getElementById('sfx-section').style.display = type === 'sfx' ? 'block' : 'none';
    
    // Clear sound list
    document.getElementById(`${type}-sounds`).innerHTML = '<div class="empty-state">เลือก Collection เพื่อดูเสียง</div>';
}

// ============================================
// Collections
// ============================================
async function loadCollections(type) {
    try {
        const res = await fetch(`${API_BASE}/sounds/collections/${type}`);
        const data = await res.json();
        collections[type] = data;
        renderCollections(type);
    } catch (err) {
        console.error('Failed to load collections:', err);
    }
}

function renderCollections(type) {
    const container = document.getElementById(`${type}-collections`);
    
    // Add "New Collection" card
    let html = `
        <div class="collection-card add-new" onclick="showCollectionModal('${type}')">
            <span style="font-size: 2rem;">+</span>
            <span>สร้าง Collection</span>
        </div>
    `;
    
    // Add existing collections
    for (const col of collections[type]) {
        html += `
            <div class="collection-card ${selectedCollectionId === col.id ? 'selected' : ''}" 
                 onclick="selectCollection(${col.id}, '${type}')"
                 data-id="${col.id}">
                <div class="collection-name">${getCollectionIcon(col.name)} ${col.name}</div>
                <div class="collection-count">คลิกเพื่อดูเสียง</div>
                <button class="btn-icon danger" style="position: absolute; top: 8px; right: 8px; padding: 4px 8px;" 
                        onclick="event.stopPropagation(); deleteCollection(${col.id})">🗑️</button>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function getCollectionIcon(name) {
    const icons = {
        'funny': '🎭',
        'horror': '👻',
        'chill': '🌴',
        'pop': '🔔',
        'notification': '📢',
        'typing': '⌨️',
        'swoosh': '💨',
        'transition': '💨'
    };
    return icons[name.toLowerCase()] || '🎵';
}

async function selectCollection(id, type) {
    selectedCollectionId = id;
    
    // Update selected state
    document.querySelectorAll(`#${type}-collections .collection-card`).forEach(card => {
        card.classList.toggle('selected', card.dataset.id == id);
    });
    
    // Load sounds
    try {
        const res = await fetch(`${API_BASE}/sounds/collection/${id}`);
        const data = await res.json();
        renderSounds(data, type);
    } catch (err) {
        console.error('Failed to load sounds:', err);
    }
}

function renderSounds(sounds, type) {
    const container = document.getElementById(`${type}-sounds`);
    
    if (sounds.length === 0) {
        container.innerHTML = '<div class="empty-state">ยังไม่มีเสียงใน Collection นี้</div>';
        return;
    }
    
    let html = '';
    for (const sound of sounds) {
        html += `
            <div class="sound-item" data-id="${sound.id}">
                <span class="sound-name">🎵 ${sound.name}</span>
                <div class="sound-actions">
                    <button class="btn-icon" onclick="playSound('${sound.filename}')" title="เล่น">▶️</button>
                    <button class="btn-icon danger" onclick="deleteSound(${sound.id})" title="ลบ">🗑️</button>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ============================================
// Create Collection Modal
// ============================================
function showCollectionModal(type) {
    document.getElementById('collection-name').value = '';
    document.getElementById('collection-type').value = type;
    document.getElementById('modal-collection').classList.remove('hidden');
}

function hideCollectionModal() {
    document.getElementById('modal-collection').classList.add('hidden');
}

async function createCollection() {
    const name = document.getElementById('collection-name').value.trim();
    const type = document.getElementById('collection-type').value;
    
    if (!name) {
        showToast('กรุณาใส่ชื่อ Collection', 'warning');
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/sounds/collections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type })
        });
        const data = await res.json();
        
        if (data.success) {
            hideCollectionModal();
            loadCollections(type);
            showToast('สร้าง Collection สำเร็จ!', 'success');
        } else {
            showToast('เกิดข้อผิดพลาด: ' + data.error, 'error');
        }
    } catch (err) {
        console.error('Failed to create collection:', err);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function deleteCollection(id) {
    if (!confirm('ต้องการลบ Collection นี้และเสียงทั้งหมดในนั้น?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/sounds/collections/${id}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (data.success) {
            loadCollections('bgm');
            loadCollections('sfx');
            document.getElementById(`${currentTab}-sounds`).innerHTML = '<div class="empty-state">เลือก Collection เพื่อดูเสียง</div>';
        }
    } catch (err) {
        console.error('Failed to delete collection:', err);
    }
}

// ============================================
// Upload Sound Modal
// ============================================
function showUploadModal(type) {
    document.getElementById('sound-name').value = '';
    document.getElementById('sound-file').value = '';
    document.getElementById('upload-type').value = type;
    
    // Populate collection dropdown
    const select = document.getElementById('sound-collection');
    select.innerHTML = '<option value="">-- เลือก Collection --</option>';
    for (const col of collections[type]) {
        select.innerHTML += `<option value="${col.id}">${col.name}</option>`;
    }
    
    // Pre-select current collection
    if (selectedCollectionId) {
        select.value = selectedCollectionId;
    }
    
    document.getElementById('modal-upload').classList.remove('hidden');
}

function hideUploadModal() {
    document.getElementById('modal-upload').classList.add('hidden');
}

async function uploadSound() {
    const name = document.getElementById('sound-name').value.trim();
    const collectionId = document.getElementById('sound-collection').value;
    const type = document.getElementById('upload-type').value;
    const file = document.getElementById('sound-file').files[0];
    
    if (!name || !file) {
        showToast('กรุณาใส่ชื่อและเลือกไฟล์เสียง', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('sound', file);
    formData.append('name', name);
    formData.append('type', type);
    formData.append('collectionId', collectionId);
    formData.append('collection', collections[type].find(c => c.id == collectionId)?.name || 'default');
    
    try {
        const res = await fetch(`${API_BASE}/sounds/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.success) {
            hideUploadModal();
            if (collectionId) {
                selectCollection(collectionId, type);
            }
            showToast('อัปโหลดสำเร็จ!', 'success');
        } else {
            showToast('เกิดข้อผิดพลาด: ' + data.error, 'error');
        }
    } catch (err) {
        console.error('Failed to upload sound:', err);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function deleteSound(id) {
    if (!confirm('ต้องการลบเสียงนี้?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/sounds/${id}`, { method: 'DELETE' });
        const data = await res.json();
        
        if (data.success) {
            // Reload current collection
            if (selectedCollectionId) {
                selectCollection(selectedCollectionId, currentTab);
            }
        }
    } catch (err) {
        console.error('Failed to delete sound:', err);
    }
}

// ============================================
// Play Sound
// ============================================
let currentAudio = null;

function playSound(filename) {
    // Stop any currently playing sound
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    currentAudio = new Audio('/' + filename);
    currentAudio.play().catch(err => {
        console.error('Failed to play sound:', err);
    });
}
