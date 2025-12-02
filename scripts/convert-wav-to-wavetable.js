/**
 * Script to convert WAV files to JavaScript wavetable arrays
 * Usage: node scripts/convert-wav-to-wavetable.js <input-dir> <output-file>
 * 
 * This reads all WAV files from a directory and converts them into
 * JavaScript wavetable arrays that can be used in the WavetableDrumSynth
 */

const fs = require('fs');
const path = require('path');

// Simple WAV file parser (basic implementation)
function parseWAV(buffer) {
    const view = new DataView(buffer);
    
    // Check RIFF header
    const riff = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
    if (riff !== 'RIFF') {
        throw new Error('Not a valid WAV file');
    }
    
    // Find fmt chunk
    let offset = 12;
    let sampleRate = 44100;
    let channels = 1;
    let bitsPerSample = 16;
    let dataOffset = 0;
    let dataSize = 0;
    
    while (offset < buffer.length - 8) {
        const chunkId = String.fromCharCode(...new Uint8Array(buffer.slice(offset, offset + 4)));
        const chunkSize = view.getUint32(offset + 4, true);
        
        if (chunkId === 'fmt ') {
            const format = view.getUint16(offset + 8, true);
            channels = view.getUint16(offset + 10, true);
            sampleRate = view.getUint32(offset + 12, true);
            bitsPerSample = view.getUint16(offset + 22, true);
        } else if (chunkId === 'data') {
            dataOffset = offset + 8;
            dataSize = chunkSize;
            break;
        }
        
        offset += 8 + chunkSize;
    }
    
    if (dataOffset === 0) {
        throw new Error('No data chunk found');
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
            // 24-bit samples are stored as 3 bytes
            const b1 = view.getUint8(byteOffset);
            const b2 = view.getUint8(byteOffset + 1);
            const b3 = view.getUint8(byteOffset + 2);
            // Combine bytes (little-endian)
            const combined = b1 | (b2 << 8) | (b3 << 16);
            // Sign extend if negative
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

// Normalize wavetable to a fixed size (for consistent playback)
function normalizeWavetable(samples, targetLength = 2048) {
    if (samples.length === targetLength) {
        return samples;
    }
    
    // Simple linear interpolation resampling
    const normalized = new Float32Array(targetLength);
    const ratio = samples.length / targetLength;
    
    for (let i = 0; i < targetLength; i++) {
        const srcIndex = i * ratio;
        const index1 = Math.floor(srcIndex);
        const index2 = Math.min(index1 + 1, samples.length - 1);
        const frac = srcIndex - index1;
        
        normalized[i] = samples[index1] * (1 - frac) + samples[index2] * frac;
    }
    
    return Array.from(normalized);
}

// Convert directory of WAV files to JavaScript module
function convertWAVsToWavetable(inputDir, outputFile) {
    const files = fs.readdirSync(inputDir)
        .filter(f => f.toLowerCase().endsWith('.wav'))
        .sort();
    
    if (files.length === 0) {
        console.error(`No WAV files found in ${inputDir}`);
        process.exit(1);
    }
    
    console.log(`Found ${files.length} WAV files`);
    
    const wavetables = {};
    
    for (const file of files) {
        const filePath = path.join(inputDir, file);
        const buffer = fs.readFileSync(filePath);
        
        try {
            const audioData = parseWAV(buffer);
            const normalized = normalizeWavetable(audioData.samples, 2048);
            
            // Extract name without extension
            const name = path.basename(file, '.wav');
            wavetables[name] = normalized;
            
            console.log(`✓ Converted ${file} (${audioData.samples.length} samples @ ${audioData.sampleRate}Hz)`);
        } catch (error) {
            console.error(`✗ Failed to convert ${file}: ${error.message}`);
        }
    }
    
    // Generate JavaScript code
    const jsCode = `/**
 * Auto-generated wavetable data from WAV samples
 * Generated: ${new Date().toISOString()}
 * Source directory: ${inputDir}
 */

export const wavetables = ${JSON.stringify(wavetables, null, 2)};

// Convert arrays to Float32Array for better performance
for (const key in wavetables) {
    wavetables[key] = new Float32Array(wavetables[key]);
}
`;
    
    fs.writeFileSync(outputFile, jsCode, 'utf8');
    console.log(`\n✓ Generated ${outputFile} with ${Object.keys(wavetables).length} wavetables`);
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node convert-wav-to-wavetable.js <input-dir> <output-file>');
    console.error('Example: node convert-wav-to-wavetable.js 808-samples/kick src/lib/audio/synths/drums/wavetables/kickWavetables.js');
    process.exit(1);
}

const inputDir = args[0];
const outputFile = args[1];

if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    process.exit(1);
}

convertWAVsToWavetable(inputDir, outputFile);

