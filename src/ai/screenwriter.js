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
    'gemini-2.0-flash'            // Last resort
];

let currentModelIndex = 0;
let model = genAI.getGenerativeModel({ model: MODEL_PRIORITY[currentModelIndex] });

// ============================================
// Story Categories
// ============================================
const CATEGORIES = {
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
        funny: 'สร้างเรื่องตลก สนุกสนาน มีมุกเสี่ยว ใช้อีโมจิน่ารัก',
        drama: 'สร้างเรื่องดราม่า มีความขัดแย้ง ตึงเครียด',
        horror: 'สร้างเรื่องหลอน น่ากลัว มีบรรยากาศสยองขวัญ',
        office: 'สร้างเรื่องในพื้นที่ออฟฟิศ กับเจ้านาย ใช้สแลงทำงาน',
        love: 'สร้างเรื่องความรัก หวานหยิบ มีโรแมนติก'
    };
    
    let instruction = categoryInstructions[category] || categoryInstructions['funny'];

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
    
    let promptText = `${instruction}

ให้สร้างบทสนทนาสำหรับตัวละครเหล่านี้: ${selectedCharsText}`;

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
                    desc += ` Typing: Rapid Fire (แตกเป็นหลายข้อความ, 1-2 ประโยคต่อ bubble, ส่งรัวๆ).`;
                } else if (customChar.typing_habit === 'long_paragraphs') {
                    desc += ` Typing: Long Paragraphs (detailed messages, 2-4 sentences per bubble).`;
                }
            }
            
            return desc;
        }
        return null;
    }).filter(d => d !== null);
    
    // Add personality section if any custom characters have traits
    if (personalityDescriptions.length > 0) {
        promptText += `

CHARACTER PROFILES (สำคัญมาก - ต้อง Roleplay ตามนี้เป๊ะๆ):
${personalityDescriptions.join('\n')}

IMPORTANT INSTRUCTIONS:
1. ใช้ศัพท์ตามช่วงวัย: Gen Z = ฉ่ำ, ตึงๆ, นอยอ่า | Boomer = จ๊ะ/จ้ะ, ทานข้าวรึยัง
2. ใช้ศัพท์ตามอาชีพ: โปรแกรมเมอร์ = Debug, Error | แม่ค้า = F มาจ้า, ตำเลย
3. สอดแทรก Catchphrase อย่างเป็นธรรมชาติ (2-3 ครั้งต่อบทสนทนา)
4. Match Personality precisely (ปากจัด = พูดตรงๆ แรงๆ, ขี้อาย = พิมพ์สั้นๆ)
5. DIALECT RULES (ถ้าระบุ): อีสาน = เฮ็ดอีหยัง, บ่ | เหนือ = ยะหยัง, เจ้า | ใต้ = หนิ, มึง, กู
6. TYPING HABIT: Rapid Fire = แตกเป็นหลายข้อความ 1-2 ประโยคต่อ bubble | Long = รวมเป็นก้อนใหญ่`;
    }

    if (customPrompt && category !== 'tie_in') {
        promptText += `\n\nหัวข้อเรื่อง: ${customPrompt}`;
    }
    
    promptText += `\n\nให้สร้าง 8-12 ข้อความ ใช้ภาษาพูดธรรมชาติของคนไทย ห้ามใช้ emoji มีตัวสะกดผิดบ้างเล็กน้อย

ตัวอย่าง JSON ที่ต้องส่งกลับ:
{
  "title": "ชื่อเรื่อง",
  "characters": ${JSON.stringify(characterJSON, null, 2)},
  "dialogues": [
    {
      "sender": "${characters[0]}",
      "message": "ข้อความ",
      "delay": 1.0,
      "typing_speed": "normal",
      "camera_effect": "normal"
    }
  ]
}

typing_speed: slow (ช้า ดราม่า), normal (ปกติ), fast (เร็ว ตื่นเต้น)
camera_effect: normal, zoom_in (ซูมเข้า), shake (สั่น), zoom_shake (ซูม+สั่น), darken (มืด)

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
async function continueStory(prompt, existingDialogues = []) {
    // Format existing dialogues for context
    const history = existingDialogues.map(d => `${d.sender}: ${d.message}`).join('\n');
    
    const systemPrompt = `You are a screenwriter for a chat story.
    You will be given a history of a conversation and a prompt for what happens next.
    Generate the next 3-5 dialogues to continue the story.
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
