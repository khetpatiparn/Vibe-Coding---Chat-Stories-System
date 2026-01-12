/**
 * Chat Story Visualizer Logic (Updated for AutoChat Studio Pro)
 */

class ChatStory {
  constructor(storyData) {
    this.data = storyData;
    this.currentIndex = 0;
    this.container = document.getElementById("chat-container");
    this.headerName = document.querySelector(".header-name");
    this.headerAvatar = document.querySelector(".header-avatar img");
    this.cameraWrapper = document.getElementById("camera-wrapper");
    this.typingIndicator = document.getElementById("typing-indicator");
    this.typingAvatar = document.querySelector(".typing-avatar img");
    
    // Audio settings (synced from parent dashboard)
    this.sfxEnabled = true;
    this.sfxPath = null;

    this.init();
  }

  init() {
    this.setupHeader();
    this.applyTheme();
    // Clear existing messages
    this.container.innerHTML = '<div id="typing-indicator" class="hidden">...</div>';
    // Re-select typing indicator after clear
    this.typingIndicator = document.getElementById("typing-indicator");
  }

  setupHeader() {
    // Default boss logic or from first char
    const boss = this.data.characters.boss || Object.values(this.data.characters)[0];
    if (boss) {
      this.headerName.innerText = boss.name;
      this.headerAvatar.src = this.resolvePath(boss.avatar);
    }
  }

  applyTheme() {
    // Future: Apply background theme
  }

  resolvePath(path) {
    // Handle paths for both local file view and server view
    if (!path) return "";
    
    // If running on server (localhost:3000), assets are at /assets
    // If running file://, assets are relative
    if (window.location.protocol === 'http:') {
        if (path.startsWith('../../')) return path.replace('../../', '/');
        if (path.startsWith('assets')) return '/' + path;
    }
    return path;
  }

  async play() {
    // Get startAt from URL
    const urlParams = new URLSearchParams(window.location.search);
    const startAt = parseInt(urlParams.get('startAt')) || 0;

    for (let i = 0; i < this.data.dialogues.length; i++) {
      const dialogue = this.data.dialogues[i];
      this.currentIndex = i;
      
      // If before start index, render instantly
      const isInstant = i < startAt;
      await this.processDialogue(dialogue, isInstant);
    }
    
    // Dispatch story-complete event for Puppeteer to catch
    console.log('Dispatching story-complete event');
    window.dispatchEvent(new CustomEvent('story-complete'));
  }

  async processDialogue(item, isInstant = false) {
    const senderChar = this.data.characters[item.sender];
    const isLeft = senderChar && senderChar.side === "left";
    
    // Minimum delay for readability (1.5 seconds)
    const minDelay = 0.5;
    const actualDelay = Math.max(item.delay || 0.5, minDelay);
    
    // 1. Delays & Typing (Skip if instant)
    if (!isInstant) {
        if (isLeft) {
          this.showTyping(senderChar);
          const typingTime = actualDelay * 1000; 
          await this.wait(typingTime);
          this.hideTyping();
        } else {
            await this.wait(actualDelay * 1000);
        }
    }

    // 2. Add Message Bubble
    this.addMessage(item, senderChar);
    
    // 3. Play Sound (Skip if instant)
    if (!isInstant) this.playSound('pop');

    // 4. Apply Camera Effect (Skip if instant or 'normal')
    if (!isInstant && item.camera_effect && item.camera_effect !== 'normal') {
        this.triggerEffect(item.camera_effect);
    }

    // 5. Scroll to bottom
    this.scrollToBottom();
    
    // Add tiny delay for instant rendering to preventing UI freeze
    if (isInstant) await this.wait(10); 
  }

  showTyping(char) {
    this.typingIndicator.classList.remove("hidden");
    // Update typing avatar
    if (char) {
        // Ensure typing avatar exists in DOM if we want to change it
        // Currently style.css/html might not support dynamic typing avatar easily
        // We'll skip updating typing avatar src for now to keep it simple
    }
    this.playSound('typing'); 
  }

  hideTyping() {
    this.typingIndicator.classList.add("hidden");
  }

  addMessage(item, char) {
    const msgDiv = document.createElement("div");
    
    // Debug: Log character lookup
    console.log("Rendering message:", item.sender, "char:", char, "side:", char?.side);
    
    // If char is undefined or has no side, try to determine from message data
    const sideClass = char && char.side ? char.side : "left";
    msgDiv.classList.add("message", sideClass);

    const avatarHtml = `
      <div class="message-avatar">
        <img src="${this.resolvePath(char.avatar)}" alt="${char.name}">
      </div>`;

    const bubbleHtml = `
      <div class="message-bubble">
        ${item.image_path ? `<img src="${item.image_path.startsWith('data:') ? item.image_path : this.resolvePath(item.image_path)}" class="chat-image" style="max-width: 130px; max-height: 130px; border-radius: 8px; display: block; margin: 4px auto; object-fit: cover;">` : ''}
        ${item.message ? `<div>${item.message}</div>` : ''}
        <div class="message-time" style="text-align: right; opacity: 0.7; font-size: 0.7em;">${this.getCurrentTime()}</div>
      </div>`;

    // Swap order for right side
    if (sideClass === "right") {
      msgDiv.innerHTML = bubbleHtml + avatarHtml;
    } else {
      msgDiv.innerHTML = avatarHtml + bubbleHtml;
    }

    this.container.appendChild(msgDiv);
    
    // Play pop sound when message appears
    this.playPopSound();
  }
  
  playPopSound() {
    // Try to get SFX settings from parent window (dashboard)
    try {
      if (window.parent && window.parent !== window) {
        const sfxEnabled = window.parent.sfxEnabled !== false;
        const sfxPath = window.parent.selectedSfxPath;
        const sfxVolume = window.parent.sfxVolume || 0.5;
        
        console.log('[Pop] Enabled:', sfxEnabled, 'Path:', sfxPath, 'Vol:', sfxVolume);
        
        if (sfxEnabled && sfxPath) {
          const audio = new Audio('/' + sfxPath);
          audio.volume = sfxVolume;
          audio.play().catch(e => console.log('Pop sound blocked:', e));
        }
      }
    } catch(e) {
      console.log('Pop sound error:', e);
    }
  }

  triggerEffect(effectName) {
    // Add class
    const className = `effect-${effectName}`;
    this.cameraWrapper.classList.add(className);

    // Remove after animation ends (approx 500ms)
    setTimeout(() => {
        this.cameraWrapper.classList.remove(className);
    }, 600);
  }

  scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }

  getCurrentTime() {
    const now = new Date();
    return now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  playSound(type) {
    // Dispatch event for Puppeteer to catch
    console.log(`[AUDIO] Play ${type}`);
    // Actually play audio in browser (optional for demo)
    // new Audio(`../../assets/sounds/${type}.mp3`).play().catch(e => {});
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// Main Entry
// ============================================

const sampleStory = {
  title: "Example Story",
  characters: {
    boss: { name: "บอส", avatar: "../../assets/avatars/boss.png", side: "left" },
    me: { name: "เรา", avatar: "../../assets/avatars/employee.png", side: "right" }
  },
  dialogues: [
    { sender: "boss", message: "ระบบพร้อมใช้งานแล้ว!", delay: 1, camera_effect: "zoom_in" },
    { sender: "me", message: "เยี่ยมเลยครับ", delay: 1, camera_effect: "normal" }
  ]
};

window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('projectId');
    const storyParam = urlParams.get('story'); // For video render (Puppeteer)
    const tiktokMode = urlParams.get('tiktokMode') === 'true';
    
    // Toggle TikTok overlay
    const tiktokOverlay = document.getElementById('tiktok-overlay');
    if (tiktokOverlay) {
        if (tiktokMode) {
            tiktokOverlay.classList.remove('hidden');
        } else {
            tiktokOverlay.classList.add('hidden');
        }
    }
    
    // Timeline Mode: Puppeteer controls time, messages appear based on time
    const timelineMode = urlParams.get('timelineMode') === 'true';
    const timelineParam = urlParams.get('timeline');
    const renderMode = urlParams.get('renderMode') === 'true';
    
    // Add rendering class for full screen video export
    if (timelineMode || renderMode) {
        document.body.classList.add('rendering');
        console.log('Rendering mode: Full screen enabled');
    }
    
    if (timelineMode && storyParam && timelineParam) {
        console.log('Timeline Mode: Puppeteer controls timing');
        try {
            const storyData = JSON.parse(decodeURIComponent(storyParam));
            const timeline = JSON.parse(decodeURIComponent(timelineParam));
            const story = new ChatStory(storyData);
            
            // Track which messages have been shown
            let shownMessages = new Set();
            
            // Function for Puppeteer to call with current time
            window.setCurrentTime = function(currentTime) {
                // Show all messages that should appear by this time
                for (const item of timeline) {
                    if (currentTime >= item.appearTime && !shownMessages.has(item.index)) {
                        shownMessages.add(item.index);
                        const dialogue = storyData.dialogues[item.index];
                        const senderChar = storyData.characters[dialogue.sender];
                        story.addMessage(dialogue, senderChar);
                        story.scrollToBottom();
                        console.log(`[${currentTime.toFixed(1)}s] Showing message ${item.index + 1}`);
                    }
                }
            };
            
            // Signal ready
            window.timelineReady = true;
            console.log('Timeline mode ready, waiting for setCurrentTime calls');
            
        } catch (e) {
            console.error('Failed to parse timeline data:', e);
        }
        return; // Don't run normal modes
    }
    
    // Render Mode: Wait for Puppeteer to signal start
    // (renderMode already declared above)    
    // Option 1: Load story from URL parameter (Puppeteer video render)
    if (storyParam) {
        console.log('Loading story from URL parameter');
        try {
            const storyData = JSON.parse(decodeURIComponent(storyParam));
            const story = new ChatStory(storyData);
            
            if (renderMode) {
                // In render mode: Wait for Puppeteer to call window.startStory()
                console.log('Render mode: Waiting for start signal...');
                window.storyInstance = story;
                window.startStory = async function() {
                    console.log('Start signal received, playing story...');
                    await story.play();
                    console.log('Story complete, signaling...');
                };
                // Signal that we're ready to start
                window.storyReady = true;
                console.log('Story ready, waiting for start signal');
            } else {
                // Normal mode: Start immediately
                story.play();
            }
        } catch (e) {
            console.error('Failed to parse story from URL:', e);
        }
    }
    // Option 2: Load story from API by projectId (Dashboard preview)
    else if (projectId) {
        console.log('Loading project API:', projectId);
        try {
            const res = await fetch(`http://localhost:3000/api/projects/${projectId}`);
            const storyData = await res.json();
            const story = new ChatStory(storyData);
            story.play();
        } catch (e) {
            console.error('Failed to load project:', e);
        }
    } else {
        // Fallback or Dev mode
        // const story = new ChatStory(sampleStory);
        // story.play();
    }
};
