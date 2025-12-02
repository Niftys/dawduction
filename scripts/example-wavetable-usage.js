/**
 * Example: How to use wavetable synthesis with downloaded samples
 * 
 * This demonstrates the complete workflow:
 * 1. Download samples
 * 2. Convert to wavetables
 * 3. Use in synth
 * 
 * Run this after downloading samples:
 * node scripts/example-wavetable-usage.js
 */

const fs = require('fs');
const path = require('path');

// Example: Convert kick samples and show usage
const inputDir = '808-samples/kick';
const outputFile = 'src/lib/audio/synths/drums/wavetables/kickWavetables.js';

console.log('Example: Converting kick samples to wavetables\n');

// Check if samples exist
if (!fs.existsSync(inputDir)) {
    console.error(`❌ Sample directory not found: ${inputDir}`);
    console.error('   Run download-808-samples.ps1 first to download samples');
    process.exit(1);
}

// Check if conversion script exists
const convertScript = 'scripts/convert-wav-to-wavetable.js';
if (!fs.existsSync(convertScript)) {
    console.error(`❌ Conversion script not found: ${convertScript}`);
    process.exit(1);
}

console.log('To convert samples, run:');
console.log(`  node ${convertScript} ${inputDir} ${outputFile}\n`);

console.log('After conversion, you can use the wavetables like this:\n');
console.log(`
// In your synth initialization:
const synth = new SampleBasedKickSynth({
    wavetables: kickWavetables,  // Imported from wavetables file
    selectedSample: 0,            // Index or name
    attack: 0.001,
    decay: 0.3,
    sustain: 0.0,
    release: 0.1
}, sampleRate);

// Switch between samples:
synth.updateSettings({ selectedSample: 5 });  // By index
synth.updateSettings({ selectedSample: 'wa_808tape_kick_15_clean' });  // By name

// Trigger a note:
synth.trigger(0.8, 60);  // velocity, MIDI pitch

// Process samples:
const sample = synth.process();
`);

console.log('\nFor more details, see: docs/WAVETABLE_SYNTH_GUIDE.md');

