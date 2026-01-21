/**
 * TikTok Description Generator v2.0
 * "Anti-AI Radar" Style - Low-Effort Aesthetic
 * 
 * กฎเหล็ก:
 * - ห้าม Emoji
 * - 3-7 คำเท่านั้น
 * - ห้ามประโยคสมบูรณ์
 * - ใช้สแลงไทยจริง
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY not found in .env file');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// New "Human-Like" Strategies
const STRATEGIES = {
    fragment: {
        name: 'The Fragment',
        description: 'ทิ้งปมสั้นๆ ประโยคกึ่งกลางที่ทำให้คนงง',
        examples: ['อยากลาออกแล้วเนี่ย', 'รับผิดชอบด้วย', 'ไม่ใช่ความผิดเรานะ']
    },
    sarcastic: {
        name: 'The Sarcastic',
        description: 'ถามห้วนๆ ไม่ต้องการคำตอบ ท้าทายแบบกวนๆ',
        examples: ['ดูจบแล้วบอกที ชื่อบนแก้วเขียนว่าไร', 'นี่มันผิดตรงไหนวะ', 'เป็นเราจะทำไง']
    },
    blame: {
        name: 'The Blame',
        description: 'โยนความผิดไปที่ตัวละคร พุ่งเป้า',
        examples: ['ตะโกนซะลั่นออฟฟิศ', 'แกงน้องเฉย', 'เล่นตัวเก่งจริง']
    },
    reaction: {
        name: 'The Reaction',
        description: 'อุทานสแลงจริง เหมือนคนดูแล้วต้องพิมพ์',
        examples: ['สภาพพพพ', 'ขิตของจริง', 'นอยอ่าาา', 'เมพขิงๆ']
    },
    opinion: {
        name: 'The Opinion Split',
        description: 'ตั้งคำถามปลายเปิด ให้คน debate',
        examples: ['เป็นคนดูจะทำไง', 'ใครผิดกันแน่', 'มีแต่เราที่เห็นด้วยรึป่าว']
    }
};

// Blacklist - ห้ามใช้คำเหล่านี้
const BLACKLIST_PHRASES = [
    'ห้ามพลาด', 'ดูให้จบ', 'ไม่คาดคิด', 'เฉลย', 'ความลับ', 'พล็อตทวิสต์',
    'รอดู', 'ต้องดู', 'สุดยอด', 'เซอร์ไพรส์', 'ตื่นเต้น', 'น่าสนใจ',
    'ครับ', 'ค่ะ', 'นะคะ', 'จ้า'
];

/**
 * Generate 5 TikTok descriptions using "Anti-AI Radar" style
 */
async function generateDescriptions(dialogues, characters, roomName, theme) {
    try {
        // Analyze story content
        const storyAnalysis = analyzeStory(dialogues, characters);
        
        console.log('📱 Generating TikTok descriptions (Anti-AI Mode)...');
        console.log('Story analysis:', storyAnalysis);
        
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 1.2, // Higher for unpredictability
                topK: 40,
                topP: 0.95,
            }
        });

        const prompt = `คุณคือคนขี้เกียจพิมพ์ที่เพิ่งดูคลิปจบ แล้วต้องเขียน caption ทิ้งไว้สั้นๆ

⛔ กฎเหล็ก ANTI-AI RADAR (ห้ามฝ่าฝืน):
1. ห้ามใช้ Emoji เด็ดขาด
2. ความยาว 3-7 คำเท่านั้น (นับจริงๆ ห้ามเกิน)
3. ห้ามเขียนประโยคสมบูรณ์ - ใช้ "วลี" หรือ "คำอุทาน" เท่านั้น
4. ห้ามใช้คำต้องห้าม: ${BLACKLIST_PHRASES.join(', ')}
5. ห้ามลงท้าย ครับ/ค่ะ/จ้า
6. ใช้สแลงจริงๆ เช่น สภาพ, ขิต, นอย, เมพ, ขิง

📖 เนื้อเรื่อง:
- หัวข้อ: ${roomName || 'เรื่องในออฟฟิศ'}
- ตัวละคร: ${storyAnalysis.characterNames.join(', ') || 'ไม่ระบุ'}
- อารมณ์: ${storyAnalysis.mood}
- เหตุการณ์สำคัญ: ${storyAnalysis.keyEvents.join(', ') || 'สนทนาทั่วไป'}

🎯 สร้าง 5 captions ตามกลยุทธ์นี้:

1. **Fragment (ทิ้งปมสั้นๆ)**: ประโยคกึ่งกลางที่ทิ้งให้คนงง
   ตัวอย่าง: "${STRATEGIES.fragment.examples.join('", "')}"

2. **Sarcastic (ถามห้วนๆ)**: ถามแบบไม่ต้องการคำตอบ กวนๆ
   ตัวอย่าง: "${STRATEGIES.sarcastic.examples.join('", "')}"

3. **Blame (โยนความผิด)**: พุ่งเป้าไปที่ตัวละคร
   ตัวอย่าง: "${STRATEGIES.blame.examples.join('", "')}"

4. **Reaction (อุทาน)**: สแลงจริงในแชท เหมือนคนดูแล้วต้องพิมพ์
   ตัวอย่าง: "${STRATEGIES.reaction.examples.join('", "')}"

5. **Opinion Split (ตั้งคำถามปลายเปิด)**: ให้คน debate กัน
   ตัวอย่าง: "${STRATEGIES.opinion.examples.join('", "')}"

📝 OUTPUT FORMAT (JSON only, no markdown):
{
  "descriptions": [
    {"strategy": "fragment", "text": "caption 3-7 คำ", "vibe": "อธิบายสั้นๆ"},
    {"strategy": "sarcastic", "text": "caption 3-7 คำ", "vibe": "อธิบายสั้นๆ"},
    {"strategy": "blame", "text": "caption 3-7 คำ", "vibe": "อธิบายสั้นๆ"},
    {"strategy": "reaction", "text": "caption 3-7 คำ", "vibe": "อธิบายสั้นๆ"},
    {"strategy": "opinion", "text": "caption 3-7 คำ", "vibe": "อธิบายสั้นๆ"}
  ]
}

สำคัญมาก: text ต้องมี 3-7 คำเท่านั้น ห้ามเกิน ห้ามใส่ emoji`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();
        
        // Parse JSON from response
        let jsonText = response;
        jsonText = jsonText.replace(/```json\n?/gi, '').replace(/```\n?/g, '');
        
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('AI Response:', response);
            throw new Error('Failed to parse AI response');
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate and clean descriptions
        if (parsed.descriptions && Array.isArray(parsed.descriptions)) {
            parsed.descriptions = parsed.descriptions.map((desc, idx) => {
                // Remove any emojis that slipped through
                let cleanText = desc.text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
                
                // Check word count
                const wordCount = cleanText.split(/\s+/).length;
                
                return {
                    ...desc,
                    id: idx + 1,
                    text: cleanText,
                    wordCount: wordCount,
                    strategyName: STRATEGIES[desc.strategy]?.name || desc.strategy,
                    reason: STRATEGIES[desc.strategy]?.description || desc.vibe
                };
            });
        }
        
        return {
            success: true,
            descriptions: parsed.descriptions || [],
            analysis: storyAnalysis
        };
        
    } catch (err) {
        console.error('Description generation error:', err);
        
        return {
            success: false,
            error: err.message,
            descriptions: getFallbackDescriptions(dialogues, characters)
        };
    }
}

/**
 * Analyze story for content - Enhanced version
 */
function analyzeStory(dialogues, characters) {
    const textCount = dialogues.filter(d => d.message && d.message.trim()).length;
    const imageCount = dialogues.filter(d => d.image_path).length;
    
    // Get all dialogue text
    const allText = dialogues
        .filter(d => d.message)
        .map(d => d.message)
        .join(' ');
    
    // Mood detection
    let mood = 'ทั่วไป';
    if (allText.match(/ผี|หลอน|กลัว|สยอง/)) mood = 'สยองขวัญ';
    else if (allText.match(/โกรธ|ด่า|หงุดหงิด|บ้า/)) mood = 'หัวร้อน';
    else if (allText.match(/รัก|หวาน|ชอบ|คิดถึง/)) mood = 'หวาน';
    else if (allText.match(/ฮา|ตลก|555|ขำ/)) mood = 'ตลก';
    else if (allText.match(/เศร้า|ร้องไห้|เสียใจ/)) mood = 'ดราม่า';
    else if (allText.match(/งง|แปลก|ไม่เข้าใจ/)) mood = 'งงๆ';
    
    // Get character names
    const charNames = Object.values(characters).map(c => c.name);
    
    // Extract key events (simplified - look for questions or exclamations)
    const keyEvents = [];
    dialogues.forEach(d => {
        if (d.message) {
            if (d.message.includes('?') || d.message.includes('!')) {
                const snippet = d.message.substring(0, 30);
                if (snippet.length > 5) keyEvents.push(snippet);
            }
        }
    });
    
    return {
        summary: `${textCount} ข้อความ, ${Object.keys(characters).length} คน`,
        mood: mood,
        characterNames: charNames.slice(0, 3),
        keywords: charNames.slice(0, 3),
        keyEvents: keyEvents.slice(0, 3),
        hasImages: imageCount > 0
    };
}

/**
 * Fallback templates - Anti-AI style
 */
function getFallbackDescriptions(dialogues, characters) {
    return [
        {
            id: 1,
            strategy: 'fragment',
            strategyName: 'The Fragment',
            text: 'อยากลาออกแล้วเนี่ย',
            wordCount: 3,
            reason: 'ทิ้งปมสั้นๆ ประโยคกึ่งกลางที่ทำให้คนงง'
        },
        {
            id: 2,
            strategy: 'sarcastic',
            strategyName: 'The Sarcastic',
            text: 'นี่มันผิดตรงไหนวะ',
            wordCount: 4,
            reason: 'ถามห้วนๆ ไม่ต้องการคำตอบ'
        },
        {
            id: 3,
            strategy: 'blame',
            strategyName: 'The Blame',
            text: 'เล่นตัวเก่งจริง',
            wordCount: 3,
            reason: 'โยนความผิดไปที่ตัวละคร'
        },
        {
            id: 4,
            strategy: 'reaction',
            strategyName: 'The Reaction',
            text: 'สภาพพพพ',
            wordCount: 1,
            reason: 'อุทานสแลงจริง'
        },
        {
            id: 5,
            strategy: 'opinion',
            strategyName: 'The Opinion Split',
            text: 'เป็นคนดูจะทำไง',
            wordCount: 4,
            reason: 'ตั้งคำถามปลายเปิด ให้คน debate'
        }
    ];
}

module.exports = {
    generateDescriptions
};
