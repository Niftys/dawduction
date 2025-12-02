// Import necessary modules
import { SampleManager } from './sampleManager.js';
import { Sequencer } from './sequencer.js';
import { UI } from './ui.js';
// Import jsmidgen
import * as jsmidgen from './lib/jsmidgen.js';

// Error handling utility
class ErrorHandler {
    static log(error, context = 'Unknown', level = 'error') {
        const timestamp = new Date().toISOString();
        const message = `[${timestamp}] ${context}: ${error.message || error}`;
        
        switch (level) {
            case 'warn':
                console.warn(message, error);
                break;
            case 'info':
                console.info(message, error);
                break;
            case 'error':
            default:
                console.error(message, error);
                break;
        }
    }
    
    static async handleAsync(asyncFunction, context = 'Async operation', fallbackValue = null) {
        try {
            return await asyncFunction();
        } catch (error) {
            this.log(error, context);
            return fallbackValue;
        }
    }
    
    static showUserError(message, title = 'Error') {
        // In een productieomgeving zou je hier een mooiere error UI kunnen tonen
        alert(`${title}: ${message}`);
    }
}

class DrumMachine {
    constructor() {
        // Create instances of our main components
        this.sampleManager = new SampleManager();
        this.sequencer = new Sequencer();
        this.ui = new UI(this);
        
        // Load configuration constants
        this.config = this.getDefaultConfig();
        
        // Default settings
        this.tempo = this.config.DEFAULT_TEMPO;
        this.isPlaying = false;
        this.isPaused = false; // Nieuwe state voor pauze
        this.soundMode = this.config.DEFAULT_SOUND_MODE;
        this.swingEnabled = false;
        this.swingAmount = this.config.DEFAULT_SWING_AMOUNT;
        this.accentPattern = new Array(this.config.MAX_STEPS).fill(false);
        this.accentAmount = this.config.ACCENT_AMOUNT;
        this.normalVolumeReduction = this.config.NORMAL_VOLUME_REDUCTION;

        
        // Step pattern settings
        this.stepMode = this.config.DEFAULT_STEP_MODE;
        
        // History tracking for undo/redo
        this.history = [];
        this.currentHistoryIndex = -1;
        this.maxHistorySize = this.config.MAX_HISTORY_SIZE;
        
        // Recording functionality
        this.isRecording = false;
        
        // Auto-scroll settings (new)
        this.autoScrollEnabled = true;
        
        // MIDI mappings for different platforms
        this.midiMappings = {
            // Ableton Live 808 Core Kit Drum Rack - Gecorrigeerd op basis van testen
            'ableton-808-core': {
                // Exacte MIDI mapping na testen met Ableton Live
                'Bass Drum': 36,     // C1 - juist
                'Snare Drum': 38,    // D1 - juist
                'Low Tom': 44,       // G#1 - gecorrigeerd naar exacte Ableton waarde
                'Mid Tom': 45,       // A1 - juist
                'Hi Tom': 47,        // B1 - gecorrigeerd naar exacte Ableton waarde
                'Rim Shot': 37,      // C#1 - juist
                'Hand Clap': 39,     // D#1 - juist
                'Cowbell': 50,       // D2 - gecorrigeerd naar exacte Ableton waarde
                'Cymbal': 49,        // C#2 - juist
                'Open Hi Hat': 46,   // A#1 - juist
                'Closed Hi Hat': 42, // F#1 - juist
                'Maracas': 48,       // C2 - juist
                'Claves': 51,        // D#2 - juist
                'Hi Conga': 39,      // Niet gebruikt in Ableton mapping
                'Mid Conga': 38,     // Niet gebruikt in Ableton mapping
                'Low Conga': 40      // Niet gebruikt in Ableton mapping
            },
            
            // Behringer RD-8 hardware drum machine mapping (volgens handleiding)
            'behringer-rd8': {
                'Bass Drum': 36,      // Bass Drum (BD)
                'Snare Drum': 40,     // Snare Drum (SD)
                'Low Tom': 45,        // Low Tom/Low Conga (LT/LC)
                'Mid Tom': 47,        // Mid Tom/Mid Conga (MT/MC)
                'Hi Tom': 50,         // Hi Tom/Hi Conga (HT/HC)
                'Rim Shot': 37,       // Rim Shot/Claves (RS/CL)
                'Hand Clap': 39,      // Clap/Maracas (CP/MA)
                'Cowbell': 56,        // Cowbell (CB)
                'Cymbal': 51,         // Cymbal (CY)
                'Open Hi Hat': 46,    // Open Hat (OH)
                'Closed Hi Hat': 42,  // Closed Hat (CH)
                'Maracas': 39,        // Gebruik Clap/Maracas kanaal
                'Claves': 37,         // Gebruik Rim Shot/Claves kanaal
                'Hi Conga': 50,       // Gebruik Hi Tom/Hi Conga kanaal
                'Mid Conga': 47,      // Gebruik Mid Tom/Mid Conga kanaal
                'Low Conga': 45       // Gebruik Low Tom/Low Conga kanaal
            },
            
            // Roland TR-08 drum machine mapping (volgens screenshot)
            'roland-tr08': {
                'Bass Drum': 36,      // Bass Drum (BD)
                'Snare Drum': 38,     // Snare Drum (SD)
                'Low Tom': 43,        // Low Tom
                'Mid Tom': 47,        // Mid Tom
                'Hi Tom': 50,         // High Tom
                'Rim Shot': 37,       // Rim Shot
                'Hand Clap': 39,      // Hand Clap
                'Cowbell': 56,        // Cow Bell
                'Cymbal': 49,         // Cymbal
                'Open Hi Hat': 46,    // Open Hi-Hat
                'Closed Hi Hat': 42,  // Closed Hi-Hat
                'Maracas': 70,        // Maracas
                'Claves': 75,         // Claves
                'Hi Conga': 62,       // High Conga
                'Mid Conga': 63,      // Mid Conga
                'Low Conga': 64       // Low Conga
            },
            
            // AcidLab Miami drum machine mapping
            'acidlab-miami': {
                'Bass Drum': 36,      // Bass Drum
                'Snare Drum': 37,     // Snare
                'Low Tom': 38,        // Low Tom
                'Mid Tom': 39,        // Mid Tom
                'Hi Tom': 40,         // High Tom
                'Rim Shot': 41,       // Rimshot or Clave
                'Hand Clap': 42,      // Handclap or Maracas
                'Cowbell': 43,        // Cowbell
                'Cymbal': 44,         // Cymbal
                'Open Hi Hat': 45,    // Open Hihat
                'Closed Hi Hat': 46,  // Closed Hihat
                'Maracas': 42,        // Gebruik Handclap/Maracas kanaal
                'Claves': 41,         // Gebruik Rimshot/Clave kanaal
                'Hi Conga': 40,       // Gebruik High Tom kanaal
                'Mid Conga': 39,      // Gebruik Mid Tom kanaal
                'Low Conga': 38       // Gebruik Low Tom kanaal
            },
            
            // E-licktronic Yocto drum machine mapping (GM format)
            'elicktronic-yocto': {
                'Bass Drum': 36,      // BassDrum 2
                'Snare Drum': 38,     // SnareDrum 1
                'Low Tom': 41,        // LowTom
                'Mid Tom': 45,        // MiddleTom (heeft ook 47/48 als optie volgens screenshot)
                'Hi Tom': 50,         // HighTom
                'Rim Shot': 34,       // RimShot
                'Hand Clap': 39,      // HandClap (niet in screenshot, standaard GM waarde)
                'Cowbell': 49,        // Cowbell
                'Cymbal': 51,         // Cymbal
                'Open Hi Hat': 46,    // Open Hi-Hat
                'Closed Hi Hat': 42,  // Closed Hi-Hat
                'Maracas': 70,        // Maracas (niet in screenshot, standaard GM waarde)
                'Claves': 75,         // Claves (niet in screenshot, standaard GM waarde)
                'Hi Conga': 62,       // High Conga (niet in screenshot, standaard GM waarde)
                'Mid Conga': 63,      // Mid Conga (niet in screenshot, standaard GM waarde) 
                'Low Conga': 64       // Low Conga (niet in screenshot, standaard GM waarde)
            }
        };
        
        // Initialize the application
        this.init();
    }
    
    // Configuration constants
    getDefaultConfig() {
        return {
            DEFAULT_TEMPO: 130,
            MIN_TEMPO: 50,
            MAX_TEMPO: 200,
            DEFAULT_SOUND_MODE: 'clean',
            DEFAULT_SWING_AMOUNT: 50,
            MIN_SWING: 50,
            MAX_SWING: 75,
            DEFAULT_STEP_MODE: 16,
            MAX_STEPS: 64,
            ACCENT_AMOUNT: 0.25,
            NORMAL_VOLUME_REDUCTION: 0.90,
            MAX_HISTORY_SIZE: 30,
            MAX_RECORDING_TIME_SECONDS: 300,
            RECORDING_TIME_SLICE_MS: 1000,
            SAMPLE_PATH_TEMPLATE: 'assets/sounds/wa_808tape_{type}_{number}_{mode}.wav',
            VERSION: '1.4'
        };
    }
    
    async init() {
        try {
            // Load all samples
            await this.sampleManager.loadSamples();
            
            // Setup recording functionality
            this.sampleManager.setupRecording();
            this.sampleManager.setupAudioRouting();
            
            // Set the initial tempo value in the UI
            // Input value is managed by UI class, only update display
            document.getElementById('tempo-value').textContent = Math.round(this.tempo);
            
            // Setup UI elements
            this.ui.setupUI();
            
        // Setup event listeners
        this.setupEventListeners();
        
        // Load preset files and populate the dropdown
        this.loadPresets();
            
            // Add event listener for the close button in the preset info bar
            const closeInfoButton = document.getElementById('preset-info-close');
            if (closeInfoButton) {
                closeInfoButton.addEventListener('click', () => {
                    const infoBar = document.getElementById('preset-info-bar');
                    infoBar.classList.remove('visible');
                });
            }
            
            // Initialize the modern audio scheduler
            this.sequencer.initializeAudioScheduler(this.sampleManager.audioContext);
            
            // Add the step callback to support the improved timing
            this.sequencer.setStepCallback((currentStep) => this.onStep(currentStep));
            
            // Add page change callback to update UI when page changes during playback
            this.sequencer.setPageChangeCallback((pageIndex) => this.onPageChange(pageIndex));
            
            // Add a dummy schedule callback for compatibility
            this.sequencer.setScheduleCallback(null);
            
            // Initialize all tracks
            for (let i = 0; i < 8; i++) {
                this.sequencer.initTrack(i);
            }
            
            // Update de stop knop (disabled als niet aan het spelen)
            this.updateStopButtonState();
            
            // Save initial state (empty pattern)
            this.saveToHistory();
            
            console.log('TR-808 Drum Machine initialized successfully');
        } catch (error) {
            console.error('Failed to initialize drum machine:', error);
        }
    }
    
    // Get available preset configurations
    getPresetConfigs() {
        return [
            { file: 'Anthony Rother.json', display: 'Anthony Rother' },
            { file: 'Legowelt.json', display: 'Legowelt' },
            { file: 'Carl Finlow.json', display: 'Carl Finlow' },
            { file: 'The Exaltics.json', display: 'The Exaltics' },
            { file: 'T-Error.json', display: 'T/Error' },
            { file: 'The Droid.json', display: 'The Droid' },
            { file: 'Cliff Dalton.json', display: 'Cliff Dalton' },
            { file: 'Nachtwald.json', display: 'Nachtwald' },
            { file: 'Lloyd Stellar.json', display: 'Lloyd Stellar' }
        ];
    }
    
    // Load preset files and populate the dropdown
    async loadPresets() {
        try {
            const presets = this.getPresetConfigs();
            const presetSelector = document.getElementById('preset-selector');
            
            // Clear existing options except the first one
            while (presetSelector.options.length > 1) {
                presetSelector.remove(1);
            }
            
            // Add preset options to the dropdown
            presets.forEach(preset => {
                const option = document.createElement('option');
                option.value = preset.file;
                option.textContent = preset.display;
                presetSelector.appendChild(option);
            });
            
            // Add event listener for preset selection (only if not already added)
            if (!presetSelector.hasAttribute('data-listener-added')) {
                presetSelector.addEventListener('change', (e) => {
                    if (e.target.value) {
                        this.loadPresetFromFile(e.target.value);
                    }
                });
                presetSelector.setAttribute('data-listener-added', 'true');
            }
        } catch (error) {
            ErrorHandler.log(error, 'Loading presets');
        }
    }
    
    // Load a preset from a file
    async loadPresetFromFile(filename) {
        try {
            // In a real implementation, we would fetch the file from the server
            // For now, we'll simulate loading by using the loadPattern method with example data
            console.log(`Loading preset: ${filename}`);
            
            // Create a path to the preset file
            const presetPath = `assets/presets/${filename}`;
            
            // Fetch the preset file
            const response = await fetch(presetPath);
            if (!response.ok) {
                throw new Error(`Failed to load preset: ${response.statusText}`);
            }
            
            // Parse the JSON data
            const presetData = await response.json();
            
            // Apply the preset data to the drum machine
            this.applyPresetData(presetData);
            
            // Show preset information
            this.showPresetInfo(filename);
            
            console.log(`Preset loaded successfully: ${filename}`);
        } catch (error) {
            ErrorHandler.log(error, 'Loading preset file');
            ErrorHandler.showUserError(`Failed to load preset: ${error.message}`);
        }
    }
    
    // Show preset information in the info bar
    async showPresetInfo(filename) {
        try {
            // Get the artist name from the filename (remove .json extension)
            const artistName = filename.replace('.json', '');
            
            // Create paths for the image and text files
            const imagePath = `assets/presets/${artistName}.jpg`;
            const textPath = `assets/presets/${artistName}.txt`;
            
            // Fetch the text content
            const textResponse = await fetch(textPath);
            if (!textResponse.ok) {
                throw new Error(`Failed to load preset text: ${textResponse.statusText}`);
            }
            
            const textContent = await textResponse.text();
            
            // Update the info bar elements
            const infoBar = document.getElementById('preset-info-bar');
            const infoImage = document.getElementById('preset-info-image');
            const infoText = document.getElementById('preset-info-text');
            
            infoImage.src = imagePath;
            infoImage.alt = `${artistName} Image`;
            infoText.textContent = textContent;
            
            // Show the info bar with animation
            infoBar.classList.add('visible');
        } catch (error) {
            ErrorHandler.log(error, 'Showing preset info', 'warn');
            // Hide the info bar if there's an error
            const infoBar = document.getElementById('preset-info-bar');
            infoBar.classList.remove('visible');
        }
    }
    
    // Apply preset data to the drum machine
    applyPresetData(presetData) {
        try {
            // Apply tempo if available
            if (presetData.tempo) {
                this.tempo = presetData.tempo;
                // Input value is managed by UI class, only update display
                document.getElementById('tempo-value').textContent = Math.round(this.tempo);
                this.ui.updateKnobRotation(this.tempo);
                
                if (this.isPlaying) {
                    this.sequencer.setTempo(this.tempo);
                }
            }
            
                // Apply swing settings if available
                if (presetData.swingEnabled !== undefined && presetData.swingAmount !== undefined) {
                    this.swingEnabled = presetData.swingEnabled;
                    this.swingAmount = presetData.swingAmount;
                    this.sequencer.setSwingEnabled(this.swingEnabled);
                    this.sequencer.setSwingAmount(this.swingAmount);
                    
                    // Update UI
                    if (this.swingEnabled) {
                        // Map swing amount (50-75%) terug naar knob value (0-100)
                        const knobValue = Math.round(((this.swingAmount - 50) / 25) * 100);
                        document.getElementById('swing-value').textContent = Math.round(this.swingAmount) + '%';
                        this.ui.updateSwingKnobRotation(knobValue);
                        
                        // Update the swing input value to match the knob position
                        document.getElementById('swing').value = knobValue;
                    } else {
                        document.getElementById('swing-value').textContent = 'Off';
                        this.ui.updateSwingKnobRotation(0);
                        document.getElementById('swing').value = 0;
                    }
                }
            
            // Apply sound mode if available
            if (presetData.soundMode) {
                this.soundMode = presetData.soundMode;
                this.ui.updateSoundModeUI(this.soundMode);
            }

            // Apply step mode if available
            const fileStepMode = presetData.stepMode || 16;
            this.stepMode = fileStepMode;
            this.sequencer.setTotalSteps(fileStepMode);
            this.ui.updateStepModeUI(fileStepMode);
            
            // Set current page (with validation)
            const filePage = presetData.currentPage || 0;
            const validPage = Math.min(filePage, this.sequencer.getTotalPages() - 1);
            this.sequencer.setCurrentPage(validPage);
            this.ui.updateCurrentPageUI(validPage, this.sequencer.getTotalPages());
            
            // Update auto-scroll checkbox based on step mode
            const autoScrollCheckbox = document.getElementById('auto-scroll-checkbox');
            if (fileStepMode > 16) {
                autoScrollCheckbox.disabled = false;
                
                // If auto-scroll setting is in the file, use it, otherwise default to true
                this.autoScrollEnabled = presetData.autoScrollEnabled !== undefined ? 
                    presetData.autoScrollEnabled : true;
                autoScrollCheckbox.checked = this.autoScrollEnabled;
            } else {
                autoScrollCheckbox.disabled = true;
                this.autoScrollEnabled = true;
                autoScrollCheckbox.checked = true;
            }
            
            // Apply the pattern
            this.sequencer.pattern = JSON.parse(JSON.stringify(presetData.pattern));
            
            // Apply track settings, including mute status if available
            this.ui.trackInfo = JSON.parse(JSON.stringify(presetData.trackSettings));
            
            // Version check - process mute info for newer versions
            const fileVersion = presetData.version || '1.0';
            
            // Load accent pattern if available (v1.2+)
            if (fileVersion >= '1.2' && presetData.accentPattern) {
                // Ensure accent pattern is always 64 steps long
                this.accentPattern = new Array(64).fill(false);
                // Copy the available accent steps
                presetData.accentPattern.forEach((value, index) => {
                    if (index < 64) {
                        this.accentPattern[index] = value;
                    }
                });
                
                if (presetData.accentAmount !== undefined) {
                    this.accentAmount = presetData.accentAmount;
                }
                if (presetData.normalVolumeReduction !== undefined) {
                    this.normalVolumeReduction = presetData.normalVolumeReduction;
                }
            } else {
                // Reset accent pattern for older versions
                this.accentPattern = new Array(64).fill(false);
            }
            

            
            // Update UI to reflect the new pattern and track settings
            this.ui.updatePatternUI(this.sequencer.pattern);
            this.ui.updateTrackSettingsUI();
            
            // Process mute status for versions 1.1+
            if (fileVersion >= '1.1') {
                this.ui.applyMuteStates();
            }
            
            // Update accent visual display
            this.ui.updateAllStepAccentClasses();
            
            // Save the new state to history
            this.saveToHistory();
            
            console.log(`Preset applied successfully (version ${fileVersion})`);
        } catch (error) {
            console.error('Error applying preset:', error);
            alert('Error applying preset. The preset data might be corrupted or in an incompatible format.');
        }
    }
    
    setupEventListeners() {
        // Play/Stop buttons
        document.getElementById('play-button').addEventListener('click', () => {
            this.togglePlay();
            if (!this.isPaused && this.isPlaying && typeof trackPlaySequencer === 'function') {
                trackPlaySequencer();
            }
        });
        document.getElementById('stop-button').addEventListener('click', () => this.stop());
        
        // Tempo control - wordt nu beheerd door de UI class
        // De range input events worden afgehandeld door de rotary knob functionaliteit
        
        // Sound mode buttons
        document.getElementById('mode-clean').addEventListener('click', () => {
            this.setSoundMode('clean');
            if (typeof trackSoundModeChange === 'function') {
                trackSoundModeChange('clean');
            }
        });
        document.getElementById('mode-sat').addEventListener('click', () => {
            this.setSoundMode('sat');
            if (typeof trackSoundModeChange === 'function') {
                trackSoundModeChange('sat');
            }
        });
        document.getElementById('mode-sat2').addEventListener('click', () => {
            this.setSoundMode('sat2');
            if (typeof trackSoundModeChange === 'function') {
                trackSoundModeChange('sat2');
            }
        });
        
        // Clear pattern button
        document.getElementById('clear-button').addEventListener('click', () => {
            this.clearPattern();
            if (typeof trackClearPattern === 'function') {
                trackClearPattern();
            }
        });
        
        // Undo/Redo buttons
        document.getElementById('undo-button').addEventListener('click', () => this.undo());
        document.getElementById('redo-button').addEventListener('click', () => this.redo());
        
        // Save/Load buttons
        document.getElementById('save-button').addEventListener('click', () => {
            this.savePattern();
            if (typeof trackSavePattern === 'function') {
                trackSavePattern();
            }
        });
        document.getElementById('load-button').addEventListener('click', () => {
            this.triggerFileSelector();
            // trackLoadPattern wordt aangeroepen wanneer een bestand daadwerkelijk wordt geladen
        });
        
        // Help button - opent de documentatie in een nieuw tabblad
        document.getElementById('help-button').addEventListener('click', () => {
            window.open('documentation.html', '_blank');
            if (typeof trackViewDocumentation === 'function') {
                trackViewDocumentation();
            }
        });
        
        // File input voor het laden van patronen
        const fileInput = document.getElementById('pattern-file-input');
        fileInput.addEventListener('change', (e) => {
            this.loadPattern(e);
            if (typeof trackLoadPattern === 'function') {
                trackLoadPattern();
            }
        });
        
        // Step mode controls
        document.getElementById('steps-16').addEventListener('click', () => this.setStepMode(16));
        document.getElementById('steps-32').addEventListener('click', () => this.setStepMode(32));
        document.getElementById('steps-64').addEventListener('click', () => this.setStepMode(64));
        
        // Page navigation controls
        document.getElementById('prev-page').addEventListener('click', () => this.navigateToPage(-1));
        document.getElementById('next-page').addEventListener('click', () => this.navigateToPage(1));
        
        // Swing control - wordt nu beheerd door de UI class
        // De range input events worden afgehandeld door de rotary knob functionaliteit
        
        // Auto-scroll toggle
        document.getElementById('auto-scroll-checkbox').addEventListener('change', (e) => {
            this.autoScrollEnabled = e.target.checked;
            
            // Update the audio scheduler if available
            if (this.sequencer.audioScheduler) {
                this.sequencer.audioScheduler.setAutoScroll(this.autoScrollEnabled);
            }
        });
        
        // Spatiebalk om te starten/stoppen/pauzeren
        window.addEventListener('keydown', (e) => {
            // Controleer of de spatiebalk is ingedrukt
            if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault(); // Voorkom scrollen
                this.togglePlay();
            }
            
            // Ctrl+Z: Undo laatste actie
            if ((e.ctrlKey || e.metaKey) && (e.code === "KeyZ" || e.keyCode === 90)) {
                e.preventDefault();
                this.undo();
            }
            
            // Ctrl+Y: Redo laatste ongedane actie
            if ((e.ctrlKey || e.metaKey) && (e.code === "KeyY" || e.keyCode === 89)) {
                e.preventDefault();
                this.redo();
            }
            
            // C: Clear pattern
            if (e.code === "KeyC" || e.keyCode === 67) {
                // Alleen reageren als er geen modifier keys zijn ingedrukt (niet tijdens copy/paste)
                if (!(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) {
                    e.preventDefault();
                    this.clearPattern();
                }
            }
        });
        
        // Tempo-knoppen voor verhogen/verlagen met 1
        const tempoPlus = document.getElementById('tempo-plus');
        const tempoMinus = document.getElementById('tempo-minus');
        
        // Verwijder ALLE click event listeners
        tempoPlus.replaceWith(tempoPlus.cloneNode(true));
        tempoMinus.replaceWith(tempoMinus.cloneNode(true));
        
        // Krijg de nieuwe DOM elementen (na replaceWith)
        const newTempoPlus = document.getElementById('tempo-plus');
        const newTempoMinus = document.getElementById('tempo-minus');
        
        // Voeg nieuwe event listeners toe met inline functies
        newTempoPlus.addEventListener('click', () => {
            console.log("Tempo plus clicked, current:", this.tempo);
            // Expliciete stap van exact 1 BPM
            const newTempo = Math.min(200, parseInt(this.tempo) + 1);
            this.setTempo(newTempo);
            console.log("Tempo after plus click:", this.tempo);
            if (typeof trackTempoChange === 'function') {
                trackTempoChange(this.tempo);
            }
        });
        
        newTempoMinus.addEventListener('click', () => {
            console.log("Tempo minus clicked, current:", this.tempo);
            // Expliciete stap van exact 1 BPM
            const newTempo = Math.max(50, parseInt(this.tempo) - 1);
            this.setTempo(newTempo);
            console.log("Tempo after minus click:", this.tempo);
            if (typeof trackTempoChange === 'function') {
                trackTempoChange(this.tempo);
            }
        });
        
        // Recording buttons
        document.getElementById('start-record-button').addEventListener('click', () => {
            this.startRecording();
            if (typeof trackStartRecording === 'function') {
                trackStartRecording();
            }
        });
        document.getElementById('stop-record-button').addEventListener('click', () => this.stopRecording());
        
        // MIDI Export button
        document.getElementById('export-midi-button').addEventListener('click', () => {
            this.exportMIDI();
            if (typeof trackMIDIExport === 'function') {
                trackMIDIExport();
            }
        });
        
        // Individual Track Export (Stems) button
        document.getElementById('export-stems-button').addEventListener('click', () => {
            this.exportIndividualTracks();
        });
    }
    
    // Set the step mode (16, 32, or 64 steps)
    setStepMode(steps) {
        if (![16, 32, 64].includes(steps)) {
            console.error('Invalid step count. Must be 16, 32, or 64.');
            return;
        }
        
        // Save to history before changing
        this.saveToHistory();
        
        // Backup the previous step count and total pages
        const previousStepMode = this.stepMode;
        const previousTotalPages = previousStepMode / 16;
        
        // Update step mode
        this.stepMode = steps;
        
        // Set auto-scroll behavior based on step mode
        // Auto-scroll is always enabled for 16 steps (single page)
        // For longer patterns (32 or 64 steps), we allow toggling
        if (steps === 16) {
            this.autoScrollEnabled = true;
            document.getElementById('auto-scroll-checkbox').checked = true;
            document.getElementById('auto-scroll-checkbox').disabled = true;
        } else {
            // Keep the current auto-scroll setting for 32/64 steps
            // But enable the checkbox so user can toggle
            document.getElementById('auto-scroll-checkbox').disabled = false;
        }
        
        // Update the sequencer
        this.sequencer.setTotalSteps(steps);
        
        // Kopieer de accent pattern op dezelfde manier als de normale steps
        this.copyAccentPatternForNewStepCount(previousStepMode, steps);
        
        // Update UI
        this.ui.updateStepModeButtons(steps);
        this.ui.updatePageControls();
        
        // If we're playing, make sure we're on the right page for the current step
        if (this.isPlaying) {
            const currentGlobalStep = this.sequencer.getCurrentGlobalStep();
            const newPage = Math.floor(currentGlobalStep / 16);
            
            if (this.autoScrollEnabled) {
                this.sequencer.setCurrentPage(newPage);
                this.ui.updatePageControls();
            }
        } else {
            // If not playing, reset to page 1
            this.sequencer.setCurrentPage(0);
            this.ui.updatePageControls();
        }
        
        // Update the steps visually after changing the step mode
        this.ui.updateStepsForCurrentPage();
    }
    
    // Kopieer accent pattern bij het veranderen van het aantal steps
    copyAccentPatternForNewStepCount(previousStepMode, newStepMode) {
        // If we're on the same step count, do nothing
        if (previousStepMode === newStepMode) return;
        
        // Handle different cases
        if (previousStepMode === 16 && newStepMode === 32) {
            // From 16 to 32: Copy page 1 to page 2
            this.accentPattern = this.sequencer.copyAccentPattern(this.accentPattern, 0, 1);
        } else if (previousStepMode === 16 && newStepMode === 64) {
            // From 16 to 64: Copy page 1 to all other pages
            this.accentPattern = this.sequencer.copyAccentPattern(this.accentPattern, 0, 1);
            this.accentPattern = this.sequencer.copyAccentPattern(this.accentPattern, 0, 2);
            this.accentPattern = this.sequencer.copyAccentPattern(this.accentPattern, 0, 3);
        } else if (previousStepMode === 32 && newStepMode === 64) {
            // From 32 to 64: Copy page 1 to page 3, page 2 to page 4
            this.accentPattern = this.sequencer.copyAccentPattern(this.accentPattern, 0, 2);
            this.accentPattern = this.sequencer.copyAccentPattern(this.accentPattern, 1, 3);
        }
        // No need to handle cases where we reduce the step count, as those steps will just be ignored
    }
    
    // Navigate to the previous or next page
    navigateToPage(direction) {
        const currentPage = this.sequencer.getCurrentPage();
        const totalPages = this.sequencer.getTotalPages();
        
        let newPage = currentPage + direction;
        
        // Ensure we stay within valid pages
        if (newPage < 0 || newPage >= totalPages) {
            return; // Don't wrap around, just ignore invalid navigation
        }
        
        // Set new page in sequencer - this only updates the VIEW, not the playback position
        this.sequencer.setCurrentPage(newPage);
        
        // Update UI to show the new page
        this.ui.updatePageControls();
        this.ui.updateStepsForCurrentPage();
    }
    
    // Handler for when sequencer automatically changes page during playback
    onPageChange(playbackPageIndex) {
        // If auto-scroll is enabled, update the VIEW to follow the PLAYBACK
        if (this.autoScrollEnabled) {
            // Update the current viewing page to match the playback position
            this.sequencer.setCurrentPage(playbackPageIndex);
            
            // Update the UI to reflect this page change
            this.ui.updatePageControls();
            this.ui.updateStepsForCurrentPage();
        }
        
        // Whether auto-scroll is on or off, we always need to update the time indicator
        // (it will only be visible if we're viewing the right page)
        this.ui.updateCurrentStep(this.sequencer.getCurrentStep());
    }
    
    // Handler for accent - now needs to check global step index
    isAccentActive(stepIndex) {
        // Calculate the global step index based on current page
        const globalStepIndex = this.sequencer.getGlobalStepIndex(stepIndex);
        
        // Check if the accent is active for this global step
        return this.accentPattern[globalStepIndex] || false;
    }
    
    // Toggle accent on/off for a step
    toggleAccent(stepIndex) {
        // Calculate the global step index based on current page
        const globalStepIndex = this.sequencer.getGlobalStepIndex(stepIndex);
        
        // Toggle the accent status
        this.accentPattern[globalStepIndex] = !this.accentPattern[globalStepIndex];
        
        // Return the new status
        return this.accentPattern[globalStepIndex];
    }
    

    
    togglePlay() {
        if (this.isPlaying && !this.isPaused) {
            // Als we aan het spelen zijn, pauzeer dan
            this.pause();
        } else if (this.isPaused) {
            // Als we gepauzeerd zijn, hervat dan
            this.resume();
        } else {
            // Anders, begin met spelen
            this.play();
        }
    }
    
    play() {
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.isPaused = false;
            
            // Update UI naar "pauze" state
            this.ui.updatePlayState(true);
            
            // Resume audio context if it's suspended (browser autoplay policy)
            if (this.sampleManager.audioContext.state === 'suspended') {
                this.sampleManager.audioContext.resume();
            }
            
            // Start sequencer vanaf stap 0
            this.sequencer.currentStep = 0;
            this.sequencer.start(this.tempo, this.onStep.bind(this));
            
            // Update de stop knop (enabled tijdens spelen)
            this.updateStopButtonState();
        }
    }
    
    pause() {
        if (this.isPlaying && !this.isPaused) {
            this.isPaused = true;
            
            // Pauzeer de sequencer zonder de huidige stap te resetten
            this.sequencer.pause();
            
            // Update UI naar "play" state (want je kunt weer op play drukken om te hervatten)
            this.ui.updatePlayState(false);
            
            // Update de stop knop (enabled tijdens pauze)
            this.updateStopButtonState();
        }
    }
    
    resume() {
        if (this.isPaused) {
            this.isPaused = false;
            this.isPlaying = true;
            
            // Update UI naar "pauze" state
            this.ui.updatePlayState(true);
            
            // Resume de sequencer vanaf de huidige stap
            this.sequencer.resume(this.tempo, this.onStep.bind(this));
            
            // Update de stop knop (enabled tijdens spelen)
            this.updateStopButtonState();
        }
    }
    
    stop() {
        if (this.isPlaying || this.isPaused) {
            this.isPlaying = false;
            this.isPaused = false;
            
            // Stop de sequencer (dit reset de huidige stap naar 0)
            this.sequencer.stop();
            
            // Update UI naar "play" state
            this.ui.updatePlayState(false);
            
            // Update de stop knop (disabled als niet aan het spelen)
            this.updateStopButtonState();
            
            // Reset huidige stap in UI
            this.ui.updateCurrentStep(-1);
        }
    }
    
    // Called when the sequencer advances to a new step
    onStep(stepIndex) {
        // Update UI to highlight current step
        this.ui.updateCurrentStep(stepIndex);
        
        // Check if we're using the modern scheduler
        if (this.sequencer.audioScheduler) {
            // Met de moderne scheduler wordt audio al gepland, dus we doen hier alleen UI updates
            // Geen audio playback hier - dat gebeurt al via de scheduled samples
        } else {
            // Legacy mode - play audio via old method
            this.playAudioForStep(stepIndex);
        }
        
        // If we're waiting to stop recording at the end of a pattern
        // and we've reached step 0 of any page, stop recording
        if (this.waitingToStopRecording && stepIndex === 0) {
            // Reset the flag
            this.waitingToStopRecording = false;
            
            // Complete the recording process
            this._finalizeRecording();
            
            // Remove waiting message
            const waitingText = document.querySelector('.waiting-text');
            if (waitingText) {
                waitingText.remove();
            }
        }
    }
    
    // Legacy audio playback method (only used when modern scheduler is not available)
    playAudioForStep(stepIndex) {
        // Get all active tracks for this step
        const activeTracks = this.sequencer.getActiveStepsForStep(stepIndex);
        
        // Calculate the global step index more efficiently
        const currentGlobalStep = this.sequencer.getCurrentGlobalStep();
        const globalStepIndex = (Math.floor(currentGlobalStep / 16) * 16) + stepIndex;
        
        // Check if this step is accented
        const isAccented = this.accentPattern[globalStepIndex] || false;
        
        // Controleer of zowel closed als open hi-hat actief zijn op deze stap
        const hasClosedHat = activeTracks['closedhat'];
        const hasOpenHat = activeTracks['openhat'];
        
        // Als beide actief zijn, maak een kopie van de activeSteps zonder de openhat
        let tracksToPlay = { ...activeTracks };
        if (hasClosedHat && hasOpenHat) {
            delete tracksToPlay['openhat']; // Verwijder openhat uit de lijst (choke prioriteit)
        }
        
        // Process all active tracks for this step
        for (const trackId in tracksToPlay) {
            // Get the track info from UI
            const trackInfo = this.ui.getTrackSampleInfo(trackId);
            
            // Skip if track is muted
            if (trackInfo.isMuted) continue;
            
            // Volume modification based on accent
            let volume = trackInfo.volume || 1.0;
            if (isAccented) {
                // Verhoog volume voor accented steps
                volume = volume * (1 + this.accentAmount);
            } else {
                // Verlaag volume een beetje voor normale steps
                volume = volume * this.normalVolumeReduction;
            }
            
            // Trigger the sound with appropriate volume
            this.sampleManager.playSample(
                trackInfo.type,
                trackInfo.number,
                this.soundMode,  // Juiste volgorde: mode parameter komt voor volume
                volume
            );
        }
    }
    
    // Update the state of the stop button based on playback state
    updateStopButtonState() {
        const stopButton = document.getElementById('stop-button');
        stopButton.disabled = !(this.isPlaying || this.isPaused);
    }
    
    // Change the tempo
    setTempo(value) {
        // Parse the input value to ensure it's a number
        const tempo = parseInt(value);
        
        // Validate and clamp the tempo
        this.tempo = Math.max(this.config.MIN_TEMPO, Math.min(this.config.MAX_TEMPO, tempo));
        
        // Update the UI
        // Update tempo display (input value is managed by UI class)
        document.getElementById('tempo-value').textContent = Math.round(this.tempo);
        
        // Rotate the tempo knob to match the new value
        this.ui.updateKnobRotation(this.tempo);
        
        // Update the sequencer tempo if already playing
        if (this.isPlaying) {
            this.sequencer.setTempo(this.tempo);
        }
    }
    
    // Set the swing amount
    setSwingAmount(value) {
        // Map from UI slider value (0-100) to actual swing amount (50-75%)
        this.swingAmount = 50 + (value / 100 * 25);
        
        // Clamp the swing amount between configured min-max
        this.swingAmount = Math.max(this.config.MIN_SWING, Math.min(this.config.MAX_SWING, this.swingAmount));
        
        // Update the swing value display
        document.getElementById('swing-value').textContent = Math.round(this.swingAmount) + '%';
        
        // Update the sequencer's swing amount
        this.sequencer.setSwingAmount(this.swingAmount);
    }
    
    // Set the sound mode
    setSoundMode(mode) {
        this.soundMode = mode;
        this.ui.updateSoundModeUI(mode);
    }
    
    // Toggle a step for a track
    toggleStep(trackId, stepIndex) {
        // Toggle the step in the sequencer
        const isActive = this.sequencer.toggleStep(trackId, stepIndex);
        
        // Save the change to history
        this.saveToHistory();
        
        return isActive;
    }
    
    // Check if a step is active
    isStepActive(trackId, stepIndex) {
        return this.sequencer.isStepActive(trackId, stepIndex);
    }
    
    // Clear the pattern
    clearPattern() {
        // Save the current state first (for undo)
        this.saveToHistory();
        
        // Reset the sequencer pattern
        this.sequencer.resetPattern();
        
        // Reset accent pattern
        this.accentPattern = new Array(64).fill(false);
        

        
        // Reset track settings (volume and variation) to defaults
        for (const trackId in this.ui.trackInfo) {
            // Set default volume to 1.0
            this.ui.trackInfo[trackId].volume = 1.0;
            
            // Set default variation to "01"
            this.ui.trackInfo[trackId].number = "01";
            
            // Reset mute status
            this.ui.trackInfo[trackId].isMuted = false;
            this.ui.trackInfo[trackId].originalVolume = undefined;
        }
        
        // Reset sound mode to clean
        this.setSoundMode('clean');
        
        // Reset step mode to 16 steps
        if (this.stepMode !== 16) {
            // We don't call setStepMode directly because it would create another history entry
            this.stepMode = 16;
            this.sequencer.setTotalSteps(16);
            this.ui.updateStepModeUI(16);
            
            // Reset page to first page
            this.sequencer.setCurrentPage(0);
            this.ui.updatePageControls();
        }
        
        // Reset swing to off
        this.swingEnabled = false;
        this.swingAmount = 50;
        this.sequencer.setSwingEnabled(false);
        this.sequencer.setSwingAmount(50);
        
        // Update swing UI
        document.getElementById('swing-value').textContent = 'Off';
        this.ui.updateSwingKnobRotation(0);
        
        // Reset auto-scroll to enabled
        this.autoScrollEnabled = true;
        const autoScrollCheckbox = document.getElementById('auto-scroll-checkbox');
        if (autoScrollCheckbox) {
            autoScrollCheckbox.checked = true;
            // Disable auto-scroll for 16 steps
            autoScrollCheckbox.disabled = true;
        }
        
        // Update the UI to reflect the empty pattern and reset settings
        this.ui.clearPatternUI();
        this.ui.updateTrackSettingsUI();
        this.ui.applyMuteStates();
        
        // Save the state again (after clearing the pattern)
        this.saveToHistory();
    }
    
    // Save current state to history for undo/redo
    saveToHistory() {
        // Get the current pattern state
        const currentState = this.getCurrentState();
        
        // If we're not at the end of the history, truncate history
        if (this.currentHistoryIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentHistoryIndex + 1);
        }
        
        // Add new state to history
        this.history.push(currentState);
        this.currentHistoryIndex = this.history.length - 1;
        
        // If history is too long, remove oldest states
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.currentHistoryIndex--;
        }
        
        // Update UI buttons
        this.updateHistoryButtons();
    }
    
    // Get current state of the drum machine
    getCurrentState() {
        // Create a state object with pattern, track settings, and accents
        return {
            pattern: JSON.parse(JSON.stringify(this.sequencer.pattern)),
            trackSettings: JSON.parse(JSON.stringify(this.ui.trackInfo)),
            soundMode: this.soundMode,
            accentPattern: [...this.accentPattern], // Accent pattern

            stepMode: this.stepMode, // Store step mode (16/32/64)
            currentPage: this.sequencer.getCurrentPage(), // Store current page
            version: '1.4', // Verhoogd versienummer voor Trigger Out functionaliteit
            autoScrollEnabled: this.autoScrollEnabled
        };
    }
    
    // Restore a state from history
    restoreState(state) {
        // Apply the pattern from the history
        this.sequencer.pattern = JSON.parse(JSON.stringify(state.pattern));
        
        // Apply the track settings from the history
        this.ui.trackInfo = JSON.parse(JSON.stringify(state.trackSettings));
        
        // Apply the sound mode from the history
        this.soundMode = state.soundMode;
        this.ui.updateSoundModeUI(this.soundMode);
        
        // Apply accent pattern if available
        if (state.accentPattern) {
            this.accentPattern = [...state.accentPattern];
        }
        

        
        // Apply step mode if available
        if (state.stepMode) {
            this.stepMode = state.stepMode;
            this.sequencer.setTotalSteps(this.stepMode);
            this.ui.updateStepModeUI(this.stepMode);
        }
        
        // Apply current page if available
        if (state.currentPage !== undefined) {
            this.sequencer.setCurrentPage(state.currentPage);
            this.ui.updateCurrentPageUI(state.currentPage, this.sequencer.getTotalPages());
        }
        
        // Apply auto-scroll setting if available
        if (state.autoScrollEnabled !== undefined) {
            this.autoScrollEnabled = state.autoScrollEnabled;
            document.getElementById('auto-scroll-checkbox').checked = this.autoScrollEnabled;
        }
        
        // Update the UI to reflect the pattern
        this.ui.updatePatternUI(this.sequencer.pattern);
        this.ui.updateTrackSettingsUI();
        this.ui.updateAllStepAccentClasses(); // Update accent visuele weergave
        
        console.log('State restored');
    }
    
    // Undo the last action
    undo() {
        if (this.currentHistoryIndex > 0) {
            this.currentHistoryIndex--;
            this.restoreState(this.history[this.currentHistoryIndex]);
            this.updateHistoryButtons();
        }
    }
    
    // Redo a previously undone action
    redo() {
        if (this.currentHistoryIndex < this.history.length - 1) {
            this.currentHistoryIndex++;
            this.restoreState(this.history[this.currentHistoryIndex]);
            this.updateHistoryButtons();
        }
    }
    
    // Update the state of undo/redo buttons
    updateHistoryButtons() {
        const undoButton = document.getElementById('undo-button');
        const redoButton = document.getElementById('redo-button');
        
        // Determine if we can undo/redo
        const canUndo = this.currentHistoryIndex > 0;
        const canRedo = this.currentHistoryIndex < this.history.length - 1;
        
        // Enable/disable undo button
        undoButton.disabled = !canUndo;
        
        // Enable/disable redo button
        redoButton.disabled = !canRedo;
        
        // Update the UI for the buttons (including LEDs)
        this.ui.updateHistoryButtonsUI(canUndo, canRedo);
    }
    
    // Sla het huidige patroon op als een JSON-bestand
    savePattern() {
        try {
            // Verzamel alle track informatie inclusief mute status
            const trackSettings = {};
            for (const trackId in this.ui.trackInfo) {
                const trackElement = document.querySelector(`.track-name[data-track-id="${trackId}"]`);
                const trackInfo = {...this.ui.trackInfo[trackId]};
                
                // Check of de track gemute is
                const isMuted = trackElement?.classList.contains('muted') || false;
                
                // Als gemute, voeg mute info toe
                if (isMuted) {
                    // Huidig volume is 0, maar we slaan ook het originele volume op
                    trackInfo.isMuted = true;
                    // Origineel volume uit het data attribuut (of behoud huidige als niet beschikbaar)
                    trackInfo.originalVolume = parseFloat(trackElement?.dataset.originalVolume || trackInfo.volume);
                }
                
                trackSettings[trackId] = trackInfo;
            }
            
            // CreÃ«er een volledig state object met alle instellingen
            const state = {
                tempo: this.tempo,
                swingEnabled: this.swingEnabled,
                swingAmount: this.swingAmount,
                soundMode: this.soundMode,
                pattern: this.sequencer.pattern,
                trackSettings: trackSettings,
                accentPattern: this.accentPattern, // Accent pattern toevoegen
                accentAmount: this.accentAmount, // Accent sterkte toevoegen
                normalVolumeReduction: this.normalVolumeReduction, // Volume reductie voor normale steps

                stepMode: this.stepMode, // Step mode (16/32/64)
                currentPage: this.sequencer.getCurrentPage(), // Current page
                version: '1.4', // Verhoogd versienummer voor Trigger Out functionaliteit
                autoScrollEnabled: this.autoScrollEnabled
            };
            
            // Converteer naar JSON string
            const jsonString = JSON.stringify(state, null, 2);
            
            // CreÃ«er een Blob object met de JSON data
            const blob = new Blob([jsonString], { type: 'application/json' });
            
            // CreÃ«er een URL voor de Blob
            const url = URL.createObjectURL(blob);
            
            // CreÃ«er een tijdelijke downloadlink
            const a = document.createElement('a');
            a.href = url;
            a.download = '808-pattern.json';
            
            // Simuleer een klik om het downloaden te starten
            document.body.appendChild(a);
            a.click();
            
            // Clean up
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('Pattern saved successfully');
        } catch (error) {
            console.error('Error saving pattern:', error);
            alert('Error saving pattern. Please try again.');
        }
    }
    
    // Trigger de bestandsselector om een patroon te laden
    triggerFileSelector() {
        document.getElementById('pattern-file-input').click();
    }
    
    // Laad een patroon uit een JSON-bestand
    loadPattern(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const state = JSON.parse(e.target.result);
                
                // Controleer of het een geldig state object is
                if (!state.pattern || !state.trackSettings) {
                    throw new Error('Invalid pattern file');
                }
                
                // Pas tempo aan als beschikbaar
                if (state.tempo) {
                    this.tempo = state.tempo;
                    // Input value is managed by UI class, only update display
                    document.getElementById('tempo-value').textContent = Math.round(this.tempo);
                    this.ui.updateKnobRotation(this.tempo);
                    
                    if (this.isPlaying) {
                        this.sequencer.setTempo(this.tempo);
                    }
                }
                
                // Pas swing instellingen aan als beschikbaar
                if (state.swingEnabled !== undefined && state.swingAmount !== undefined) {
                    this.swingEnabled = state.swingEnabled;
                    this.swingAmount = state.swingAmount;
                    this.sequencer.setSwingEnabled(this.swingEnabled);
                    this.sequencer.setSwingAmount(this.swingAmount);
                    
                    // Update UI
                    if (this.swingEnabled) {
                        // Map swing amount (50-75%) terug naar knob value (0-100)
                        const knobValue = Math.round(((this.swingAmount - 50) / 25) * 100);
                        document.getElementById('swing-value').textContent = Math.round(this.swingAmount) + '%';
                        this.ui.updateSwingKnobRotation(knobValue);
                        
                        // Update the swing input value to match the knob position
                        document.getElementById('swing').value = knobValue;
                    } else {
                        document.getElementById('swing-value').textContent = 'Off';
                        this.ui.updateSwingKnobRotation(0);
                        document.getElementById('swing').value = 0;
                    }
                }
                
                // Pas sound mode aan als beschikbaar
                if (state.soundMode) {
                    this.soundMode = state.soundMode;
                    this.ui.updateSoundModeUI(this.soundMode);
                }

                // Default to 16 steps for backward compatibility
                const fileStepMode = state.stepMode || 16;
                this.stepMode = fileStepMode;
                this.sequencer.setTotalSteps(fileStepMode);
                this.ui.updateStepModeUI(fileStepMode);
                
                // Set current page (with validation)
                const filePage = state.currentPage || 0;
                const validPage = Math.min(filePage, this.sequencer.getTotalPages() - 1);
                this.sequencer.setCurrentPage(validPage);
                this.ui.updateCurrentPageUI(validPage, this.sequencer.getTotalPages());
                
                // Update auto-scroll checkbox based on step mode
                const autoScrollCheckbox = document.getElementById('auto-scroll-checkbox');
                if (fileStepMode > 16) {
                    autoScrollCheckbox.disabled = false;
                    
                    // If auto-scroll setting is in the file, use it, otherwise default to true
                    this.autoScrollEnabled = state.autoScrollEnabled !== undefined ? 
                        state.autoScrollEnabled : true;
                    autoScrollCheckbox.checked = this.autoScrollEnabled;
                } else {
                    autoScrollCheckbox.disabled = true;
                    this.autoScrollEnabled = true;
                    autoScrollCheckbox.checked = true;
                }
                
                // Pas het patroon aan
                this.sequencer.pattern = JSON.parse(JSON.stringify(state.pattern));
                
                // Laad de track instellingen, inclusief mute status als beschikbaar
                this.ui.trackInfo = JSON.parse(JSON.stringify(state.trackSettings));
                
                // Version check - bij nieuwere versies (1.1+) verwerken we mute info
                // bij versie 1.2+ verwerken we accent info
                // bij versie 1.3+ verwerken we step mode info
                const fileVersion = state.version || '1.0';
                
                // Laad de accent pattern als beschikbaar (v1.2+)
                if (fileVersion >= '1.2' && state.accentPattern) {
                    // Ensure accent pattern is always 64 steps long
                    this.accentPattern = new Array(64).fill(false);
                    // Copy the available accent steps
                    state.accentPattern.forEach((value, index) => {
                        if (index < 64) {
                            this.accentPattern[index] = value;
                        }
                    });
                    
                    if (state.accentAmount !== undefined) {
                        this.accentAmount = state.accentAmount;
                    }
                    if (state.normalVolumeReduction !== undefined) {
                        this.normalVolumeReduction = state.normalVolumeReduction;
                    }
                } else {
                    // Reset accent pattern for older versions
                    this.accentPattern = new Array(64).fill(false);
                }
                

                
                // Update UI om het nieuwe patroon en track settings weer te geven
                this.ui.updatePatternUI(this.sequencer.pattern);
                this.ui.updateTrackSettingsUI();
                
                // Als versie 1.1 of hoger, verwerk de mute status
                if (fileVersion >= '1.1') {
                    this.ui.applyMuteStates();
                }
                
                // Update accent visuele weergave
                this.ui.updateAllStepAccentClasses();
                
                // Sla de nieuwe status op in de geschiedenis
                this.saveToHistory();
                
                console.log(`Pattern loaded successfully (version ${fileVersion})`);
            } catch (error) {
                console.error('Error loading pattern:', error);
                alert('Error loading pattern. The file might be corrupted or in an incompatible format.');
            }
        };
        
        reader.onerror = () => {
            console.error('Error reading file');
            alert('Error reading file. Please try again.');
        };
        
        reader.readAsText(file);
        
        // Reset de input waarde zodat dezelfde file opnieuw kan worden geladen
        event.target.value = '';
    }
    
    // Start recording
    startRecording() {
        if (this.isRecording) return;
        
        // Get the selected quality setting
        const qualitySelect = document.getElementById('recording-quality');
        const qualitySetting = qualitySelect.value;
        
        // Parse the selected quality
        const [bitDepth, sampleRate] = this.parseQualitySetting(qualitySetting);
        
        this.isRecording = true;
        // Set recording max time to configured value
        this.sampleManager.startRecording(bitDepth, sampleRate, this.config.MAX_RECORDING_TIME_SECONDS);
        
        // Update UI
        const startRecordButton = document.getElementById('start-record-button');
        startRecordButton.classList.add('recording');
        startRecordButton.disabled = true;
        
        const stopRecordButton = document.getElementById('stop-record-button');
        stopRecordButton.disabled = false;
        
        // Eerst naar pagina 0 navigeren en stop eventueel lopende playback
        if (this.isPlaying) {
            this.stop();
        }
        
        // Navigeer naar pagina 0 en update UI
        this.sequencer.setCurrentPage(0);
        this.ui.updatePageControls();
        this.ui.updateStepsForCurrentPage();
        
        // Automatically start playback from step 0 of page 0
        this.play();
        
        // Set a timeout to stop recording after 5 minutes
        this.recordingTimeout = setTimeout(() => {
            if (this.isRecording) {
                this.stopRecording();
            }
        }, 300000); // 5 minutes in milliseconds
    }
    
    // Stop recording
    async stopRecording() {
        if (!this.isRecording) return;
        
        // Clear the timeout if it exists
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
            this.recordingTimeout = null;
        }

        // Maak een flag om aan te geven dat we willen stoppen na het huidige patroon
        this.waitingToStopRecording = true;
        
        // Update UI om te laten zien dat we wachten op het einde van het patroon
        const stopRecordButton = document.getElementById('stop-record-button');
        stopRecordButton.disabled = true;
        
        // Voeg een wachttekst toe boven de recording-section
        const recordingSection = document.querySelector('.recording-section');
        let waitingText = document.querySelector('.waiting-text');
        
        if (!waitingText) {
            waitingText = document.createElement('div');
            waitingText.className = 'waiting-text';
            waitingText.textContent = 'Waiting for pattern end...';
            recordingSection.insertBefore(waitingText, recordingSection.firstChild);
        }
        
        // We stoppen niet direct, maar laten de onStep functie de opname stoppen
        // wanneer we bij stap 0 komen (begin van een nieuw patroon)
    }
    
    // Nieuwe privÃ© methode om de opname daadwerkelijk te stoppen
    async _finalizeRecording() {
        // Wacht een korte tijd om ervoor te zorgen dat de laatste samples volledig worden opgenomen
        // 60ms zou genoeg moeten zijn om het probleem van 0.06 seconden te vroeg stoppen op te lossen
        await new Promise(resolve => setTimeout(resolve, 60));
        
        // Pass the current tempo to include in the filename
        await this.sampleManager.stopRecording(this.tempo);
        this.isRecording = false;
        
        // Update UI
        const startRecordButton = document.getElementById('start-record-button');
        startRecordButton.classList.remove('recording');
        startRecordButton.disabled = false;
        
        const stopRecordButton = document.getElementById('stop-record-button');
        stopRecordButton.disabled = false;
        
        // Also stop the sequencer
        this.stop();
    }
    
    // Parse the quality setting into bit depth and sample rate
    parseQualitySetting(qualitySetting) {
        const parts = qualitySetting.split('-');
        const bitDepth = parseInt(parts[0]);
        const sampleRate = parseFloat(parts[1]) * 1000; // Convert to Hz
        
        return [bitDepth, sampleRate];
    }
    
    // Export pattern as MIDI file
    exportMIDI() {
        // Get the selected export target
        const exportTarget = document.getElementById('midi-export-target').value;
        
        // Check if we have a mapping for this target
        if (!this.midiMappings[exportTarget]) {
            console.error(`No MIDI mapping available for ${exportTarget}`);
            alert('Sorry, MIDI mapping for this target is not yet implemented.');
            return;
        }
        
        const mapping = this.midiMappings[exportTarget];
        
        // Create MIDI data using jsmidgen
        const midiData = this.createMIDIFileWithJsmidgen(mapping, exportTarget);
        
        // Generate a filename based on the export target
        let filename;
        if (exportTarget === 'behringer-rd8') {
            filename = `Lloyd-Stellar-808-Beat-for-RD8-${this.tempo}BPM.mid`;
        } else if (exportTarget === 'roland-tr08') {
            filename = `Lloyd-Stellar-808-Beat-for-TR08-${this.tempo}BPM.mid`;
        } else if (exportTarget === 'acidlab-miami') {
            filename = `Lloyd-Stellar-808-Beat-for-Miami-${this.tempo}BPM.mid`;
        } else if (exportTarget === 'elicktronic-yocto') {
            filename = `Lloyd-Stellar-808-Beat-for-Yocto-${this.tempo}BPM.mid`;
        } else {
            filename = `Lloyd-Stellar-808-Beat-${this.tempo}BPM.mid`;
        }
        
        // Create a download link
        const downloadLink = document.createElement('a');
        downloadLink.href = midiData;
        downloadLink.download = filename;
        
        // Trigger the download
        downloadLink.click();
        
        // Log met specifieke export target naam
        const exportTargetNames = {
            'ableton-808-core': 'Ableton Live 808 Core Kit',
            'behringer-rd8': 'Behringer RD-8 Hardware Drum Machine',
            'roland-tr08': 'Roland TR-08 Hardware Drum Machine',
            'acidlab-miami': 'AcidLab Miami Hardware Drum Machine',
            'elicktronic-yocto': 'E-licktronic Yocto Hardware Drum Machine'
        };
        
        const targetName = exportTargetNames[exportTarget] || exportTarget;
        console.log(`MIDI file exported for ${targetName} with ${this.tempo} BPM`);
    }
    
    // Export Individual Tracks (Stems) as WAV files
    async exportIndividualTracks() {
        // Get quality settings
        const qualitySelect = document.getElementById('stem-export-quality');
        const [bitDepth, sampleRate] = qualitySelect.value.split('-').map((val, idx) => 
            idx === 0 ? parseInt(val) : parseFloat(val) * 1000
        );
        
        // Find all tracks with active steps
        const activeTracks = this.getActiveTracksForExport();
        
        if (activeTracks.length === 0) {
            alert('No active tracks to export. Please create a pattern first.');
            return;
        }
        
        // Show progress popup
        const progressPopup = document.getElementById('export-progress-popup');
        const currentTrackElement = document.getElementById('export-current-track');
        const progressBar = document.getElementById('export-progress-bar');
        const progressText = document.getElementById('export-progress-text');
        
        progressPopup.classList.add('active');
        
        // Calculate total steps to export (always 64)
        const targetSteps = 64;
        const repetitions = targetSteps / this.stepMode;
        
        try {
            // Export each active track
            for (let i = 0; i < activeTracks.length; i++) {
                const track = activeTracks[i];
                const progress = Math.round((i / activeTracks.length) * 100);
                
                // Update progress UI
                currentTrackElement.textContent = `Exporting: ${track.label}`;
                progressBar.style.width = progress + '%';
                progressText.textContent = progress + '%';
                
                // Export this track
                await this.exportSingleTrack(track, bitDepth, sampleRate, repetitions);
                
                // Small delay to allow UI to update
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Final progress update
            currentTrackElement.textContent = 'Export complete!';
            progressBar.style.width = '100%';
            progressText.textContent = '100%';
            
            // Hide popup after a short delay
            setTimeout(() => {
                progressPopup.classList.remove('active');
            }, 1500);
            
        } catch (error) {
            console.error('Error during stem export:', error);
            alert('An error occurred during export. Please try again.');
            progressPopup.classList.remove('active');
        }
    }
    
    // Get list of tracks that have active steps
    getActiveTracksForExport() {
        const activeTracks = [];
        const drumSounds = this.sampleManager.getDrumSoundsList();
        
        for (const [trackId, info] of Object.entries(drumSounds)) {
            // Check if this track has any active steps
            const hasActiveSteps = this.sequencer.pattern[trackId] && 
                                   this.sequencer.pattern[trackId].some(step => step);
            
            if (hasActiveSteps) {
                // Get track settings from UI
                const trackInfo = this.ui.getTrackSampleInfo(trackId);
                
                activeTracks.push({
                    id: trackId,
                    label: info.label,
                    abbreviation: this.getTrackAbbreviation(info.label),
                    type: trackInfo.type,
                    sampleNumber: trackInfo.number,
                    volume: trackInfo.volume,
                    isMuted: trackInfo.isMuted,
                    pattern: this.sequencer.pattern[trackId]
                });
            }
        }
        
        return activeTracks;
    }
    
    // Get abbreviation from track label
    getTrackAbbreviation(label) {
        const match = label.match(/\(([^)]+)\)/);
        return match ? match[1] : label.substring(0, 2).toUpperCase();
    }
    
    // Export a single track as WAV
    async exportSingleTrack(track, bitDepth, sampleRate, repetitions) {
        if (track.isMuted) {
            // Skip muted tracks
            return;
        }
        
        // Create the filename
        const filename = `${track.abbreviation}-${this.tempo}BPM-lloydstellar.nl.wav`;
        
        // Calculate the exact duration for 64 steps
        const stepDuration = 60 / this.tempo / 4; // Duration of one 16th note
        const totalDuration = stepDuration * 64; // Always 64 steps
        
        // Generate the audio for this track
        const audioBuffer = await this.sampleManager.renderTrackToBuffer(
            track,
            this.stepMode,
            repetitions,
            this.tempo,
            this.swingAmount,
            this.swingEnabled,
            this.accentPattern,
            this.accentAmount,
            this.normalVolumeReduction,
            this.soundMode,
            sampleRate,
            totalDuration
        );
        
        // Convert to WAV and download
        const wavBlob = this.sampleManager.audioBufferToWav(audioBuffer, bitDepth);
        
        // Create download link
        const url = URL.createObjectURL(wavBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        
        // Clean up
        URL.revokeObjectURL(url);
    }
    
    // Create MIDI file using jsmidgen library (volledig opnieuw geschreven voor exacte timing)
    createMIDIFileWithJsmidgen(mapping, exportTarget) {
        try {
            // Standard MIDI File timing constanten
            const TICKS_PER_BEAT = 128; // jsmidgen standaard
            const TICKS_PER_BAR = TICKS_PER_BEAT * 4; // 4/4 maat = 4 beats
            
            // Aantal stappen in het patroon
            const totalSteps = this.stepMode;
            
            // Bepaal hoeveel maten we nodig hebben (16 stappen = 1 maat)
            const barsNeeded = totalSteps / 16;
            
            console.log(`Exporteren van ${totalSteps} stappen (${barsNeeded} maten)`);
            
            // Maak een nieuw MIDI bestand
            const file = new jsmidgen.File();
            
            // Maak een track voor de drums
            const track = new jsmidgen.Track();
            file.addTrack(track);
            
            // Stel het tempo in
            track.setTempo(this.tempo);
            
            // MIDI kanaal 10 (index 9) voor drums volgens General MIDI standaard
            const channel = 9; // 9 = kanaal 10 (drums)
            
            // Maak mapping van tracknamen naar MIDI noten
            const trackToNoteMap = this.createTrackToNoteMapping(mapping);
            
            // BELANGRIJKE NIEUWE AANPAK: we verzamelen eerst alle events met absolute tijdstippen
            // en gaan ze pas later in de vereiste delta-time format omzetten
            const allEvents = [];
            
            // Functie om events toe te voegen aan onze verzameling
            const addEvent = (type, tick, note, velocity = 90) => {
                allEvents.push({
                    type: type, // 'noteOn' of 'noteOff'
                    tick: tick,
                    note: note,
                    velocity: velocity
                });
            };
            
            // Loop door alle stappen en instrumenten om NoteOn en NoteOff events te verzamelen
            for (let step = 0; step < totalSteps; step++) {
                // Bereken de exacte tick positie voor deze stap (16 stappen per maat)
                // Dit zorgt ervoor dat de events precies in het juiste aantal maten passen
                const stepsPerMaat = 16;
                const ticksPerStep = TICKS_PER_BAR / stepsPerMaat;
                const tickPosition = Math.floor(step * ticksPerStep);
                
                // Doorloop alle instrumenten
                for (const trackName in this.sequencer.pattern) {
                    // Skip numerieke keys (legacy indexen)
                    if (!isNaN(trackName)) continue;
                    
                    // Skip tracks zonder pattern data
                    if (!this.sequencer.pattern[trackName]) continue;
                    
                    // Haal track info op uit de UI
                    const trackInfo = this.ui.getTrackSampleInfo(trackName);
                    
                    // Skip als de track gemute is
                    if (trackInfo.isMuted) continue;
                    
                    // Als deze stap actief is voor dit instrument
                    if (this.sequencer.pattern[trackName][step]) {
                        // Bepaal de MIDI noot voor dit instrument
                        const midiNote = trackToNoteMap[trackName];
                        
                        // Skip als we geen mapping hebben
                        if (!midiNote) {
                            console.warn(`No MIDI mapping found for track: ${trackName}`);
                            continue;
                        }
                        
                        // Bepaal of deze stap geaccentueerd is
                        const globalStep = this.sequencer.getGlobalStepIndex(step);
                        const isAccented = this.accentPattern[globalStep];
                        
                        // Pas volume aan op basis van accent en track volume
                        let baseVelocity = trackInfo.volume ? Math.round(trackInfo.volume * 90) : 90;
                        baseVelocity = Math.max(1, Math.min(127, baseVelocity)); // Begrens tussen 1-127
                        
                        // Verhoog volume voor geaccentueerde steps - voor MIDI export gebruiken we kleinere verschillen
                        let velocity;
                        if (isAccented) {
                            // Voor AcidLab Miami: velocity > 100 activeert accent
                            if (exportTarget === 'acidlab-miami') {
                                // Gebruik minimaal 101 voor accent
                                velocity = Math.max(101, Math.min(127, Math.round(baseVelocity * 1.25)));
                            } else {
                                // Voor andere platforms: accentverhoging beperken tot 10%
                                velocity = Math.min(127, Math.round(baseVelocity * 1.10));
                            }
                        } else {
                            // Voor AcidLab Miami: zorg dat velocity <= 100 blijft
                            if (exportTarget === 'acidlab-miami') {
                                velocity = Math.min(100, Math.round(baseVelocity * 0.95));
                            } else {
                                // Voor MIDI export: normale steps op 95% 
                                velocity = Math.max(1, Math.round(baseVelocity * 0.95));
                            }
                        }
                        
                        // Bepaal de lengte voor dit specifieke instrument
                        // (open hihat klinkt langer dan andere drums)
                        const noteDuration = trackName === 'openhat' ? 24 : 10;
                        
                        // NoteOn en NoteOff events toevoegen met absolute tick posities
                        addEvent('noteOn', tickPosition, midiNote, velocity);
                        addEvent('noteOff', tickPosition + noteDuration, midiNote);
                        
                        console.log(`Added ${trackName} (note ${midiNote}) at step ${step}, velocity ${velocity}, tick ${tickPosition}`);
                    }
                }
            }
            
            // Als er geen events zijn, voeg een test patroon toe
            if (allEvents.length === 0) {
                console.log("No notes found in pattern, adding a test pattern");
                
                // Basis 4/4 patroon met kick, snare en hihat
                const kickPositions = [0, TICKS_PER_BEAT * 2]; // Tel 1 en 3
                const snarePositions = [TICKS_PER_BEAT, TICKS_PER_BEAT * 3]; // Tel 2 en 4
                
                // Kick drum op tel 1 en 3
                kickPositions.forEach(pos => {
                    addEvent('noteOn', pos, 36, 100); // Bass Drum
                    addEvent('noteOff', pos + 10, 36);
                });
                
                // Snare op tel 2 en 4
                snarePositions.forEach(pos => {
                    addEvent('noteOn', pos, 38, 100); // Snare
                    addEvent('noteOff', pos + 10, 38);
                });
                
                // Hi-hat op elke 8e noot
                for (let i = 0; i < 8; i++) {
                    const pos = i * (TICKS_PER_BEAT / 2);
                    addEvent('noteOn', pos, 42, 80); // Closed HiHat
                    addEvent('noteOff', pos + 10, 42);
                }
            }
            
            // Sorteer alle events op tick (tijdstip) zodat ze in de juiste volgorde komen
            allEvents.sort((a, b) => a.tick - b.tick);
            
            // Nu gaan we de gesorteerde events omzetten naar het MIDI bestand
            // met de juiste delta times tussen opeenvolgende events
            let currentTick = 0;
            
            for (const event of allEvents) {
                // Bereken delta time sinds vorige event
                const deltaTime = event.tick - currentTick;
                currentTick = event.tick;
                
                // Voeg het event toe aan de track met de juiste delta time
                if (event.type === 'noteOn') {
                    track.addNoteOn(channel, event.note, deltaTime, event.velocity);
                } else if (event.type === 'noteOff') {
                    track.addNoteOff(channel, event.note, deltaTime);
                }
            }
            
            // Converteer naar bytes
            const midiString = file.toBytes();
            
            // Converteer naar base64 data URI
            const base64String = btoa(midiString);
            const dataUri = `data:audio/midi;base64,${base64String}`;
            
            console.log(`MIDI file created successfully with ${allEvents.length / 2} notes in ${barsNeeded} bars`);
            return dataUri;
            
        } catch (error) {
            console.error("Error creating MIDI file:", error);
            alert("Er is een fout opgetreden bij het maken van het MIDI bestand.");
            return null;
        }
    }
    
    // Hulpfunctie om een mapping te maken van tracknamen naar MIDI noten
    createTrackToNoteMapping(mapping) {
        const trackToNoteMap = {};
        
        // Analyseer tracknamen in het pattern om de juiste mapping te vinden
        for (let trackId in this.sequencer.pattern) {
            if (isNaN(trackId)) { // Alleen string keys (track namen)
                // Bepaal het juiste instrument uit de mapping of gebruik fallback
                let midiNote;
                
                if (trackId === 'kick') midiNote = mapping['Bass Drum'];
                else if (trackId === 'snare') midiNote = mapping['Snare Drum'];
                else if (trackId === 'closedhat') midiNote = mapping['Closed Hi Hat'];
                else if (trackId === 'openhat') midiNote = mapping['Open Hi Hat'];
                else if (trackId === 'clap') midiNote = mapping['Hand Clap'];
                else if (trackId === 'rim') midiNote = mapping['Rim Shot'];
                else if (trackId === 'cowbell') midiNote = mapping['Cowbell'];
                else if (trackId === 'clave') midiNote = mapping['Claves'];
                else if (trackId === 'maracas') midiNote = mapping['Maracas'];
                else if (trackId === 'hitom') midiNote = mapping['Hi Tom'];
                else if (trackId === 'midtom') midiNote = mapping['Mid Tom'];
                else if (trackId === 'lotom') midiNote = mapping['Low Tom'];
                else if (trackId === 'crash') midiNote = mapping['Cymbal'];
                else if (trackId === 'triggerout') midiNote = 37; // Side Stick (closest to trigger out)
                else midiNote = mapping[trackId] || 36; // Fallback
                
                trackToNoteMap[trackId] = midiNote;
                console.log(`Mapped track "${trackId}" to MIDI note ${midiNote}`);
            }
        }
        
        return trackToNoteMap;
    }
}

// Initialize the drum machine when the page loads
window.drumMachine = new DrumMachine();

// Export the class
export { DrumMachine };

