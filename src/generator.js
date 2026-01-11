/**
 * Chat Story Generator - Main Entry Point
 * Orchestrates the full pipeline: AI Script -> Visualizer -> Video
 */

const { generateStory, CATEGORIES } = require('./ai/screenwriter');
const { recordStory } = require('./recorder/capture');
const fs = require('fs-extra');
const path = require('path');

// ============================================
// Configuration
// ============================================
const OUTPUT_DIR = './output';
const ASSETS_DIR = './assets';

// ============================================
// Main Pipeline
// ============================================
async function generateVideo(options = {}) {
    const {
        category = 'funny',
        affiliateProduct = null,
        bgMusic = null,
        outputName = null
    } = options;

    console.log('='.repeat(50));
    console.log('🎬 Chat Story Generator');
    console.log('='.repeat(50));

    try {
        // Step 1: Generate Story with AI
        console.log('\n📝 Step 1: Generating story with AI...');
        const story = await generateStory(category, affiliateProduct);
        console.log(`✅ Story created: "${story.title}"`);
        console.log(`   Characters: ${Object.keys(story.characters).join(', ')}`);
        console.log(`   Dialogues: ${story.dialogues.length} messages`);

        // Save story JSON for reference
        const storyFileName = outputName || `story_${Date.now()}`;
        const storyPath = path.join(OUTPUT_DIR, `${storyFileName}.json`);
        await fs.ensureDir(OUTPUT_DIR);
        await fs.writeJson(storyPath, story, { spaces: 2 });
        console.log(`   Saved to: ${storyPath}`);

        // Step 2: Record Video
        console.log('\n🎥 Step 2: Recording video...');
        const bgMusicPath = bgMusic ? path.join(ASSETS_DIR, 'sounds', bgMusic) : null;
        
        const videoPath = await recordStory(story, {
            outputName: storyFileName,
            bgMusicPath
        });

        console.log('\n' + '='.repeat(50));
        console.log('✅ Video generation complete!');
        console.log(`📁 Output: ${videoPath}`);
        console.log('='.repeat(50));

        return { story, videoPath };

    } catch (error) {
        console.error('\n❌ Pipeline failed:', error.message);
        throw error;
    }
}

// ============================================
// Generate from Existing JSON
// ============================================
async function generateFromJson(jsonPath, options = {}) {
    console.log('='.repeat(50));
    console.log('🎬 Chat Story Generator (from JSON)');
    console.log('='.repeat(50));

    try {
        const story = await fs.readJson(jsonPath);
        console.log(`✅ Loaded story: "${story.title}"`);

        const storyFileName = options.outputName || path.basename(jsonPath, '.json');
        const bgMusicPath = options.bgMusic ? path.join(ASSETS_DIR, 'sounds', options.bgMusic) : null;

        const videoPath = await recordStory(story, {
            outputName: storyFileName,
            bgMusicPath
        });

        console.log('\n' + '='.repeat(50));
        console.log('✅ Video generation complete!');
        console.log(`📁 Output: ${videoPath}`);
        console.log('='.repeat(50));

        return { story, videoPath };

    } catch (error) {
        console.error('\n❌ Pipeline failed:', error.message);
        throw error;
    }
}

// ============================================
// Batch Generation
// ============================================
async function generateBatch(count = 5, category = 'funny') {
    console.log(`\n🔄 Generating ${count} videos...`);
    
    const results = [];
    for (let i = 0; i < count; i++) {
        console.log(`\n--- Video ${i + 1}/${count} ---`);
        try {
            const result = await generateVideo({
                category,
                outputName: `batch_${category}_${i + 1}`
            });
            results.push(result);
        } catch (error) {
            console.error(`Failed video ${i + 1}:`, error.message);
        }
    }
    
    console.log(`\n✅ Batch complete: ${results.length}/${count} videos generated`);
    return results;
}

// ============================================
// Exports
// ============================================
module.exports = {
    generateVideo,
    generateFromJson,
    generateBatch,
    CATEGORIES
};

// ============================================
// CLI Interface
// ============================================
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0] || 'generate';
    
    const printHelp = () => {
        console.log(`
Chat Story Generator - CLI

Usage:
  node generator.js generate [category]   Generate a single video
  node generator.js batch [count] [cat]   Generate multiple videos
  node generator.js from-json <path>      Generate from existing JSON

Categories: ${Object.keys(CATEGORIES).join(', ')}

Examples:
  node generator.js generate funny
  node generator.js batch 5 office
  node generator.js from-json ./output/story.json

Environment:
  GEMINI_API_KEY   Your Google Gemini API key
        `);
    };

    switch (command) {
        case 'generate':
            const category = args[1] || 'funny';
            generateVideo({ category })
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
            break;

        case 'batch':
            const count = parseInt(args[1]) || 5;
            const batchCategory = args[2] || 'funny';
            generateBatch(count, batchCategory)
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
            break;

        case 'from-json':
            const jsonPath = args[1];
            if (!jsonPath) {
                console.error('Please provide JSON path');
                process.exit(1);
            }
            generateFromJson(jsonPath)
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
            break;

        case 'help':
        case '--help':
        case '-h':
        default:
            printHelp();
    }
}
