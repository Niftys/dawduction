/**
 * Script to convert 808 samples using okwt for proper formatting
 * Usage: node scripts/convert-with-okwt.cjs <input-dir> <output-file>
 * 
 * This uses okwt to ensure samples are properly formatted, then converts
 * them to JavaScript wavetable arrays for use in WavetableDrumSynth
 * 
 * Requirements:
 * - pip install okwt
 * - Python 3.7+
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check if okwt is installed
function checkOkwt() {
    try {
        execSync('okwt --version', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

// Convert a single WAV file using okwt for normalization
function convertWithOkwt(inputFile, outputFile) {
    try {
        // Use okwt to normalize the sample
        // For one-shot samples, we'll create a temporary wavetable with a large frame size
        // to preserve the full sample, then extract it
        const tempFile = outputFile + '.temp.wav';
        
        // Get file size to determine appropriate frame size
        const stats = fs.statSync(inputFile);
        const estimatedSamples = Math.floor(stats.size / 4); // Rough estimate (assuming 16-bit mono)
        
        // Use a frame size that's larger than the sample to preserve everything
        // okwt will create a wavetable, but we'll extract the first frame which contains the full sample
        const frameSize = Math.max(2048, Math.ceil(estimatedSamples / 256) * 256); // Round up to multiple of 256
        
        // Convert with okwt: normalize, use large frame size, single frame to preserve full sample
        // --normalize: peak normalization
        // --num-frames 1: single frame (full sample)
        // --frame-size: large enough to hold the sample
        execSync(`okwt --infile "${inputFile}" --outfile "${tempFile}" --normalize --num-frames 1 --frame-size ${frameSize}`, {
            stdio: 'inherit'
        });
        
        return tempFile;
    } catch (error) {
        console.error(`Error converting ${inputFile} with okwt:`, error.message);
        return null;
    }
}

// Parse WAV file and extract samples
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
        
        offset += 8 + chunkSize;
        if (chunkSize % 2 === 1) offset += 1;
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

// Resample audio to target sample rate
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
    const match = name.match(/wa_808tape_(\w+)_\d+_\w+/);
    if (match) {
        return match[1];
    }
    return name;
}

// Convert directory of WAV files to JavaScript module using okwt
function convertAllSamplesWithOkwt(inputDir, outputFile) {
    // Check if okwt is available
    if (!checkOkwt()) {
        console.error('ERROR: okwt is not installed or not in PATH');
        console.error('Please install it with: pip install okwt');
        console.error('Or: python -m pip install okwt');
        process.exit(1);
    }
    
    const files = fs.readdirSync(inputDir)
        .filter(f => f.toLowerCase().endsWith('.wav'))
        .sort();
    
    if (files.length === 0) {
        console.error(`No WAV files found in ${inputDir}`);
        process.exit(1);
    }
    
    console.log(`Found ${files.length} WAV files`);
    console.log('Using okwt to ensure proper formatting...\n');
    
    const wavetables = {};
    const drumTypes = {};
    const tempFiles = [];
    
    // Create temp directory for okwt output
    const tempDir = path.join(path.dirname(outputFile), '.okwt-temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    for (const file of files) {
        const filePath = path.join(inputDir, file);
        const tempOutput = path.join(tempDir, file);
        
        console.log(`Processing ${file}...`);
        
        try {
            // Convert with okwt first
            const okwtOutput = convertWithOkwt(filePath, tempOutput);
            
            // Determine which file to read (okwt output or original)
            let fileToRead = filePath; // Default to original
            let usedOkwt = false;
            
            if (okwtOutput && fs.existsSync(okwtOutput)) {
                fileToRead = okwtOutput;
                usedOkwt = true;
                tempFiles.push(okwtOutput);
            } else {
                console.log(`  Warning: okwt conversion failed or output not found, using original file`);
            }
            
            // Read the file (either okwt-processed or original)
            const nodeBuffer = fs.readFileSync(fileToRead);
            const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength);
            const audioData = parseWAV(arrayBuffer);
            
            // Resample to 44.1kHz (okwt outputs 48kHz by default, originals may vary)
            const targetSampleRate = 44100;
            const resampled = resampleToTargetRate(audioData.samples, audioData.sampleRate, targetSampleRate);
            
            const drumType = getDrumTypeFromFilename(file);
            const name = path.basename(file, '.wav');
            
            if (!wavetables[drumType]) {
                wavetables[drumType] = {};
            }
            
            wavetables[drumType][name] = resampled;
            
            const originalDuration = (audioData.samples.length / audioData.sampleRate).toFixed(3);
            const resampledDuration = (resampled.length / targetSampleRate).toFixed(3);
            const method = usedOkwt ? 'okwt' : 'direct';
            console.log(`  ✓ Converted ${drumType}/${name} [${method}] (${audioData.samples.length} @ ${audioData.sampleRate}Hz = ${originalDuration}s -> ${resampled.length} @ ${targetSampleRate}Hz = ${resampledDuration}s)`);
        } catch (error) {
            console.error(`  ✗ Failed to convert ${file}: ${error.message}`);
        }
    }
    
    // Clean up temp files
    console.log('\nCleaning up temporary files...');
    for (const tempFile of tempFiles) {
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    try {
        if (fs.existsSync(tempDir)) {
            fs.rmdirSync(tempDir);
        }
    } catch (e) {
        // Ignore cleanup errors
    }
    
    // Generate JavaScript code
    const jsCode = `/**
 * Auto-generated wavetable data from TR-808 samples
 * Generated: ${new Date().toISOString()}
 * Source directory: ${inputDir}
 * Processed with: okwt (https://github.com/drzhnn/okwt)
 * 
 * Structure: wavetables[drumType][sampleName]
 * Example: wavetables.kick['wa_808tape_kick_01_clean']
 * 
 * Note: Samples are resampled to 44.1kHz (to match AudioContext) and kept at full length
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
    console.error('Usage: node convert-with-okwt.cjs <input-dir> <output-file>');
    console.error('Example: node convert-with-okwt.cjs 808-samples src/lib/audio/synths/drums/wavetables/allDrumWavetables.js');
    console.error('\nNote: Requires okwt to be installed: pip install okwt');
    process.exit(1);
}

const inputDir = args[0];
const outputFile = args[1];

if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    process.exit(1);
}

convertAllSamplesWithOkwt(inputDir, outputFile);

