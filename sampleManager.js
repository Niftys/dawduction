// Class to manage sample loading and playback
export class SampleManager {
    constructor() {
        // Initialize audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Object to store loaded sound buffers
        this.samples = {};
        
        // Define available drum sounds with their variations
        this.drumSounds = {
            kick: { count: 29, label: 'Bass Drum (BD)' },
            snare: { count: 30, label: 'Snare Drum (SD)' },
            closedhat: { count: 5, label: 'Closed Hi-Hat (CH)' },
            openhat: { count: 3, label: 'Open Hi-Hat (OH)' },
            clap: { count: 4, label: 'Hand Clap (HC)' },
            rim: { count: 2, label: 'Rimshot (RS)' },
            cowbell: { count: 3, label: 'Cowbell (CB)' },
            clave: { count: 3, label: 'Claves (CL)' },
            maracas: { count: 5, label: 'Maracas (MA)' },
            hitom: { count: 4, label: 'High Tom (HT)' },
            midtom: { count: 4, label: 'Mid Tom (MT)' },
            lotom: { count: 5, label: 'Low Tom (LT)' },
            crash: { count: 3, label: 'Cymbal (CY)' },
            triggerout: { count: 1, label: 'Trigger Out (TO)' }
        };
        
        // Define choke groups
        this.chokeGroups = {
            hihat: ['closedhat', 'openhat']
        };
        
        // Track active audio sources for choke groups
        this.activeSources = {
            hihat: []
        };
        
        // Setup recording functionality
        this.setupRecording();
    }
    
    // Load all the drum samples
    async loadSamples() {
        const loadPromises = [];
        
        // For each drum type
        for (const [type, info] of Object.entries(this.drumSounds)) {
            // Initialize the type in the samples object
            this.samples[type] = {};
            
            // For each variation of this drum type
            for (let i = 1; i <= info.count; i++) {
                const number = i.toString().padStart(2, '0');
                
                // For each sound mode (clean, sat, sat2)
                const modes = ['clean', 'sat', 'sat2'];
                for (const mode of modes) {
                    const samplePath = `assets/sounds/wa_808tape_${type}_${number}_${mode}.wav`;
                    
                    // Create a promise for loading this sample
                    const loadPromise = this.loadSample(type, number, mode, samplePath);
                    loadPromises.push(loadPromise);
                }
            }
        }
        
        // Wait for all samples to load
        try {
            await Promise.all(loadPromises);
            console.log('All samples loaded successfully');
            
            // Debug: Log which samples were successfully loaded
            this.logLoadedSamples();
        } catch (error) {
            console.error('Error loading samples:', error);
            throw error;
        }
    }
    
    // Load a specific sample
    async loadSample(type, number, mode, path) {
        try {
            // Initialize the number in the samples object if needed
            if (!this.samples[type][number]) {
                this.samples[type][number] = {};
            }
            
            // Fetch the audio file
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load sample: ${path}`);
            }
            
            // Convert to array buffer
            const arrayBuffer = await response.arrayBuffer();
            
            // Decode the audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Store the decoded buffer
            this.samples[type][number][mode] = audioBuffer;
            
        } catch (error) {
            // If the specific sample isn't available, log a warning but don't fail
            console.warn(`Could not load sample ${path}:`, error);
            
            // Log which samples are successfully loaded for debugging
            if (this.samples[type] && this.samples[type][number]) {
                const loadedModes = Object.keys(this.samples[type][number]);
                if (loadedModes.length > 0) {
                    console.log(`Available modes for ${type}_${number}: ${loadedModes.join(', ')}`);
                }
            }
        }
    }
    
    // Get the choke group for a given sample type
    getChokeGroup(type) {
        for (const [groupName, types] of Object.entries(this.chokeGroups)) {
            if (types.includes(type)) {
                return groupName;
            }
        }
        return null;
    }
    
    // Stop all active sources in a choke group
    stopChokeGroup(groupName) {
        if (!this.activeSources[groupName]) return;
        
        // Stop each source in the group and remove it
        this.activeSources[groupName].forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // Ignore errors from already stopped sources
            }
        });
        
        // Clear the active sources for this group
        this.activeSources[groupName] = [];
    }
    
    // Play a sample with the given parameters
    playSample(type, number, mode, volume = 1.0) {
        // Resume audio context if it's suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Get the sample buffer with fallback logic
        let sample = this.samples[type]?.[number]?.[mode];
        
        // If the requested mode is not available, try to find a fallback
        if (!sample) {
            console.warn(`Sample not found: ${type}_${number}_${mode}, trying fallback...`);
            
            // Try to find any available mode for this sample
            const availableModes = this.samples[type]?.[number];
            if (availableModes) {
                // Try clean first, then sat, then sat2
                const fallbackModes = ['clean', 'sat', 'sat2'];
                for (const fallbackMode of fallbackModes) {
                    if (availableModes[fallbackMode]) {
                        sample = availableModes[fallbackMode];
                        console.log(`Using fallback mode: ${fallbackMode} for ${type}_${number}`);
                        break;
                    }
                }
            }
            
            // If still no sample found, return
            if (!sample) {
                console.error(`No sample available for ${type}_${number} in any mode`);
                return;
            }
        }
        
        // Check if this sample belongs to a choke group
        const chokeGroup = this.getChokeGroup(type);
        
        // Handle hi-hat choke behavior according to TR-808 specs:
        // When closed hi-hat is triggered, it should immediately cut off any playing open hi-hat
        if (chokeGroup === 'hihat') {
            if (type === 'closedhat') {
                // If playing a closed hi-hat, stop any open hi-hats that are currently playing
                this.stopChokeGroup(chokeGroup);
            }
            // When playing an open hi-hat, we don't need to choke other sounds
            // This matches the TR-808 behavior where closed hi-hat triggers choke open hi-hat,
            // but open hi-hat doesn't affect closed hi-hat
        }
        
        // Create a source node
        const source = this.audioContext.createBufferSource();
        source.buffer = sample;
        
        // Create a gain node for volume control
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        
        // Connect the nodes
        source.connect(gainNode);
        
        // Als we de masterGainNode hebben, gebruik die; anders, gebruik de standaard destination
        if (this.masterGainNode) {
            gainNode.connect(this.masterGainNode);
        } else {
            gainNode.connect(this.audioContext.destination);
        }
        
        // If this is part of a choke group, track the source
        if (chokeGroup) {
            // Add this source to the active sources for this group
            if (!this.activeSources[chokeGroup]) {
                this.activeSources[chokeGroup] = [];
            }
            this.activeSources[chokeGroup].push(source);
            
            // Remove the source from active sources when it finishes playing
            source.onended = () => {
                const index = this.activeSources[chokeGroup].indexOf(source);
                if (index !== -1) {
                    this.activeSources[chokeGroup].splice(index, 1);
                }
            };
        }
        
        // Play the sample
        source.start(0);
    }
    
    // Schedule a sample to play at a specific time (Web Audio API precise timing)
    scheduleSample(type, number, mode, time, volume = 1.0) {
        // Resume audio context if it's suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        // Get the sample buffer with fallback logic (same as playSample)
        let sample = this.samples[type]?.[number]?.[mode];
        
        // If the requested mode is not available, try to find a fallback
        if (!sample) {
            console.warn(`Sample not found: ${type}_${number}_${mode}, trying fallback...`);
            
            // Try to find any available mode for this sample
            const availableModes = this.samples[type]?.[number];
            if (availableModes) {
                // Try clean first, then sat, then sat2
                const fallbackModes = ['clean', 'sat', 'sat2'];
                for (const fallbackMode of fallbackModes) {
                    if (availableModes[fallbackMode]) {
                        sample = availableModes[fallbackMode];
                        console.log(`Using fallback mode: ${fallbackMode} for ${type}_${number}`);
                        break;
                    }
                }
            }
            
            // If still no sample found, return
            if (!sample) {
                console.error(`No sample available for ${type}_${number} in any mode`);
                return null;
            }
        }
        
        // Check if this sample belongs to a choke group
        const chokeGroup = this.getChokeGroup(type);
        
        // Handle hi-hat choke behavior according to TR-808 specs:
        // When closed hi-hat is triggered, it should immediately cut off any playing open hi-hat
        if (chokeGroup === 'hihat') {
            if (type === 'closedhat') {
                // If playing a closed hi-hat, stop any open hi-hats that are currently playing
                this.scheduleChokeGroup(chokeGroup, time);
            }
        }
        
        // Create a source node
        const source = this.audioContext.createBufferSource();
        source.buffer = sample;
        
        // Create a gain node for volume control
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        
        // Connect the nodes
        source.connect(gainNode);
        
        // Als we de masterGainNode hebben, gebruik die; anders, gebruik de standaard destination
        if (this.masterGainNode) {
            gainNode.connect(this.masterGainNode);
        } else {
            gainNode.connect(this.audioContext.destination);
        }
        
        // If this is part of a choke group, track the source
        if (chokeGroup) {
            // Add this source to the active sources for this group
            if (!this.activeSources[chokeGroup]) {
                this.activeSources[chokeGroup] = [];
            }
            this.activeSources[chokeGroup].push(source);
            
            // Remove the source from active sources when it finishes playing
            source.onended = () => {
                const index = this.activeSources[chokeGroup].indexOf(source);
                if (index !== -1) {
                    this.activeSources[chokeGroup].splice(index, 1);
                }
            };
        }
        
        // Schedule the sample to play at the specified time
        source.start(time);
        
        return source; // Return source for potential stopping
    }
    
    // Schedule stopping a choke group at a specific time
    scheduleChokeGroup(groupName, time) {
        if (!this.activeSources[groupName]) return;
        
        // Stop each source in the group at the specified time
        this.activeSources[groupName].forEach(source => {
            try {
                // Stop the source at the specified time
                source.stop(time);
            } catch (e) {
                // Ignore errors from already stopped sources
            }
        });
        
        // Clear the active sources for this group
        this.activeSources[groupName] = [];
    }
    
    // Get the list of drum sounds
    getDrumSoundsList() {
        return this.drumSounds;
    }
    
    // Debug function to log which samples were successfully loaded
    logLoadedSamples() {
        console.log('=== Loaded Samples Debug Info ===');
        for (const [type, numbers] of Object.entries(this.samples)) {
            console.log(`${type}:`);
            for (const [number, modes] of Object.entries(numbers)) {
                const modeList = Object.keys(modes);
                console.log(`  ${number}: ${modeList.join(', ')}`);
            }
        }
        console.log('================================');
    }
    
    // Opname functionaliteit
    setupRecording() {
        // Create an audio destination node for recording
        this.recordingDestination = this.audioContext.createMediaStreamDestination();
        
        // MediaRecorder and chunks for recording data
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        
        // Default recording settings
        this.recordingBitDepth = 24;
        this.recordingSampleRate = 44100;
        
        // Setup audio routing now that recordingDestination is created
        this.setupAudioRouting();
    }
    
    startRecording(bitDepth = 24, sampleRate = 44100, maxDurationSeconds = 300) {
        if (this.isRecording) return;
        
        // Store the recording settings
        this.recordingBitDepth = bitDepth;
        this.recordingSampleRate = sampleRate;
        
        // Reset the chunks for a new recording
        this.audioChunks = [];
        
        // Calculate appropriate bitrate based on bit depth and sample rate
        // Formula: channels * sampleRate * bitDepth = bitrate in bits per second
        const bitrate = 2 * sampleRate * bitDepth;
        
        // Create a new MediaRecorder with appropriate bitrate for the quality
        const options = { 
            mimeType: 'audio/webm',
            audioBitsPerSecond: bitrate
        };
        
        try {
            this.mediaRecorder = new MediaRecorder(this.recordingDestination.stream, options);
        } catch (err) {
            console.warn('The specified mimeType is not supported, using default format', err);
            this.mediaRecorder = new MediaRecorder(this.recordingDestination.stream);
        }
        
        // Collect audio data in chunks
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };
        
        // Set chunk interval to collect data every 1 second
        const timeSlice = 1000; // milliseconds
        
        // Start recording with time slices to ensure we get data even for long recordings
        this.mediaRecorder.start(timeSlice);
        this.isRecording = true;
        
        // Log the recording settings
        console.log(`Recording started: ${bitDepth}-bit / ${sampleRate/1000}kHz, max duration: ${maxDurationSeconds}s`);
    }
    
    stopRecording(currentTempo = 120) {
        if (!this.isRecording || !this.mediaRecorder) return;
        
        return new Promise((resolve) => {
            // When recording stops, convert the data to WAV and download the file
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                
                // Convert the webm to WAV with the selected quality settings
                const wavBlob = await this.convertToWav(audioBlob);
                
                // Create a descriptive filename with BPM and quality information
                const bitDepthStr = this.recordingBitDepth;
                const sampleRateStr = this.recordingSampleRate / 1000;
                const filename = `Lloyd-Stellar-808-Beat-${currentTempo}BPM-${bitDepthStr}bit-${sampleRateStr}kHz.wav`;
                
                // Create download link
                const audioUrl = URL.createObjectURL(wavBlob);
                const link = document.createElement('a');
                link.href = audioUrl;
                link.download = filename;
                
                // Download the file automatically
                link.click();
                
                // Clean up resources
                URL.revokeObjectURL(audioUrl);
                this.isRecording = false;
                
                console.log(`Recording stopped and saved as ${filename}`);
                resolve();
            };
            
            this.mediaRecorder.stop();
        });
    }
    
    // Converteer van webm naar wav met 24-bit 44.1KHz kwaliteit
    async convertToWav(audioBlob) {
        // Create a new AudioContext for decoding and encoding
        const offlineContext = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, this.recordingSampleRate * 600, this.recordingSampleRate);
        
        // Get the ArrayBuffer from the blob
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        // Decode the audio
        const audioBuffer = await offlineContext.decodeAudioData(arrayBuffer);
        
        // Resample if needed to match the requested sample rate
        let processedBuffer = audioBuffer;
        if (audioBuffer.sampleRate !== this.recordingSampleRate) {
            processedBuffer = this.resampleAudio(audioBuffer, this.recordingSampleRate);
        }
        
        // Create a WavEncoder for the requested quality
        const wav = this.encodeWAV(processedBuffer, true, this.recordingBitDepth);
        
        return new Blob([wav], { type: 'audio/wav' });
    }
    
    // Render a single track to an audio buffer for stem export
    async renderTrackToBuffer(track, stepMode, repetitions, tempo, swingAmount, swingEnabled, accentPattern, accentAmount, normalVolumeReduction, soundMode, sampleRate, totalDuration) {
        console.log('Rendering track:', {
            trackId: track.id,
            type: track.type,
            sampleNumber: track.sampleNumber,
            soundMode: soundMode,
            stepMode: stepMode,
            repetitions: repetitions,
            patternLength: track.pattern ? track.pattern.length : 0
        });
        
        // Create an offline audio context for rendering
        const numberOfSamples = Math.ceil(sampleRate * totalDuration);
        const offlineContext = new OfflineAudioContext(2, numberOfSamples, sampleRate);
        
        // Calculate timing constants
        const stepDuration = 60 / tempo / 4; // Duration of one 16th note in seconds
        const swingDelay = swingEnabled ? (stepDuration * swingAmount / 100 * 0.3) : 0;
        
        // Schedule all the drum hits for this track
        let currentTime = 0;
        let totalScheduledSounds = 0;
        
        for (let rep = 0; rep < repetitions; rep++) {
            for (let step = 0; step < stepMode; step++) {
                if (track.pattern[step]) {
                    // Calculate the exact time for this step
                    let stepTime = currentTime + (step * stepDuration);
                    
                    // Apply swing to even steps (0-indexed, so odd steps in musical terms)
                    if (swingEnabled && step % 2 === 1) {
                        stepTime += swingDelay;
                    }
                    
                    // Check if this step is accented
                    const globalStep = (rep * stepMode) + step;
                    const isAccented = accentPattern[globalStep % 64] || false;
                    
                    // Calculate volume with accent
                    let volume = track.volume || 1.0;
                    if (isAccented) {
                        volume = volume * (1 + accentAmount);
                    } else {
                        volume = volume * normalVolumeReduction;
                    }
                    
                    // Load and schedule the sample - gebruik de juiste geneste object structuur
                    const buffer = this.samples[track.type]?.[track.sampleNumber]?.[soundMode];
                    
                    // Debug logging
                    if (!buffer) {
                        console.warn(`Sample not found for export:`, {
                            type: track.type,
                            sampleNumber: track.sampleNumber,
                            soundMode: soundMode,
                            availableTypes: Object.keys(this.samples),
                            availableNumbers: this.samples[track.type] ? Object.keys(this.samples[track.type]) : [],
                            availableModes: this.samples[track.type]?.[track.sampleNumber] ? Object.keys(this.samples[track.type][track.sampleNumber]) : []
                        });
                    }
                    
                    if (buffer) {
                        const source = offlineContext.createBufferSource();
                        source.buffer = buffer;
                        
                        const gainNode = offlineContext.createGain();
                        gainNode.gain.value = volume;
                        
                        source.connect(gainNode);
                        gainNode.connect(offlineContext.destination);
                        
                        source.start(stepTime);
                        totalScheduledSounds++;
                    }
                }
            }
            currentTime += stepMode * stepDuration;
        }
        
        console.log(`Scheduled ${totalScheduledSounds} sounds for track ${track.id}`);
        
        // Render the audio
        const renderedBuffer = await offlineContext.startRendering();
        
        // Trim the buffer to exact length for perfect looping
        return this.trimBufferToExactLength(renderedBuffer, totalDuration, sampleRate);
    }
    
    // Trim audio buffer to exact length for perfect loops
    trimBufferToExactLength(buffer, targetDuration, sampleRate) {
        const targetLength = Math.floor(sampleRate * targetDuration);
        
        // If the buffer is already the right length, return it
        if (buffer.length === targetLength) {
            return buffer;
        }
        
        // Create a new buffer with the exact length
        const trimmedBuffer = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            targetLength,
            sampleRate
        );
        
        // Copy the audio data
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const targetData = trimmedBuffer.getChannelData(channel);
            
            // Copy samples up to the target length
            const samplesToCopy = Math.min(sourceData.length, targetLength);
            for (let i = 0; i < samplesToCopy; i++) {
                targetData[i] = sourceData[i];
            }
        }
        
        return trimmedBuffer;
    }
    
    // Convert AudioBuffer to WAV Blob
    audioBufferToWav(audioBuffer, bitDepth = 24) {
        const wav = this.encodeWAV(audioBuffer, true, bitDepth);
        return new Blob([wav], { type: 'audio/wav' });
    }
    
    // Add a method to resample audio if needed
    resampleAudio(audioBuffer, targetSampleRate) {
        // If the sample rates match, return the original buffer
        if (audioBuffer.sampleRate === targetSampleRate) {
            return audioBuffer;
        }
        
        // Calculate the new length based on the target sample rate
        const newLength = Math.round(audioBuffer.length * targetSampleRate / audioBuffer.sampleRate);
        
        // Create a new offline context with the target sample rate
        const offlineContext = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            newLength,
            targetSampleRate
        );
        
        // Create a buffer source with the original audio buffer
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Connect to the destination and start
        source.connect(offlineContext.destination);
        source.start(0);
        
        // Render the audio and return the new buffer
        return offlineContext.startRendering();
    }
    
    // Update the encodeWAV method to handle variable bit depths
    encodeWAV(audioBuffer, isStereo = true, bitDepth = 24) {
        const numChannels = isStereo ? 2 : 1;
        const sampleRate = audioBuffer.sampleRate;
        const bytesPerSample = bitDepth / 8;
        const format = bitDepth === 32 ? 3 : 1; // PCM = 1, Float = 3
        
        // Number of samples
        const length = audioBuffer.length;
        const dataSize = length * numChannels * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
        
        // RIFF identifier
        this.writeString(view, 0, 'RIFF');
        // RIFF chunk length
        view.setUint32(4, 36 + dataSize, true);
        // RIFF type
        this.writeString(view, 8, 'WAVE');
        // Format chunk identifier
        this.writeString(view, 12, 'fmt ');
        // Format chunk length
        view.setUint32(16, 16, true);
        // Sample format (raw)
        view.setUint16(20, format, true);
        // Channel count
        view.setUint16(22, numChannels, true);
        // Sample rate
        view.setUint32(24, sampleRate, true);
        // Byte rate (sample rate * block align)
        view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
        // Block align (channel count * bytes per sample)
        view.setUint16(32, numChannels * bytesPerSample, true);
        // Bits per sample
        view.setUint16(34, bitDepth, true);
        // Data chunk identifier
        this.writeString(view, 36, 'data');
        // Data chunk length
        view.setUint32(40, dataSize, true);
        
        // Write the PCM samples
        let offset = 44;
        
        const leftData = audioBuffer.getChannelData(0);
        const rightData = numChannels > 1 ? audioBuffer.getChannelData(1) : null;
        
        if (bitDepth === 16) {
            // For 16-bit, write as 2-byte integers
            for (let i = 0; i < length; i++) {
                // Convert from -1.0 to 1.0 float to -32768 to 32767 for 16-bit audio
                let sample = Math.max(-1, Math.min(1, leftData[i])) * 32767;
                
                // 16-bit samples as little-endian
                view.setInt16(offset, sample, true); offset += 2;
                
                if (numChannels > 1) {
                    sample = Math.max(-1, Math.min(1, rightData[i])) * 32767;
                    view.setInt16(offset, sample, true); offset += 2;
                }
            }
        } else if (bitDepth === 24) {
            // For 24-bit, write as 3-byte integers
            for (let i = 0; i < length; i++) {
                // Convert from -1.0 to 1.0 float to -8388608 to 8388607 for 24-bit audio
                let sample = Math.max(-1, Math.min(1, leftData[i])) * 8388607;
                
                // 24-bit samples as little-endian
                view.setUint8(offset, sample & 0xFF); offset++;
                view.setUint8(offset, (sample >> 8) & 0xFF); offset++;
                view.setUint8(offset, (sample >> 16) & 0xFF); offset++;
                
                if (numChannels > 1) {
                    sample = Math.max(-1, Math.min(1, rightData[i])) * 8388607;
                    view.setUint8(offset, sample & 0xFF); offset++;
                    view.setUint8(offset, (sample >> 8) & 0xFF); offset++;
                    view.setUint8(offset, (sample >> 16) & 0xFF); offset++;
                }
            }
        } else if (bitDepth === 32) {
            // For 32-bit float, write directly as float values
            for (let i = 0; i < length; i++) {
                view.setFloat32(offset, leftData[i], true); offset += 4;
                
                if (numChannels > 1) {
                    view.setFloat32(offset, rightData[i], true); offset += 4;
                }
            }
        }
        
        return buffer;
    }
    
    // Helper functie om strings in DataView te schrijven
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    
    // Verander de audio routing om opname mogelijk te maken
    setupAudioRouting() {
        // CreÃ«er een main gain node voor de master output
        this.masterGainNode = this.audioContext.createGain();
        this.masterGainNode.gain.value = 1.0;
        
        // Verbind de master gain met zowel de speakers als de opname-destination
        this.masterGainNode.connect(this.audioContext.destination);
        this.masterGainNode.connect(this.recordingDestination);
        
        // We gebruiken deze masterGainNode nu als nieuwe "destination" voor samples
        return this.masterGainNode;
    }
    

} 
