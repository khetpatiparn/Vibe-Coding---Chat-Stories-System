require('dotenv').config();

async function checkModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API Key found");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    console.log("Fetching models list from API...");
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        if (data.models) {
            console.log("✅ Available Models:");
            const supported = data.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));
                
            supported.forEach(name => console.log(` - ${name}`));
            
            if (supported.length === 0) {
                console.log("⚠️ No models support 'generateContent'. Check API Key permissions.");
            }
        } else {
            console.log("❌ No models found in response.");
        }
    } catch (e) {
        console.error("Request Failed:", e.message);
    }
}

checkModels();
