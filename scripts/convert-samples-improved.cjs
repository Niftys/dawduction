/**
 * Improved script to convert 808 samples with better normalization and format
 * Usage: node scripts/convert-samples-improved.cjs <input-dir> <output-file>
 * 
 * This ensures samples are:
 * - Properly normalized (peak normalization)
 * - Resampled to 44.1kHz
 * - 32-bit float format
 * - Full length preserved
 */

const fs = require('fs');
const path = require('path');

function parseWAV(buffer) {
    const view = new DataView(buffer);
    
    const riff = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
    if (riff !== 'RIFF') {
        throw new Error('Not a valid WAV file');
    }
    
    const wave = String.fromCharCode(...new Uint8Array(buffer.slice(8, 12)));
    if (wave !== 'WAVE') {
        throw new Error('Not a WAVE file');
    }
    
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
        
        offset += 8 + chunkSize;
        if (chunkSize % 2 === 1) offset += 1;
    }
    
    if (dataOffset === 0 || dataOffset + dataSize > buffer.byteLength) {
        throw new Error(`No data chunk found`);
    }
    
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

// Normalize samples to peak level (find max, scale to 0.95 to avoid clipping)
function normalizeSamples(samples) {
    if (samples.length === 0) return samples;
    
    // Find peak
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        if (abs > max) max = abs;
    }
    
    // If already normalized or very quiet, return as-is
    if (max < 0.001) return samples;
    if (max > 0.95) return samples; // Already loud enough
    
    // Normalize to 0.95 (leave headroom)
    const scale = 0.95 / max;
    const normalized = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        normalized[i] = samples[i] * scale;
    }
    
    return Array.from(normalized);
}

// Trim silence from start and end
function trimSilence(samples, threshold = 0.01) {
    if (samples.length === 0) return samples;
    
    let start = 0;
    let end = samples.length;
    
    // Find start (first sample above threshold)
    for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > threshold) {
            start = Math.max(0, i - 1); // Keep one sample before for smooth start
            break;
        }
    }
    
    // Find end (last sample above threshold)
    for (let i = samples.length - 1; i >= 0; i--) {
        if (Math.abs(samples[i]) > threshold) {
            end = Math.min(samples.length, i + 2); // Keep one sample after for smooth end
            break;
        }
    }
    
    if (start >= end) return samples; // No trimming needed
    
    return samples.slice(start, end);
}

function getDrumTypeFromFilename(filename) {
    const name = path.basename(filename, '.wav');
    const match = name.match(/wa_808tape_(\w+)_\d+_\w+/);
    if (match) {
        return match[1];
    }
    return name;
}

function convertAllSamplesImproved(inputDir, outputFile) {
    const files = fs.readdirSync(inputDir)
        .filter(f => f.toLowerCase().endsWith('.wav'))
        .sort();
    
    if (files.length === 0) {
        console.error(`No WAV files found in ${inputDir}`);
        process.exit(1);
    }
    
    console.log(`Found ${files.length} WAV files`);
    console.log('Processing with improved normalization...\n');
    
    const wavetables = {};
    
    for (const file of files) {
        const filePath = path.join(inputDir, file);
        const nodeBuffer = fs.readFileSync(filePath);
        const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
        
        try {
            const audioData = parseWAV(arrayBuffer);
            
            // Resample to 44.1kHz
            const targetSampleRate = 44100;
            let processed = resampleToTargetRate(audioData.samples, audioData.sampleRate, targetSampleRate);
            
            // Trim silence (optional - can be disabled if you want full samples)
            // processed = trimSilence(processed, 0.01);
            
            // Normalize to peak level
            processed = normalizeSamples(processed);
            
            const drumType = getDrumTypeFromFilename(file);
            const name = path.basename(file, '.wav');
            
            if (!wavetables[drumType]) {
                wavetables[drumType] = {};
            }
            
            wavetables[drumType][name] = processed;
            
            const duration = (processed.length / targetSampleRate).toFixed(3);
            const peak = Math.max(...processed.map(s => Math.abs(s))).toFixed(3);
            console.log(`✓ ${drumType}/${name}: ${processed.length} samples, ${duration}s, peak: ${peak}`);
        } catch (error) {
            console.error(`✗ Failed to convert ${file}: ${error.message}`);
        }
    }
    
    // Generate JavaScript code
    const jsCode = `/**
 * Auto-generated wavetable data from TR-808 samples
 * Generated: ${new Date().toISOString()}
 * Source directory: ${inputDir}
 * 
 * Structure: wavetables[drumType][sampleName]
 * Samples are: 44.1kHz, 32-bit float, normalized to 0.95 peak
 */

export const wavetables = ${JSON.stringify(wavetables, null, 2)};

// Convert arrays to Float32Array for better performance
for (const drumType in wavetables) {
    for (const sampleName in wavetables[drumType]) {
        wavetables[drumType][sampleName] = new Float32Array(wavetables[drumType][sampleName]);
    }
}

// Helper: Get first sample for each drum type
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
    console.error('Usage: node convert-samples-improved.cjs <input-dir> <output-file>');
    console.error('Example: node convert-samples-improved.cjs 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js');
    process.exit(1);
}

const inputDir = args[0];
const outputFile = args[1];

if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    process.exit(1);
}

convertAllSamplesImproved(inputDir, outputFile);

