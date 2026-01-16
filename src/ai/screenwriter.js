/**
 * AI Screenwriter V2.0 - Thai Chat Simulator
 * Advanced role-play engine with hyper-realistic Thai linguistics
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

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Model priority list (from best to most quota-friendly)
const MODEL_PRIORITY = [
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite'
];

let currentModelIndex = 0;
let model = genAI.getGenerativeModel({ model: MODEL_PRIORITY[currentModelIndex] });

// ============================================
// Enhanced Categories (V2.0)
// ============================================
const CATEGORIES = {
    // Basic Moods
    auto: 'ธรรมชาติ ปล่อยไหล (Natural Flow)',
    funny: 'ตลก โบ๊ะบ๊ะ (Comedy/Sitcom)',
    drama: 'ดราม่า เคลียร์ใจ (Conflict/Drama)',
    horror: 'เรื่องหลอน The Ghost Radio (Horror/Mystery)',
    office: 'ชีวิตออฟฟิศ บอสดุ (Office Life)',
    love: 'จีบกัน หวานๆ (Romance/Flirting)',
    
    // New: Social Actions
    gossip: 'เม้าท์มอย นินทา (Gossiping/Tea Spilling)',
    consult: 'ปรึกษาปัญหาชีวิต (Life Advice/Consulting)',
    fight: 'ด่ากัน ทะเลาะรุนแรง (Argument/Confrontation)',
    debate: 'ถกประเด็นดราม่าสังคม (Social Debate/Trending)',
    tie_in: 'เนียนขายของ (Natural Tie-in)'
};

// ============================================
// Relationship Dynamics (V2.0)
// ============================================
const RELATIONSHIPS = {
    stranger: 'คนแปลกหน้า - Use polite, distant, formal pronouns (คุณ/ผม/ดิฉัน)',
    colleague: 'เพื่อนร่วมงาน - Semi-formal, office particles (ครับ/ค่ะ/พี่/น้อง)',
    friend: 'เพื่อนทั่วไป - Casual, mixture of polite and slang',
    close_friend: 'เพื่อนสนิท/The Gang - Rude/Slang allowed (กู/มึง), No filters',
    couple: 'แฟน/คู่รัก - Affectionate, Teasing, Pet names (ตัวเอง/ที่รัก/บ๊ะ)',
    enemy: 'คู่กัด/คนไม่ถูกกัน - Sarcastic, Passive-aggressive, Short replies'
};

// ============================================
// Master Prompt Builder (V2.0)
// ============================================
function buildPrompt(category, characters = ['me', 'boss'], customPrompt = null, characterData = [], relationship = 'friend', length = 35) {
    
    // Category -> Detailed Direction
    const categoryInstructions = {
        auto: 'Focus on natural flow. Let the topic dictate the tone.',
        funny: 'Situation: A chaotic disaster or embarrassing moment that gets worse every second. Tone: High energy, panic, hilarious overreaction. "Boobah" style.',
        drama: 'Situation: A shocking revelation, a breakup, or a massive betrayal. Start with a "Hook" message that creates immediate curiosity. Tone: Intense, emotional, pauses "...", heart-broken.',
        horror: 'Situation: Character is experiencing something scary RIGHT NOW (hearing noises, someone following). Tone: Panicked, typing errors due to fear, heavy suspense.',
        office: 'Situation: Office life drama, deadlines, annoying colleagues. Tone: Mix of formal and frustration.',
        love: 'Situation: Confessing feelings, intense jealousy, or heavy flirting. Tone: Shy, sweet, or possessively cute.',
        gossip: 'Situation: "Spilling Tea" about a major scandal everyone knows. Tone: Exciting, secretive, use words like "มึงรู้ยัง", "แก...", "พีคมาก".',
        consult: 'Situation: Character A has a severe dilemma (Love/Money/Life). Character B gives brutally honest advice.',
        fight: 'Situation: Boiling point argument. No holding back. Tone: Aggressive, sarcastic, using "!" and short angry bursts.',
        debate: 'Situation: Two sides with opposite strong opinions on a viral topic. Tone: Passionate, logical vs emotional.'
    };

    let instruction = categoryInstructions[category] || categoryInstructions['auto'];

    // Tie-In Logic
    if (category === 'tie_in') {
        const productInfo = customPrompt || 'สินค้า';
        instruction = `CONTEXT: Casual chat turning into a product mention.
PRODUCT: ${productInfo}
RULES:
1. Start with related problem (ง่วง/หิว/ผิวแห้ง)
2. Casual mention: "เพิ่งลอง...", "อันนี้โอเคนะ"
3. NO hard sell: ห้ามใช้ "โปรโมชั่น", "ซื้อเลย", "แนะนำ"
4. Friend reacts naturally: "จริงป่ะ", "ส่งลิงค์มา"`;
    }

    // Build character map
    const defaultCharacterMap = {
        'me': { name: 'ฉัน', avatar: 'assets/avatars/person1.png', side: 'right' },
        'boss': { name: 'เจ้านาย', avatar: 'assets/avatars/boss.png', side: 'left' }
    };
    
    // Build character names for prompt
    const characterNames = characters.map(charId => {
        const customChar = characterData.find(c => c.id === charId && c.is_custom);
        if (customChar) return customChar.display_name;
        return defaultCharacterMap[charId]?.name || charId;
    });
    
    const selectedCharsText = characterNames.join(', ');
    
    // Determine POV side
    const rightSideCharId = characters.includes('me') ? 'me' : characters[0];

    // Build character JSON
    const characterJSON = {};
    characters.forEach(charId => {
        const customChar = characterData.find(c => c.id === charId && c.is_custom);
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
            characterJSON[charId] = {
                ...defaultCharacterMap[charId],
                side: side
            };
        }
    });
    
    // ==========================================================================================
    // MASTER SYSTEM PROMPT V2.0
    // ==========================================================================================
    const systemInstruction = `### SYSTEM INSTRUCTION: THAI CHAT SIMULATOR V2.0 ###

You are an AI Screenwriter expert in "Thai Social Media Linguistics" (ภาษาแชทวัยรุ่น).
Your goal is to generate a chat log that looks **100% Authentic**, not like a robot translation.

**RELATIONSHIP CONTEXT:** ${RELATIONSHIPS[relationship] || RELATIONSHIPS['friend']}
*Adjust politeness level (Register) and pronouns (กู/มึง vs เรา/เธอ vs คุณ/ผม) based on this.*

---

**LINGUISTIC RULES (STRICT - ต้องทำตาม):**

1. **"Written Speech" (ภาษาพูดที่ใช้พิมพ์):**
   - NEVER use textbook Thai grammar. Write EXACTLY how it sounds.
   - ✅ YES: "ม่ายยย", "ช่ะ", "ป่าว", "อัลไล", "ก้อ", "เนี่ย", "ด้าย", "คร้าบบ", "ค่าา"
   - ❌ NO: "ไม่", "ใช่ไหม", "หรือเปล่า", "อะไร", "ก็", "นี้", "ได้", "ครับ" (เว้นแต่ Formal context)

2. **Emotional Spelling (ลากเสียง/กร่อนเสียง):**
   - Use vowel elongation for emphasis: "หิววววว", "ง่วงงงง", "พีคคค", "ตายยยย"
   - Tone mark manipulation: "งู้ยยย", "ย๊ากกก", "นอนนนน"

3. **Typos & Imperfection (Humanizer):**
   - Include intentional typos for speed: "พิมผิด", "โทดๆ", "แปป", "เดวๆ"
   - Drop subjects/objects (Zero Anaphora): "กินยัง" (not "คุณกินข้าวหรือยัง")

4. **Discourse Particles (คำลงท้าย - สำคัญมาก):**
   - MUST end sentences with natural particles: อะ, วะ, เว้ย, นะ, นิ, หนิ, จ้า, ย่ะ, เบย, อ่ะ, ง่ะ
   - Example: "งงอะดิ", "ได้ป่าววะ", "โอเคเลยจ้า", "ทำไมหนิ", "จะไปเหรอเนี่ย"

5. **Code-Mixing (Thainglish) - For GenZ/Office:**
   - Mix English words naturally when appropriate
   - Example: "มันไม่ make sense อะ", "fail ว่ะ", "check แล้วนะ", "serious ป่ะเนี่ย"

6. **Burstiness & Flow (ความเรียล):**
   - Some messages should be very short (1-2 words only)
   - Same sender can send 2-3 consecutive bubbles (Rapid Fire style)
   - Don't take perfect turns - it's not a debate

7. **NO GRAPHICAL EMOJI:**
   - Use text expressions: "55555", "555+", "ถถถ", "?!?!", "...", "TT", "ㅠㅠ"
   - NEVER use: 😂🤣😭💀 etc.

---

**TONE ADJUSTMENT by Register:**
- **stranger/colleague:** Use ครับ/ค่ะ, คุณ/ผม, พี่/น้อง  
- **friend:** Mix polite + casual, เรา/เธอ/นาย
- **close_friend:** Rude words OK (กู, มึง, สัส, เหี้ย, แดก), slang (ตึงๆ, ฉ่ำ, บิด)
- **couple:** Pet names (ตัวเอง, ที่รัก, บ๊ะ), flirty tone
- **enemy:** Sarcastic, cold, passive-aggressive

---`;

    let promptText = `${systemInstruction}

**SCENARIO:** ${instruction}

**CHARACTERS:** ${selectedCharsText}`;

    // Build Character Personality Descriptions
    const personalityDescriptions = characters.map(charId => {
        const customChar = characterData.find(c => c.id === charId && c.is_custom);
        
        if (customChar && (customChar.gender || customChar.personality || customChar.speaking_style || customChar.age_group || customChar.occupation || customChar.catchphrase || customChar.dialect || customChar.typing_habit)) {
            let desc = `- **${customChar.display_name}**`;
            
            const identifiers = [];
            if (customChar.age_group) identifiers.push(customChar.age_group);
            if (customChar.occupation) identifiers.push(customChar.occupation);
            if (identifiers.length > 0) desc += ` (${identifiers.join(', ')})`;
            
            desc += ':';
            if (customChar.gender) desc += ` ${customChar.gender}.`;
            if (customChar.personality) desc += ` Personality: ${customChar.personality}.`;
            if (customChar.speaking_style) desc += ` Style: ${customChar.speaking_style}.`;
            if (customChar.catchphrase) desc += ` Catchphrase: "${customChar.catchphrase}".`;
            if (customChar.dialect) desc += ` Dialect: ${customChar.dialect} (ใช้คำภูมิภาค).`;
            if (customChar.typing_habit) {
                if (customChar.typing_habit === 'rapid_fire') {
                    desc += ` Typing: Rapid Fire (แตกข้อความรัวๆ 1-2 ประโยค/bubble).`;
                } else if (customChar.typing_habit === 'long_paragraphs') {
                    desc += ` Typing: Long (2-4 sentences/bubble).`;
                }
            }
            return desc;
        }
        return null;
    }).filter(d => d !== null);
    
    if (personalityDescriptions.length > 0) {
        promptText += `

**CHARACTER PROFILES (เล่นบทตามนี้เป๊ะๆ):**
${personalityDescriptions.join('\n')}

**CHARACTER LANGUAGE RULES:**
1. ใช้ศัพท์ตามวัย: Gen Z = ฉ่ำ, ตึงๆ, นอยอ่า, ปัง, พัง | Boomer = จ๊ะ/จ้ะ, ทานข้าวรึยัง
2. ใช้ศัพท์ตามอาชีพ: Programmer = Debug, Error, Deploy | แม่ค้า = F มาจ้า, ตำเลย
3. Catchphrase สอดแทรก 2-3 ครั้ง (ไม่ใช่ทุกข้อความ)
4. Dialect: อีสาน = เฮ็ดอีหยัง, บ่, ตมจ | เหนือ = ยะหยัง, เจ้า, ก๊ะ | ใต้ = หนิ, ไอ้บ้า`;
    }

    if (customPrompt && category !== 'tie_in') {
        promptText += `

**TOPIC/SITUATION:** ${customPrompt}`;
    }
    
    promptText += `
    
---

**sticker/GIF INSTRUCTIONS (REALISM MODE):**
- **RULE 1: SERIOUS MODES (NO GIFS)**
  - 👻 **HORROR / THRILLER / DRAMA / FIGHT:** - ❌ **STRICT RULE:** **NO STICKERS / NO GIFS ALLOWED.**
    - **REASON:** In high-stress situations (fear/anger/crying), people do NOT browse for stickers. They type text or send photos (which AI cannot generate).
    - ✅ **ACTION:** Leave "sticker_keyword" BLANK or NULL.
    - **ALTERNATIVE:** Use text actions like "[ส่งรูปถ่าย]", "[ส่งคลิปเสียง]", "[มือสั่นพิมพ์ผิดๆถูกๆ]".

- **RULE 2: CASUAL MODES (GIFS OK) - BE CREATIVE WITH KEYWORDS!**
  - 😂 **FUNNY / GOSSIP / FRIEND / LOVE / OFFICE:**
  - **KEYWORD VARIETY BY EMOTION (CHOOSE WISELY):**
    - 😱 **Shock/Surprise:** "shocked pikachu", "jaw drop", "fainting", "eyes wide", "spit take", "double take"
    - 🤣 **Laughter:** "dying of laughter", "rolling on floor", "wheezing", "can't breathe laughing", "ugly crying laugh"
    - 💅 **Sassy/Attitude:** "hair flip", "eye roll", "side eye", "smug face", "sipping tea", "unbothered"
    - 😍 **Love/Cute:** "heart eyes", "blushing anime", "squealing", "uwu", "crush mode", "lovesick"
    - 😬 **Cringe/Facepalm:** "cringe face", "facepalm", "yikes", "nervous sweat", "awkward smile"
    - 🤔 **Disbelief:** "sus face", "really meme", "confused math", "wait what", "excuse me"
  - **QUANTITY RULE (CRITICAL):**
    - **Range:** 0-3 stickers max per story.
    - **0 is OK:** If the text humor is strong/dry/sarcastic, DO NOT force a sticker.
    - **Timing:** Use stickers ONLY for a "Punchline" or a "Big Reaction". Do not use them as filler.

- **JSON OUTPUT:**
  - Add "sticker_keyword" field ONLY for FUNNY/GOSSIP/LOVE modes.
  - **ALWAYS OMIT** "sticker_keyword" field for HORROR/DRAMA/FIGHT.`;

    const targetLength = length || 35;
    let pacingInstruction = '';

    // สร้าง Logic การเดินเรื่องตาม Category (Adaptive Narrative Arc)
    if (['drama', 'fight', 'gossip', 'tie_in'].includes(category)) {
        // สูตร 1: "Fast Paced" (เปิดมาใส่ยับ) - เหมาะกับ TikTok ที่สุด
        // ตัด Intro ทิ้ง เริ่ม Conflict ทันที
        pacingInstruction = `
**STORY ARC (FAST PACED - IN MEDIA RES):**
1. **Messages 1-2 (HOOK):** SKIP greeting. Start immediately with the problem/shocking statement. (e.g., "มึง... กูเห็นแฟนแกเดินกับคนอื่น", "ทำไมทำแบบนี้วะ")
2. **Messages 3-${Math.floor(targetLength * 0.7)} (CONFLICT/ACTION):** High tension, arguing, providing evidence (pic/text), emotions exploding.
3. **Messages ${Math.floor(targetLength * 0.7) + 1}-${targetLength} (CLIMAX & TWIST):** The final reveal or ending punchline.`;
    } 
    else if (category === 'horror') {
        // สูตร 2: "Suspense Builder" (ค่อยๆ หลอน)
        pacingInstruction = `
**STORY ARC (SUSPENSE):**
1. **Messages 1-5 (ATMOSPHERE):** Something feels off. Character hears/sees something strange.
2. **Messages 6-${Math.floor(targetLength * 0.8)} (RISING TERROR):** The threat gets closer. Panic increases. Denial -> Realization.
3. **Messages ${Math.floor(targetLength * 0.8) + 1}-${targetLength} (JUMPSCARE/CLIFFHANGER):** The ghost appears or communication cuts off abruptly.`;
    } 
    else if (['auto', 'funny', 'office', 'consult', 'love', 'debate'].includes(category)) {
        pacingInstruction = `
**STORY ARC (BALANCED & CINEMATIC ENDING):**
1. **Messages 1-3 (SETUP):** Quick context. What are we talking about?
2. **Messages 4-${Math.floor(targetLength * 0.7)} (ENGAGEMENT):** Discussing the topic with emotions/jokes.
3. **Messages ${Math.floor(targetLength * 0.7) + 1}-${targetLength} (CONCLUSION):**
   - **RULE:** Do NOT end with a boring "Bye/Ok/See ya".
   - **OPTION A (Funny/End of Scene):** End with a descriptive ACTION or SOUND in brackets [ ].
     - Example: "[ถอนหายใจเฮือกใหญ่]", "[เสียงลากของหนักๆ]", "[มองบน]", "[ยืนนิ่งไป 3 วิ]"
   - **OPTION B (Cliffhanger/Part 2):** End with a sudden suspense event.
     - Example: "[เสียงเคาะประตู]", "เฮ้ย... มึงเห็นข้างหลังป่ะ", "[สายตัดไปทันที]"
   - **GOAL:** Make the reader want to comment or watch the next part.`;
    }

    promptText += `

${pacingInstruction}

**OUTPUT REQUIREMENTS:**
- Generate ${length || 35} messages
- Use "Written Speech" Thai (NOT formal Thai)
- NO EMOJI - Use 555, TT, ... instead
- Keep messages SHORT (1-2 sentences max)
- **MAX 80 characters per message** (2-3 lines on mobile) - If longer, split into 2 bubbles
- Same sender can appear consecutively (Burstiness)

**TITLE GENERATION RULES (The "Viral Tabloid" Formula):**
To get a 10/10 Viral Score, do NOT describe the "Topic". Describe the "CONFLICT" or "EVIDENCE".
**CORE RULE:** Use **Specific Nouns** (Object/Place/Person).

**STRICT FORMATTING RULES (CRITICAL):**
1. **NO FILLER WORDS:** Remove ALL connecting words: "ที่", "ซึ่ง", "อัน", "ความ", "การ", "ของ", "จาก", "โดย", "ใน" (unless necessary for meaning).
   - ❌ "น้ำแดงจากห้องข้างบน" -> ✅ "น้ำแดงห้องบน" (Red Water Upstairs)
   - ❌ "เสียงที่มาจากระเบียง" -> ✅ "เสียงปริศนาระเบียง" (Balcony Mystery Sound)
2. **LENGTH:** MAX 15 Characters. (Make it look like a breaking news headline).

**CATEGORY STRATEGIES (MUST FOLLOW):**

👻 **1. HORROR (The "Unseen Presence" Rule)**
- ❌ Boring: "เรื่องหลอนในห้อง", "เสียงปริศนา", "ผีบังตา" (Too vague)
- ✅ Viral: "เงาในกระจก", "ใครอยู่ใต้เตียง", "รูมเมทที่ไม่มีจริง", "ศพในตู้"
- **Focus:** Specific Location (Bed, Mirror, Closet) or Specific Action (Knocking, Breathing).

💔 **2. DRAMA / LOVE (The "Smoking Gun" Rule)**
- ❌ Boring: "ความลับในสตอรี่", "แฟนนอกใจ", "จับกิ๊กได้" (Generic)
- ✅ Viral: "สตอรี่ที่ลืมซ่อน", "ใบเสร็จโรงแรม", "เสื้อตัวที่ไม่คุ้น", "แชทที่ลืมลบ"
- **Focus:** The **EVIDENCE** that exposed the lie (Receipt, Chat, Photo, Shirt).

🤬 **3. FIGHT / GOSSIP (The "Expose" Rule)**
- ❌ Boring: "นินทาเพื่อน", "คนขี้โกง", "เรื่องที่ทำงาน"
- ✅ Viral: "สลิปปลอม", "คลิปเสียงหลุด", "แฉวีรกรรม", "เงินกู้ที่หายไป"
- **Focus:** The object causing the fight.

🏢 **4. OFFICE (The "Disaster" Rule)**
- ❌ Boring: "โดนเจ้านายด่า", "งานเข้า", "ปัญหางาน"
- ✅ Viral: "ไมค์ลืมปิด", "ไฟล์ลับหลุด", "อีเมลผิดชีวิตเปลี่ยน"
- **Focus:** The specific mistake (Error).

😂 **5. FUNNY (The "Chaos" Rule)**
- ❌ Boring: "เรื่องตลก", "ขำไม่ไหว"
- ❌ Spoiler: "โอ่งมังกร", "ตุ๊กตายาง" (Do NOT name the specific object if it is the surprise punchline!)
- ✅ Viral: "ของที่มาส่ง", "นิติโทรมาด่า", "สภาพหน้าลิฟต์", "พัสดุปริศนา"
- **Focus:** The **CONSEQUENCE** (ผลกระทบ) or **MYSTERY** (ความสงสัย), NOT the object itself.

**FORMATTING:**
- **Language:** Thai (Punchy, Tabloid Style)
- **Length:** MAX 12-15 Characters (EXTREMELY SHORT)
- **NO:** Filler words (ที่, ซึ่ง, อัน, ความ, การ). Use Compound Nouns.

**CRITICAL INSTRUCTION FOR SPECIFIC NOUNS:**

// กฎที่ 1: กฎเหล็กสำหรับทุกหมวด (ยกเว้น Funny) -> ต้องใช้วัตถุเป๊ะๆ
1. **GENERAL RULE (Horror/Drama/Gossip/Love):** - IF the user provides a specific item/evidence (e.g., "Gold", "Blood", "Receipt"), **YOU MUST USE THAT EXACT SPECIFIC NOUN** in the title.
   - **DO NOT** use vague words like "Mystery", "Secret", "Something".
   - ❌ Input: "Red Ball" -> Title: "Mystery Object" (WRONG!)
   - ✅ Input: "Red Ball" -> Title: "ลูกบอลสีแดง" (CORRECT)

// กฎที่ 2: ข้อยกเว้นสำหรับหมวด Funny เท่านั้น -> ให้ซ่อนเพื่อไม่สปอยล์
2. **EXCEPTION FOR 'FUNNY' MODE ONLY:** - IF the specific item is the **PUNCHLINE** of the joke (e.g., Giant Jar, Ugly Doll), **DO NOT** put it in the title. **HIDE IT** to create curiosity.
   - ❌ Input: "Giant Dragon Jar" -> Title: "โอ่งมังกร" (WRONG! Spoils the joke)
   - ✅ Input: "Giant Dragon Jar" -> Title: "ของที่มาส่ง" or "นิติโทรตาม" (CORRECT! Keeps the surprise)

// กฎที่ 3: ห้ามมโน (สำหรับทุกหมวด)
3. **NO HALLUCINATION:** Do not invent objects that are not in the prompt.


**JSON FORMAT:**
{
  "title": "ชื่อเรื่องแบบ Curiosity Gap (ห้ามใช้ชื่อคนเปล่าๆ)",
  "characters": ${JSON.stringify(characterJSON, null, 2)},
  "dialogues": [
    {
      "sender": "${characters[0]}",
      "message": "ข้อความ",
      "sticker_keyword": "shocked cat",
      "delay": 1.0,
      "typing_speed": "normal"
    }
  ]
}

typing_speed: slow (ดราม่า หนักๆ), normal (ปกติ), fast (ตื่นเต้น รีบๆ)

ตอบ JSON เท่านั้น ไม่ต้องอธิบายเพิ่ม`;

    return promptText;
}

// ============================================
// Generate Story (with Auto-Retry and Fallback)
// ============================================
async function generateStory(options = {}) {
    let category, characters, customPrompt, characterData, relationship, length;
    
    if (typeof options === 'string') {
        category = options;
        characters = ['me', 'boss'];
        customPrompt = null;
        characterData = [];
        relationship = 'friend';
        length = 35;
    } else {
        category = options.category || 'funny';
        characters = options.characters || ['me', 'boss'];
        customPrompt = options.customPrompt || null;
        characterData = options.characterData || [];
        relationship = options.relationship || 'friend';
        length = options.length || 35;
    }

    const prompt = buildPrompt(category, characters, customPrompt, characterData, relationship, length);
    
    for (let modelIndex = 0; modelIndex < MODEL_PRIORITY.length; modelIndex++) {
        const currentModel = MODEL_PRIORITY[modelIndex];
        
        try {
            console.log(`🤖 Trying model: ${currentModel}...`);
            
            const modelInstance = genAI.getGenerativeModel({ model: currentModel });
            const result = await modelInstance.generateContent(prompt);
            const response = result.response;
            let text = response.text();
            
            text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const story = JSON.parse(text);
            
            if (!story.title || !story.characters || !story.dialogues) {
                throw new Error('Invalid story structure');
            }
            
            console.log(`✅ Story generated successfully with ${currentModel}`);
            
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

// ============================================
// Continue Story (V2.0 Enhanced)
// ============================================
async function continueStory(prompt, existingDialogues = [], availableCharacters = [], length = 'medium', mode = 'normal', relationship = 'friend') {
    const history = existingDialogues.map(d => `${d.sender}: ${d.message}`).join('\n');
    const characterList = availableCharacters.length > 0 ? availableCharacters.join(', ') : 'ฉัน, เจ้านาย';

    // Length Instruction
    let lengthInstruction = 'Generate 10-20 dialogues.';
    if (length === 'short') lengthInstruction = 'Generate 5-10 dialogues. Keep it brief.';
    if (length === 'long') lengthInstruction = 'Generate at least 20 dialogues. Detailed conversation.';

    // Mode Instruction
    let modeInstruction = 'Continue the flow naturally.';
    if (mode === 'wrap_up') modeInstruction = 'IMPORTANT: Wrap up this scene. Steer towards conclusion/cliffhanger. Do NOT leave open-ended.';

    const systemPrompt = `### THAI CHAT CONTINUATION ENGINE V2.0 ###

You are continuing a Thai chat conversation. ${lengthInstruction} ${modeInstruction}

**RELATIONSHIP:** ${RELATIONSHIPS[relationship] || RELATIONSHIPS['friend']}

**LINGUISTIC RULES (MUST FOLLOW):**

1. **Written Speech:** Use phonetic Thai, NOT textbook Thai
   - ✅ "ม่าย", "ช่ะ", "ป่าววะ", "อัลไล", "ก้อ", "โอเคเลยจ้า"
   - ❌ "ไม่", "ใช่ไหม", "อะไร", "ก็", "โอเค"

2. **Particles:** End with อะ, วะ, นะ, จ้า, เว้ย, หนิ, เบย, ง่ะ, อะดิ

3. **Burstiness:** Same sender can send 2-3 consecutive short messages

4. **NO EMOJI** - Use 555, TT, ... instead

5. **Thai Names Only:** When mentioning names, use THAI spelling
   - ✅ "เจ", "พีพี", "บิ๊กมิ้ง"  
   - ❌ "Jay", "PP", "Bigming"

**sticker/GIF INSTRUCTIONS (REALISM UPDATE):**
- **STRICT MOOD CHECK:**
  - IF mood is **SCARY / SAD / ANGRY** -> **DO NOT GENERATE STICKERS.** (Output text only).
  - IF mood is **FUNNY / HAPPY / GOSSIP** -> Stickers are allowed (reaction memes).
- **BANNED ALWAYS:** "wolf", "howling", "monkey puppet", "generic cartoon".
- **OUTPUT:** Add "sticker_keyword" only if permitted. Otherwise, leave it out.

**CHARACTERS IN SCENE:** [${characterList}]
Use ONLY these names as senders. Match exactly.

**OUTPUT:** JSON array ONLY
[
    {
      "sender": "ชื่อไทย", 
      "message": "ข้อความ",
      "sticker_keyword": "shocked cat"
    },
    {
      "sender": "ชื่อไทย", 
      "message": "ข้อความ"
    }
]
`;

    const userMessage = `Context (History):
${history}

Instruction:
${prompt || 'Continue the conversation naturally.'}

Generate JSON:`;

    let lastError = null;

    for (const modelName of MODEL_PRIORITY) {
        console.log(`🤖 Continue trying model: ${modelName}...`);
        
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: modelName });
            
            const result = await model.generateContent([systemPrompt, userMessage]);
            const response = await result.response;
            const text = response.text();
            
            // Robust JSON extraction (finds the first '[' and the last ']')
            const jsonStartIndex = text.indexOf('[');
            const jsonEndIndex = text.lastIndexOf(']');
            
            if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
                const jsonString = text.substring(jsonStartIndex, jsonEndIndex + 1);
                console.log(`✅ Continuation generated with ${modelName}`);
                return JSON.parse(jsonString);
            } else {
                throw new Error('No JSON found in AI response');
            }
        } catch (error) {
            console.warn(`⚠️ ${modelName} failed: ${error.message}`);
            lastError = error;
            // Linear backoff: 2 seconds
            await new Promise(resolve => setTimeout(resolve, 2000));
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
    CATEGORIES,
    RELATIONSHIPS
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
