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
  }

  async processDialogue(item, isInstant = false) {
    const senderChar = this.data.characters[item.sender];
    const isLeft = senderChar && senderChar.side === "left";
    
    // 1. Delays & Typing (Skip if instant)
    if (!isInstant) {
        if (isLeft) {
          this.showTyping(senderChar);
          const typingTime = item.delay * 1000; 
          await this.wait(typingTime);
          this.hideTyping();
        } else {
            await this.wait(item.delay * 1000);
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
    const sideClass = char ? char.side : "left";
    msgDiv.classList.add("message", sideClass);

    const avatarHtml = `
      <div class="message-avatar">
        <img src="${this.resolvePath(char.avatar)}" alt="${char.name}">
      </div>`;

    const bubbleHtml = `
      <div class="message-bubble">
        ${item.message}
        <div class="message-time">${this.getCurrentTime()}</div>
      </div>`;

    // Swap order for right side
    if (sideClass === "right") {
      msgDiv.innerHTML = bubbleHtml + avatarHtml;
    } else {
      msgDiv.innerHTML = avatarHtml + bubbleHtml;
    }

    this.container.appendChild(msgDiv);
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
    
    if (projectId) {
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
