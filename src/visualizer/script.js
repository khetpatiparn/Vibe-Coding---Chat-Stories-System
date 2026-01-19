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
    
    // Intro overlay elements
    this.introOverlay = document.getElementById("intro-overlay");
    this.introTitle = document.getElementById("intro-title");
    
    // Audio settings (synced from parent dashboard)
    this.sfxEnabled = true;
    this.sfxPath = null;

    this.init();
  }

  init() {
    this.setupHeader();
    this.applyTheme();
    // Clear existing messages only
    this.container.innerHTML = '';
  }

  setupHeader() {
    // Use room_name if set, otherwise use default placeholder
    if (this.data.room_name && this.data.room_name.trim() !== '') {
      this.headerName.innerText = this.data.room_name;
    } else {
      // Default placeholder - user can set it in dashboard
      this.headerName.innerText = 'ชื่อห้องแชท';
    }
  }

  applyTheme() {
    // Apply theme class to body
    if (this.data.theme === 'horror') {
        document.body.classList.add('theme-horror');
    } else {
        document.body.classList.remove('theme-horror');
    }
  }

  resolvePath(path) {
    // Handle paths for both local file view and server view
    if (!path) return "";
    
    // Support external URLs (GIPHY, etc.)
    if (path.startsWith('http')) return path;
    
    // If running on server (localhost:3000), assets are at /assets
    // If running file://, assets are relative
    if (window.location.protocol === 'http:') {
        if (path.startsWith('../../')) return path.replace('../../', '/');
        if (path.startsWith('assets')) return '/' + path;
    }
    return path;
  }

  /**
   * Play intro screen with room name and TTS audio
   */
  async playIntro() {
    if (!this.introOverlay || !this.introTitle) return;
    
    // Check if horror/drama theme (skip voice, text-only intro)
    const isHorror = this.data.theme === 'horror' || this.data.theme === 'drama';
    
    // Set title text
    this.introTitle.textContent = this.data.room_name || '';
    
    // Show intro overlay
    this.introOverlay.classList.remove('hidden');
    
    // Horror theme: no voice, text-only intro (1.5s + 0.5s fade = 2s total)
    if (isHorror) {
      await this.wait(1500);
    } 
    // Normal theme: play intro audio if available
    else if (this.data.intro_path) {
      try {
        const audioPath = this.resolvePath(this.data.intro_path);
        const audio = new Audio(audioPath);
        audio.volume = 1.0;
        
        // Wait for audio to finish or timeout after 5 seconds
        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = () => {
            console.log('Intro audio error');
            resolve();
          };
          setTimeout(resolve, 5000); // Max 5 seconds
          audio.play().catch(e => {
            console.log('Intro audio blocked:', e);
            resolve();
          });
        });
      } catch (e) {
        console.log('Intro audio error:', e);
      }
    } else {
      // No audio, just show for 2 seconds
      await this.wait(2000);
    }
    
    // No extra delay for horror - keep it quick
    
    // Play swoosh transition sound (if available from parent)
    this.playSwooshSound();
    
    // Horror: Fade out before entering chat
    if (isHorror) {
      this.introOverlay.classList.add('fade-out');
      await this.wait(500); // Wait for fade animation
    }
    
    // Hide intro overlay
    this.introOverlay.classList.add('hidden');
    
    // Notify parent to start BGM
    window.parent.postMessage({ type: 'bgm-start' }, '*');
  }

  /**
   * Play swoosh transition sound
   */
  playSwooshSound() {
    try {
      const swooshPath = window.parent.swooshPath;
      if (swooshPath) {
        const resolvedPath = this.resolvePath(swooshPath);
        const audio = new Audio(resolvedPath);
        audio.volume = window.parent.swooshVolume || 0.7;
        audio.play().catch(e => console.log('Swoosh sound blocked:', e));
      }
    } catch (e) {
      console.log('Swoosh sound error:', e);
    }
  }

  async play() {
    // Get startAt from URL
    const urlParams = new URLSearchParams(window.location.search);
    const startAt = parseInt(urlParams.get('startAt')) || 0;
    const skipIntro = urlParams.get('skipIntro') === 'true';

    // Play intro if available and not skipped
    // Horror/Drama themes show text-only intro even without audio path
    const isHorrorOrDrama = this.data.theme === 'horror' || this.data.theme === 'drama';
    const hasIntro = this.data.intro_path || isHorrorOrDrama;
    
    if (!skipIntro && startAt === 0 && hasIntro) {
      await this.playIntro();
    } else {
       // If no intro or skipped, notify parent to start BGM immediately
       window.parent.postMessage({ type: 'bgm-start' }, '*');
    }

    this.lastSender = null; // Reset sender tracking for playback

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
    // Get character data, with fallback for unknown characters
    let senderChar = this.data.characters[item.sender];
    
    // Fallback for unknown characters (e.g., custom_XX that wasn't loaded)
    if (!senderChar) {
        console.warn(`Unknown character: ${item.sender}, using fallback`);
        senderChar = {
            name: item.sender,
            avatar: 'assets/avatars/person1.png',
            side: 'left'
        };
    }
    
    const isLeft = senderChar.side === "left";
    
    // Time Divider Handling
    if (item.sender === 'time_divider') {
        if (!isInstant) {
            // Respect reaction delay (Reading time for previous message)
            const delay = item.reaction_delay !== undefined ? parseFloat(item.reaction_delay) : (window.TIMING_CONFIG?.DEFAULT_REACTION_DELAY || 0.8);
            await this.wait(delay * 1000);

            // Play Effect
            await this.playTimeDividerEffect(item.message);
        }
        this.addMessage(item, null);
        return;
    }

    // Default fallback if delay missing
    const defaultDelay = 1.0 + (item.message ? item.message.length * 0.05 : 0);
    
    // First message special timing: no reaction delay (intro already handled transition)
    const isFirstMessage = this.currentIndex === 0;
    
    // Additive Logic: Reaction + Typing
    let reactionTime = (item.reaction_delay !== undefined && item.reaction_delay !== null) 
                         ? parseFloat(item.reaction_delay) 
                         : (window.TIMING_CONFIG?.DEFAULT_REACTION_DELAY || 0.8);
    let typingTotal = (item.delay || defaultDelay);
    
    // Override for first message: no reaction delay, adjust typing by side
    // Left (others): 1s typing indicator, Right (me): 0.5s wait
    if (isFirstMessage) {
        reactionTime = 0;
        typingTotal = isLeft ? 1.0 : 0.5;
    }
    
    const totalDuration = reactionTime + typingTotal;

    // 1. Delays & Typing (Skip if instant)
    if (!isInstant) {
        if (isLeft) {
            // Gap: Reading Time (Silent)
            await this.wait(reactionTime * 1000);

            // Show typing indicator with correct avatar
            this.showTyping(senderChar);
            
            // Phase 1: Typing (80% of typingTotal)
            await this.wait(typingTotal * 0.8 * 1000);
            
            // Phase 2: Sending Pause (20% of typingTotal)
            this.hideTyping();
            await this.wait(typingTotal * 0.2 * 1000);
            
        } else {
            // Right side (Me) - wait full duration (Reaction + Typing)
            await this.wait(totalDuration * 1000);
        }
    }

    // 2. Add Message Bubble
    this.addMessage(item, senderChar);
    
    // 3. Play Sound (Skip if instant)
    if (!isInstant) this.playSound('pop');



    // 5. Scroll to bottom
    this.scrollToBottom();
    
    // Add tiny delay for instant rendering to preventing UI freeze
    if (isInstant) await this.wait(10); 
  }

  showTyping(char) {
    this.typingIndicator.classList.remove("hidden");
    
    // Update typing avatar
    if (char && char.avatar && this.typingAvatar) {
        const resolvedPath = this.resolvePath(char.avatar);
        this.typingAvatar.src = resolvedPath;
    }
  }

  hideTyping() {
    this.typingIndicator.classList.add("hidden");
  }

  playTypingBubbleSound() {
    try {
      const soundPath = this.resolvePath('assets/typingBubble/bubble-pop-406640.mp3');
      const audio = new Audio(soundPath);
      audio.volume = 0.2; // 20% volume
      audio.play().catch(e => console.log('Typing bubble sound blocked:', e));
    } catch (e) {
      console.log('Typing bubble sound error:', e);
    }
  }

  renderStory() {
    this.container.innerHTML = "";
    this.lastSender = null; // Reset sender tracking
    
    // Safety check
    if (!this.data || !this.data.dialogues) return;

    // Check project settings for bubble names
    // (We use this.data.show_partner_name / show_my_name directly in addMessage)

    this.data.dialogues.forEach((item) => {
      const char = this.data.characters[item.sender]; // Assuming getCharacter is not yet implemented, using direct lookup
      this.addMessage(item, char);
    });

    // Scroll to bottom
    this.scrollToBottom();
  }

  addMessage(item, char) {
    // Time Divider Static Render
    if (item.sender === 'time_divider') {
        const div = document.createElement('div');
        div.className = 'time-divider';
        div.innerText = item.message;
        this.container.appendChild(div);
        
        this.lastSender = null; // Reset grouping after divider
        return;
    }

    const msgDiv = document.createElement("div");
    
    // Grouping Logic
    const isConsecutive = (this.lastSender === item.sender);
    this.lastSender = item.sender;

    // Debug: Log character lookup
    // console.log("Rendering message:", item.sender, "char:", char, "side:", char?.side);
    
    // If char is undefined or has no side, try to determine from message data
    const sideClass = char && char.side ? char.side : "left";
    msgDiv.classList.add("message", sideClass);
    if (isConsecutive) msgDiv.classList.add("consecutive");

    // Avatar HTML
    // If consecutive, we keep the container but hide the image (or make it transparent/invisible)
    // ensuring alignment stays correct.
    const avatarContent = isConsecutive ? '' : `<img src="${this.resolvePath(char.avatar)}" alt="${char.name}">`;
    
    const avatarHtml = `
      <div class="message-avatar" style="${isConsecutive ? 'visibility: hidden;' : ''}">
        ${avatarContent}
      </div>`;

    // Toggle sender name visibility
    let showName = false;
    if (sideClass === 'left') {
        showName = this.data.show_partner_name !== undefined ? (this.data.show_partner_name === 1) : true;
    } else {
        showName = this.data.show_my_name !== undefined ? (this.data.show_my_name === 1) : false;
    }

    // Smart Grouping: Hide name if consecutive
    if (isConsecutive) {
        showName = false;
    }

    const senderHtml = showName ? `<div class="message-sender">${char.name}</div>` : '';

    // Image HTML (No Bubble Wrapper)
    let imageHtml = '';
    if (item.image_path) {
        // Check for GIPHY
        const isGiphy = item.image_path.includes('giphy.com') || item.image_path.includes('.gif');
        
        if (isGiphy) {
            // FORCE GIF for Stickers to preserve transparency
            // We disabled MP4 conversion because MP4s don't support alpha channel easily on web
            imageHtml = `<img src="${item.image_path}" class="chat-image sticker">`;
        } else {
            // Standard Image
            imageHtml = `<img src="${item.image_path.startsWith('data:') ? item.image_path : this.resolvePath(item.image_path)}" class="chat-image">`;
        }
    }

    // Text HTML (Inside Bubble)
    let textHtml = '';
    if (item.message) {
        textHtml = `
            <div class="message-bubble">
                <div>${item.message}</div>
            </div>`;
    }

    // Wrapper for Name + Image + Bubble
    const contentWrapper = `
      <div class="message-content-wrapper">
          ${senderHtml}
          ${imageHtml}
          ${textHtml}
      </div>`;

    // Swap order for right side
    if (sideClass === "right") {
      msgDiv.innerHTML = contentWrapper + avatarHtml;
    } else {
      msgDiv.innerHTML = avatarHtml + contentWrapper;
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

  async playTimeDividerEffect(text) {
    let overlay = document.getElementById('time-divider-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'time-divider-overlay';
        overlay.className = 'time-divider-overlay';
        document.body.appendChild(overlay);
    }
    
    overlay.innerText = text;
    overlay.classList.add('active'); // Fade in
    
    // Wait for display time (2 seconds)
    await this.wait(2000);
    
    overlay.classList.remove('active'); // Fade out
    
    // Wait for fade out transition (0.5s)
    await this.wait(500); 
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
    { sender: "boss", message: "ระบบพร้อมใช้งานแล้ว!", delay: 1 },
    { sender: "me", message: "เยี่ยมเลยครับ", delay: 1 }
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
                // 1. Time Divider Effect Check (Continuous State)
                let activeOverlay = false;
                let overlayText = "";
                
                for (const item of timeline) {
                    if (item.dialogue.sender === 'time_divider') {
                        // Effect Window: From start of "action" (after reaction) until message appears
                        if (currentTime >= item.typingStart && currentTime < item.appearTime) {
                            activeOverlay = true;
                            overlayText = item.dialogue.message;
                        }
                    }
                    
                    // 2. Show messages (One-time trigger)
                    if (currentTime >= item.appearTime && !shownMessages.has(item.index)) {
                        shownMessages.add(item.index);
                        const dialogue = storyData.dialogues[item.index];
                        const senderChar = storyData.characters[dialogue.sender];
                        story.addMessage(dialogue, senderChar);
                        story.scrollToBottom();
                        console.log(`[${currentTime.toFixed(1)}s] Showing message ${item.index + 1}`);
                    }
                }
                
                // 3. Apply Overlay State
                let overlay = document.getElementById('time-divider-overlay');
                if (activeOverlay) {
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.id = 'time-divider-overlay';
                        overlay.className = 'time-divider-overlay';
                        document.body.appendChild(overlay);
                    }
                    overlay.innerText = overlayText;
                    overlay.classList.add('active'); // Force Opacity 1
                } else {
                    if (overlay) overlay.classList.remove('active'); // Force Opacity 0
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
