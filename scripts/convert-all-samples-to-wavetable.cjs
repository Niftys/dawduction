/**
 * Script to convert all 14 basic drum samples to a single wavetable file
 * Usage: node scripts/convert-all-samples-to-wavetable.js <input-dir> <output-file>
 * 
 * This reads all WAV files from a directory and converts them into
 * a single JavaScript wavetable module organized by drum type
 */

const fs = require('fs');
const path = require('path');

// Import the conversion functions from the main script
// For simplicity, we'll include the parsing logic here

function parseWAV(buffer) {
    const view = new DataView(buffer);
    
    // Check RIFF header
    const riff = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
    if (riff !== 'RIFF') {
        throw new Error('Not a valid WAV file');
    }
    
    // Check WAVE header
    const wave = String.fromCharCode(...new Uint8Array(buffer.slice(8, 12)));
    if (wave !== 'WAVE') {
        throw new Error('Not a WAVE file');
    }
    
    // Find fmt and data chunks
    let offset = 12;
    let sampleRate = 44100;
    let channels = 1;
    let bitsPerSample = 16;
    let dataOffset = 0;
    let dataSize = 0;
    
    const uint8View = new Uint8Array(buffer);
    
    while (offset < buffer.byteLength - 8) {
        if (offset + 8 > buffer.byteLength) break;
        
        const chunkId = String.fromCharCode(
            uint8View[offset],
            uint8View[offset + 1],
            uint8View[offset + 2],
            uint8View[offset + 3]
        );
        const chunkSize = view.getUint32(offset + 4, true);
        
        if (chunkId === 'fmt ') {
            if (offset + 8 + chunkSize > buffer.byteLength) break;
            const format = view.getUint16(offset + 8, true);
            channels = view.getUint16(offset + 10, true);
            sampleRate = view.getUint32(offset + 12, true);
            bitsPerSample = view.getUint16(offset + 22, true);
        } else if (chunkId === 'data') {
            dataOffset = offset + 8;
            dataSize = chunkSize;
            break;
        }
        
        // Move to next chunk (chunk size may be odd, so round up)
        offset += 8 + chunkSize;
        if (chunkSize % 2 === 1) offset += 1; // Align to even boundary
    }
    
    if (dataOffset === 0 || dataOffset + dataSize > buffer.byteLength) {
        throw new Error(`No data chunk found (offset: ${dataOffset}, size: ${dataSize}, buffer: ${buffer.byteLength})`);
    }
    
    // Read audio data
    const samples = [];
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = dataSize / (bytesPerSample * channels);
    
    for (let i = 0; i < numSamples; i++) {
        const byteOffset = dataOffset + (i * bytesPerSample * channels);
        let sample;
        
        if (bitsPerSample === 16) {
            sample = view.getInt16(byteOffset, true) / 32768.0;
        } else if (bitsPerSample === 24) {
            const b1 = view.getUint8(byteOffset);
            const b2 = view.getUint8(byteOffset + 1);
            const b3 = view.getUint8(byteOffset + 2);
            const combined = b1 | (b2 << 8) | (b3 << 16);
            const signed = (combined & 0x800000) ? (combined | 0xFF000000) : combined;
            sample = signed / 8388608.0;
        } else if (bitsPerSample === 32) {
            sample = view.getFloat32(byteOffset, true);
        } else {
            throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
        }
        
        // If stereo, average channels
        if (channels > 1) {
            const sample2 = bitsPerSample === 16 
                ? view.getInt16(byteOffset + bytesPerSample, true) / 32768.0
                : view.getFloat32(byteOffset + bytesPerSample, true);
            sample = (sample + sample2) / 2;
        }
        
        samples.push(sample);
    }
    
    return {
        samples,
        sampleRate,
        channels,
        bitsPerSample
    };
}

// Don't normalize - keep full sample length to preserve timing
// Only resample if needed to match target sample rate
function resampleToTargetRate(samples, sourceSampleRate, targetSampleRate) {
    if (sourceSampleRate === targetSampleRate) {
        return samples;
    }
    
    const ratio = sourceSampleRate / targetSampleRate;
    const targetLength = Math.ceil(samples.length / ratio);
    const resampled = new Float32Array(targetLength);
    
    for (let i = 0; i < targetLength; i++) {
        const srcIndex = i * ratio;
        const index1 = Math.floor(srcIndex);
        const index2 = Math.min(index1 + 1, samples.length - 1);
        const frac = srcIndex - index1;
        
        resampled[i] = samples[index1] * (1 - frac) + samples[index2] * frac;
    }
    
    return Array.from(resampled);
}

// Map filenames to drum type names
function getDrumTypeFromFilename(filename) {
    const name = path.basename(filename, '.wav');
    // Extract drum type from filename like "wa_808tape_kick_01_clean"
    const match = name.match(/wa_808tape_(\w+)_\d+_\w+/);
    if (match) {
        return match[1];
    }
    return name;
}

// Convert directory of WAV files to JavaScript module
function convertAllSamplesToWavetable(inputDir, outputFile) {
    const files = fs.readdirSync(inputDir)
        .filter(f => f.toLowerCase().endsWith('.wav'))
        .sort();
    
    if (files.length === 0) {
        console.error(`No WAV files found in ${inputDir}`);
        process.exit(1);
    }
    
    console.log(`Found ${files.length} WAV files`);
    
    const wavetables = {};
    const drumTypes = {};
    
    for (const file of files) {
        const filePath = path.join(inputDir, file);
        const nodeBuffer = fs.readFileSync(filePath);
        // Convert Node.js Buffer to ArrayBuffer
        const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
        
        try {
            const audioData = parseWAV(arrayBuffer);
            // Resample to 44.1kHz to match AudioContext sample rate
            // Keep full sample length - don't truncate to 2048!
            const targetSampleRate = 44100;
            const resampled = resampleToTargetRate(audioData.samples, audioData.sampleRate, targetSampleRate);
            
            // Extract drum type and create organized structure
            const drumType = getDrumTypeFromFilename(file);
            const name = path.basename(file, '.wav');
            
            // Store by drum type
            if (!wavetables[drumType]) {
                wavetables[drumType] = {};
                drumTypes[drumType] = [];
            }
            
            wavetables[drumType][name] = resampled;
            drumTypes[drumType].push(name);
            
            const originalDuration = (audioData.samples.length / audioData.sampleRate).toFixed(3);
            const resampledDuration = (resampled.length / targetSampleRate).toFixed(3);
            console.log(`✓ Converted ${file} -> ${drumType}/${name} (${audioData.samples.length} @ ${audioData.sampleRate}Hz = ${originalDuration}s -> ${resampled.length} @ ${targetSampleRate}Hz = ${resampledDuration}s)`);
        } catch (error) {
            console.error(`✗ Failed to convert ${file}: ${error.message}`);
        }
    }
    
    // Generate JavaScript code with organized structure
    const jsCode = `/**
 * Auto-generated wavetable data from TR-808 samples
 * Generated: ${new Date().toISOString()}
 * Source directory: ${inputDir}
 * 
 * Structure: wavetables[drumType][sampleName]
 * Example: wavetables.kick['wa_808tape_kick_01_clean']
 * 
 * Note: Samples are resampled to 44.1kHz (to match AudioContext) and kept at full length
 * (not normalized to 2048) to preserve original timing and prevent clicks
 */

export const wavetables = ${JSON.stringify(wavetables, null, 2)};

// Convert arrays to Float32Array for better performance
for (const drumType in wavetables) {
    for (const sampleName in wavetables[drumType]) {
        wavetables[drumType][sampleName] = new Float32Array(wavetables[drumType][sampleName]);
    }
}

// Helper: Get first sample for each drum type (for quick access)
export const defaultSamples = {};
for (const drumType in wavetables) {
    const sampleNames = Object.keys(wavetables[drumType]).sort();
    if (sampleNames.length > 0) {
        defaultSamples[drumType] = sampleNames[0];
    }
}

// Helper: Get all sample names for each drum type
export const sampleNames = {};
for (const drumType in wavetables) {
    sampleNames[drumType] = Object.keys(wavetables[drumType]).sort();
}
`;
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputFile, jsCode, 'utf8');
    console.log(`\n✓ Generated ${outputFile}`);
    console.log(`  Organized into ${Object.keys(wavetables).length} drum types`);
    console.log(`  Total samples: ${files.length}`);
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node convert-all-samples-to-wavetable.js <input-dir> <output-file>');
    console.error('Example: node convert-all-samples-to-wavetable.js 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js');
    process.exit(1);
}

const inputDir = args[0];
const outputFile = args[1];

if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    process.exit(1);
}

convertAllSamplesToWavetable(inputDir, outputFile);

