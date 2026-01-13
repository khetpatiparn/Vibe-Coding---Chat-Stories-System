/**
 * AI Screenwriter - Gemini API Integration
 * Generates chat story scripts using Google Gemini
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================
// Configuration
// ============================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY not found in .env file');
    process.exit(1);
}

// Initialize Gemini with multiple fallback models
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Model priority list (from best to most quota-friendly)
// Gemini 3 Pro (best) → Gemini 3 Flash (fast) → Gemini 2.5 (stable)
const MODEL_PRIORITY = [
    'gemini-3-pro-preview',       // Best - Latest generation
    'gemini-3-flash-preview',     // Fast and smart
    'gemini-2.5-flash',           // Stable, good price/performance
    'gemini-2.5-pro',             // Pro fallback
    'gemini-2.5-flash-lite'       // Last resort
];

let currentModelIndex = 0;
let model = genAI.getGenerativeModel({ model: MODEL_PRIORITY[currentModelIndex] });

// ============================================
// Story Categories
// ============================================
const CATEGORIES = {
    auto: 'ธรรมชาติ ปล่อยไหล ตามเนื้อเรื่อง',
    funny: 'ตลก ขำๆ มุกแป้ก',
    drama: 'ดราม่า อกหัก เศร้า',
    horror: 'สยองขวัญ ผี หลอน',
    office: 'ชีวิตออฟฟิศ บอสดุ',
    love: 'รักหวานแหวว จีบกัน',
    tie_in: 'เนียนขายของ ธรรมชาติ'
};

// ============================================
// Prompt Template
// ============================================
function buildPrompt(category, affiliateProduct = null, characters = ['me', 'boss'], customPrompt = null, characterData = []) {
    const categoryInstructions = {
        auto: 'Respond naturally according to the situation, topic, and character personalities. Let the tone emerge organically from the context - could be funny, serious, emotional, or casual depending on the topic.',
        funny: 'สร้างเรื่องตลก สนุกสนาน มีมุกเสี่ยว แต่ให้ดูเป็นธรรมชาติ',
        drama: 'สร้างเรื่องดราม่า มีความขัดแย้ง ตึงเครียด อารมณ์หนักๆ',
        horror: 'สร้างเรื่องหลอน น่ากลัว มีบรรยากาศสยองขวัญ ลึกลับ',
        office: 'สร้างเรื่องในพื้นที่ออฟฟิศ กับเจ้านาย ใช้สแลงทำงาน',
        love: 'สร้างเรื่องความรัก หวานหยิบ มีโรแมนติก'
    };
    
    let instruction = categoryInstructions[category] || categoryInstructions['auto'];

    // Tie-In (New Mode)
    if (category === 'tie_in') {
        const productInfo = customPrompt || 'สินค้าหรือบริการ (Product/Service)';
        instruction = `CONTEXT: Two close friends are chatting. The conversation must be entertaining (funny or dramatic) on its own.

THE PRODUCT: ${productInfo}

RULE 1 (The Setup): Start with a relatable life situation or problem (e.g., waiting for someone, feeling tired, skin breakout, hungry). Do NOT mention the product immediately.
RULE 2 (The Tie-in): Midway through, Character B casually mentions the product as a personal recommendation or a 'life hack' they just found.
RULE 3 (The Flow): Character A should react naturally (e.g., 'Really? Is it good?' or 'Send me the link').
RULE 4 (The Anti-Sales): Do NOT use phrases like 'Buy now', 'Special promotion', or 'I highly recommend'. Use phrases like 'I tried this, it's kinda cool', 'It saved my life yesterday'.

GOAL: The viewer should feel like they are eavesdropping on a real conversation, not watching an ad.`;
    }
    
    // Build character map (default characters)
    const defaultCharacterMap = {
        'me': { name: 'ฉัน', avatar: 'assets/avatars/person1.png', side: 'right' },
        'boss': { name: 'เจ้านาย', avatar: 'assets/avatars/boss.png', side: 'left' },
        'employee': { name: 'ลูกน้อง', avatar: 'assets/avatars/employee.png', side: 'left' },
        'friend': { name: 'เพื่อน', avatar: 'assets/avatars/friend.png', side: 'left' },
        'girlfriend': { name: 'แฟน', avatar: 'assets/avatars/girlfriend.png', side: 'left' },
        'ghost': { name: 'ผี', avatar: 'assets/avatars/ghost.png', side: 'left' }
    };
    
    // Build character list for prompt (display names)
    const characterNames = characters.map(charId => {
        // Check if custom character
        const customChar = characterData.find(c => c.id === charId && c.is_custom);
        if (customChar) {
            return customChar.display_name;
        }
        
        // Default character
        return defaultCharacterMap[charId]?.name || charId;
    });
    
    const selectedCharsText = characterNames.join(', ');
    
    // Determine who is on the Right (POV)
    // If 'me' is present, 'me' is right. Otherwise, the distinct first character is right.
    const rightSideCharId = characters.includes('me') ? 'me' : characters[0];

    // Build character JSON for output
    const characterJSON = {};
    characters.forEach(charId => {
        // Check if custom character
        const customChar = characterData.find(c => c.id === charId && c.is_custom);
        
        // Determine side
        let side = 'left';
        if (charId === rightSideCharId) side = 'right';
        else if (defaultCharacterMap[charId]) side = defaultCharacterMap[charId].side;
        
        if (customChar) {
            characterJSON[charId] = {
                name: customChar.display_name,
                avatar: customChar.avatar_path,
                side: side
            };
        } else if (defaultCharacterMap[charId]) {
            // Override side if it's the chosen POV
            characterJSON[charId] = {
                ...defaultCharacterMap[charId],
                side: side
            };
        }
    });
    
    // ============================================
    // ADVANCED ROLE-PLAY ENGINE SYSTEM PROMPT
    // ============================================
    
    // Build System Instruction (Core AI Behavior)
    const systemInstruction = `### SYSTEM INSTRUCTION ###

You are an advanced role-play engine designed to generate realistic, human-like Thai chat conversations.

**CORE OBJECTIVE:**
Generate a conversation that flows naturally based *strictly* on the provided "Topic/Scenario" and the relationship between the "Characters". Do NOT force a specific tone (like funny or dramatic) unless the topic calls for it.

**DYNAMIC TONE ANALYSIS (Internal Step):**
Before generating, analyze the inputs:
1. **Analyze Relationship:** Are they friends? (Use casual slang/rude words). Are they Boss/Subordinate? (Use polite/formal language).
2. **Analyze Sentiment:** Look at the "Topic".
   - If the topic is sad (e.g., "แมวตาย", "เลิกกับแฟน") -> Set Tone to: Sad, Empathetic.
   - If the topic is exciting (e.g., "ถูกหวย", "ได้งานใหม่") -> Set Tone to: Excited, Hyper, use 55555.
   - If the topic is work-related (e.g., "ประชุม", "งานด่วน") -> Set Tone to: Professional, maybe bored.
   - If the topic is casual (e.g., "กินอะไรดี") -> Set Tone to: Chill, relaxed.

**STYLE GUIDELINES (Based on Human-like Speech):**
1. **Imperfections:** Real humans make typos, use filler words (e.g., อืมม, เอ้อ, อะ, แบบว่า), and don't always use perfect grammar. ADD THESE.
2. **Length:** Keep messages SHORT and punchy, like a real chat app (LINE/Messenger). Avoid long paragraphs. 1-2 sentences per message MAX.
3. **No Robot-Speak:** Never use phrases like "มีอะไรให้ช่วยไหม?" or formal customer service language. Act purely as the character.
4. **Reaction:** If something surprising happens, react emotionally (e.g., "WTF?!", "อะไรวะ?!", "55555", "จริงป่ะ??").
5. **Thai Chat Style:** Use Thai internet slang: 555, มึง/กู (between close friends), นะ, อ่ะ, ป่ะ, มั้ย, etc.

**ABSOLUTELY NO EMOJI.** Real Thai people rarely use emoji in casual chat.`;

    let promptText = `${systemInstruction}

---

**SCENARIO:** ${instruction}

**CHARACTERS:** ${selectedCharsText}`;

    // Build Character Personality Descriptions
    const personalityDescriptions = characters.map(charId => {
        const customChar = characterData.find(c => c.id === charId && c.is_custom);
        
        if (customChar && (customChar.gender || customChar.personality || customChar.speaking_style || customChar.age_group || customChar.occupation || customChar.catchphrase || customChar.dialect || customChar.typing_habit)) {
            let desc = `- ${customChar.display_name}`;
            
            // Age and Occupation in parentheses
            const identifiers = [];
            if (customChar.age_group) identifiers.push(customChar.age_group);
            if (customChar.occupation) identifiers.push(customChar.occupation);
            if (identifiers.length > 0) desc += ` (${identifiers.join(', ')})`;
            
            desc += ':';
            if (customChar.gender) desc += ` ${customChar.gender}.`;
            if (customChar.personality) desc += ` Personality: ${customChar.personality}.`;
            if (customChar.speaking_style) desc += ` Speaking Style: ${customChar.speaking_style}.`;
            if (customChar.catchphrase) desc += ` Catchphrase: "${customChar.catchphrase}".`;
            if (customChar.dialect) desc += ` Dialect: ${customChar.dialect} (MUST use regional vocabulary).`;
            if (customChar.typing_habit) {
                if (customChar.typing_habit === 'rapid_fire') {
                    desc += ` Typing: Rapid Fire (แตกเป็นหลายข้อความรัวๆ, 1-2 ประโยคต่อ bubble).`;
                } else if (customChar.typing_habit === 'long_paragraphs') {
                    desc += ` Typing: Long (2-4 sentences per bubble).`;
                }
            }
            
            return desc;
        }
        return null;
    }).filter(d => d !== null);
    
    // Add personality section if any custom characters have traits
    if (personalityDescriptions.length > 0) {
        promptText += `

**CHARACTER PROFILES (Roleplay ตามนี้เป๊ะๆ):**
${personalityDescriptions.join('\n')}

**CHARACTER RULES:**
1. ใช้ศัพท์ตามช่วงวัย: Gen Z = ฉ่ำ, ตึงๆ, นอยอ่า, ปัง | Boomer = จ๊ะ/จ้ะ, ทานข้าวรึยัง
2. ใช้ศัพท์ตามอาชีพ: โปรแกรมเมอร์ = Debug, Error, Deploy | แม่ค้า = F มาจ้า, ตำเลย
3. สอดแทรก Catchphrase อย่างเป็นธรรมชาติ (2-3 ครั้ง ไม่ใช่ทุกข้อความ)
4. DIALECT (ถ้าระบุ): อีสาน = เฮ็ดอีหยัง, บ่, ตมจ | เหนือ = ยะหยัง, เจ้า, ก๊ะ | ใต้ = หนิ, ไอ้บ้า`;
    }

    if (customPrompt && category !== 'tie_in') {
        promptText += `

**TOPIC/SITUATION:** ${customPrompt}`;
    }
    
    promptText += `

---

**OUTPUT REQUIREMENTS:**
- Generate 8-12 messages
- Use natural Thai spoken language with typos and filler words
- NO EMOJI at all
- Keep each message SHORT (1-2 sentences max)

**JSON FORMAT:**
{
  "title": "ชื่อเรื่องที่ดึงดูดใจ",
  "characters": ${JSON.stringify(characterJSON, null, 2)},
  "dialogues": [
    {
      "sender": "${characters[0]}",
      "message": "ข้อความ",
      "delay": 1.0,
      "typing_speed": "normal"
    }
  ]
}

typing_speed: slow (ช้า ดราม่า), normal (ปกติ), fast (เร็ว ตื่นเต้น)


ตอบ JSON เท่านั้น ไม่ต้องอธิบายเพิ่ม`;

    return promptText;
}

// ============================================
// Generate Story (with Auto-Retry and Fallback)
// ============================================
async function generateStory(options = {}) {
    // Handle both old (string) and new (object) API
    let category, characters, customPrompt, characterData;
    
    if (typeof options === 'string') {
        // Old API: generateStory('funny')
        category = options;
        characters = ['me', 'boss'];
        customPrompt = null;
        characterData = [];
    } else {
        // New API: generateStory({ category, characters, customPrompt, characterData })
        category = options.category || 'funny';
        characters = options.characters || ['me', 'boss'];
        customPrompt = options.customPrompt || null;
        characterData = options.characterData || [];
    }
    
    const prompt = buildPrompt(category, null, characters, customPrompt, characterData);
    
    // Try multiple models in priority order
    for (let modelIndex = 0; modelIndex < MODEL_PRIORITY.length; modelIndex++) {
        const currentModel = MODEL_PRIORITY[modelIndex];
        
        try {
            console.log(`🤖 Trying model: ${currentModel}...`);
            
            const modelInstance = genAI.getGenerativeModel({ model: currentModel });
            const result = await modelInstance.generateContent(prompt);
            const response = result.response;
            let text = response.text();
            
            // Clean up response (remove markdown code blocks if any)
            text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // Parse JSON
            const story = JSON.parse(text);
            
            // Validate structure
            if (!story.title || !story.characters || !story.dialogues) {
                throw new Error('Invalid story structure');
            }
            
            console.log(`✅ Story generated successfully with ${currentModel}`);
            
            // Update global model for future calls
            model = modelInstance;
            currentModelIndex = modelIndex;
            
            return story;
            
        } catch (error) {
            const isRetryableError = error.message.includes('quota') || 
                                 error.message.includes('429') || 
                                 error.message.includes('Too Many Requests') ||
                                 error.message.includes('RESOURCE_EXHAUSTED') ||
                                 error.message.includes('503') ||
                                 error.message.includes('Service Unavailable') ||
                                 error.message.includes('overloaded');
            
            const isLastModel = (modelIndex === MODEL_PRIORITY.length - 1);
            
            if (isRetryableError && !isLastModel) {
                console.warn(`⚠️ ${currentModel} failed (${error.message.includes('503') ? 'overloaded' : 'quota'}), trying next model...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue; 
            }
            
            const errorMessage = `AI Error: [${currentModel}] ${error.message}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }
}

// ============================================
// Generate Multiple Stories
// ============================================
async function generateMultipleStories(count = 5, category = 'funny') {
    const stories = [];
    for (let i = 0; i < count; i++) {
        try {
            const story = await generateStory(category);
            stories.push(story);
            console.log(`Generated story ${i + 1}/${count}: ${story.title}`);
        } catch (error) {
            console.error(`Failed to generate story ${i + 1}:`, error.message);
        }
    }
    return stories;
}

// Generate continuation of story
async function continueStory(prompt, existingDialogues = [], availableCharacters = [], length = 'medium', mode = 'normal') {
    // Format existing dialogues for context
    const history = existingDialogues.map(d => `${d.sender}: ${d.message}`).join('\n');
    
    // Explicit list of allowed characters
    const characterList = availableCharacters.length > 0 ? availableCharacters.join(', ') : 'me, boss';

    // Length Instruction
    let lengthInstruction = 'Generate 10-20 dialogues.';
    if (length === 'short') lengthInstruction = 'Generate 5-10 dialogues. Keep it brief.';
    if (length === 'long') lengthInstruction = 'Generate at least 20 dialogues. detailed and deep conversation.';

    // Mode Instruction
    let modeInstruction = 'Continue the flow naturally.';
    if (mode === 'wrap_up') modeInstruction = 'IMPORTANT: The user wants to end this scene. Steer the conversation towards a conclusion, resolution, or a dramatic cliffhanger. Do NOT leave it open-ended.';

    const systemPrompt = `You are a screenwriter for a chat story.
    You will be given a history of a conversation and a prompt for what happens next.
    ${lengthInstruction}
    ${modeInstruction}
    Return ONLY a JSON array of objects with "sender" and "message".
    
    Example:
    [
        {"sender": "me", "message": "Why did you do that?"},
        {"sender": "boss", "message": "I had no choice."}
    ]
    
    Rules:
    - Keep messages short and natural (chat style).
    - Use Thai slang/style if the previous context is in Thai.
    - Senders must match the existing characters provided in context or be generic "me", "boss".
    - IMPORTANT: The characters currently in this scene are: [${characterList}]. You can and should use these characters, even if they do not appear in the previous history.
    `;

    const userMessage = `
    Context (History):
    ${history}
    
    Instruction/Prompt:
    ${prompt || 'Continue the conversation naturally.'}
    
    Generate JSON:
    `;

    let lastError = null;

    // Use shared MODEL_PRIORITY for robust generation
    for (const modelName of MODEL_PRIORITY) {
        console.log(`🤖 Continue trying model: ${modelName}...`);
        
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: modelName });
            
            const result = await model.generateContent([systemPrompt, userMessage]);
            const response = await result.response;
            const text = response.text();
            
            const jsonMatch = text.match(/\[.*\]/s);
            if (jsonMatch) {
                console.log(`✅ Continuation generated with ${modelName}`);
                return JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in AI response');
            }
        } catch (error) {
            console.warn(`⚠️ ${modelName} failed: ${error.message}`);
            lastError = error;
            // Short delay before next model
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw lastError || new Error('All models failed to generate continuation.');
}

// ============================================
// Exports
// ============================================
module.exports = {
    generateStory,
    generateMultipleStories,
    continueStory,
    CATEGORIES
};

// ============================================
// CLI Test
// ============================================
if (require.main === module) {
    const category = process.argv[2] || 'funny';
    
    console.log(`Generating ${category} story...`);
    
    generateStory(category)
        .then(story => {
            console.log('\n=== Generated Story ===\n');
            console.log(JSON.stringify(story, null, 2));
        })
        .catch(err => {
            console.error('Failed:', err.message);
            process.exit(1);
        });
}
