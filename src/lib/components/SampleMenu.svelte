<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { selectionStore } from '$lib/stores/selectionStore';
	import { engineStore } from '$lib/stores/engineStore';
	import { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import type { Pattern, Instrument, StandaloneInstrument } from '$lib/types/pattern';
	import { uploadSample, getProjectSamples, loadSampleAudio, deleteSample, type SampleMetadata } from '$lib/utils/sampleStorage';
	import { loadSampleToEngine } from '$lib/utils/sampleLoader';
	import { page } from '$app/stores';
	
	let project: any;
	let selectedPatternId: string | null = null;
	
	projectStore.subscribe((p) => (project = p));
	selectionStore.subscribe((s) => (selectedPatternId = s.selectedPatternId));
	
	// Subscribe to engine store - keep subscription active so it updates reactively
	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));
	
	// Get pattern ID from URL if we're in pattern editor
	const patternIdFromUrl = $derived($page.params.patternId || null);
	
	// Get current pattern from selection or URL
	const pattern = $derived.by(() => {
		// Try selection store first
		if (selectedPatternId && project?.patterns) {
			const found = project.patterns.find((p: Pattern) => p.id === selectedPatternId);
			if (found) return found;
		}
		// Fallback to URL pattern ID
		if (patternIdFromUrl && project?.patterns) {
			return project.patterns.find((p: Pattern) => p.id === patternIdFromUrl) || null;
		}
		return null;
	});
	
	let isOpen = $state(false);
	let samples = $state<SampleMetadata[]>([]);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let errorMessage = $state<string | null>(null);
	let previewingSampleId: string | null = $state(null);
	let previewAudioContext: AudioContext | null = null;
	let previewSource: AudioBufferSourceNode | null = null;
	
	// Load samples when menu opens
	async function openMenu() {
		if (!project) return;
		
		// Simple solution: trigger a quick play/pause to initialize the engine
		// This is what happens when the user manually plays, and it makes the engine "ready"
		let currentEngine: EngineWorklet | null = null;
		engineStore.subscribe((e) => (currentEngine = e))();
		
		if (currentEngine) {
			try {
				const engineForInit: EngineWorklet = currentEngine;
				await engineForInit.resume();
				
				// Load project first (same as togglePlayback does)
				const currentBpm = project.bpm ?? 120;
				const currentPath = window.location.pathname;
				const patternMatch = currentPath.match(/\/project\/[^/]+\/pattern\/([^/]+)/);
				
				if (patternMatch && pattern) {
					// Pattern editor mode - load pattern instruments
					const { projectStore } = await import('$lib/stores/projectStore');
					const patternInstruments = projectStore.getPatternInstruments(pattern);
					const patternTracks = patternInstruments.map((instrument) => ({
						id: `__pattern_${pattern.id}_${instrument.id}`,
						projectId: pattern.projectId,
						instrumentType: instrument.instrumentType || 'kick',
						patternTree: instrument.patternTree,
						settings: instrument.settings || {},
						instrumentSettings: instrument.instrumentSettings || {},
						volume: instrument.volume ?? 1.0,
						pan: instrument.pan ?? 0.0,
						color: instrument.color || '#7ab8ff',
						mute: (pattern.mute ?? false) || (instrument.mute ?? false),
						solo: instrument.solo ?? false
					}));
					const allTracks = [...(project.standaloneInstruments || []), ...patternTracks];
					await engineForInit.loadProject(allTracks, currentBpm, patternTracks[0]?.id || project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
				} else {
					// Regular mode
					await engineForInit.loadProject(project.standaloneInstruments || [], currentBpm, project.baseMeterTrackId, undefined, project.patterns, project.effects, project.envelopes, project.automation);
				}
				
				// Quick play/pause to initialize
				engineForInit.setTransport('play', 0);
				await new Promise(resolve => setTimeout(resolve, 10)); // Very brief
				engineForInit.setTransport('stop', 0);
			} catch (error) {
				// If engine isn't ready yet, that's okay - user can still try to add samples
				console.warn('Could not initialize engine for sample menu:', error);
			}
		}
		
		isOpen = true;
		await loadSamples();
	}
	
	async function loadSamples() {
		if (!project) return;
		samples = await getProjectSamples(project.id);
	}
	
	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0 || !project || !pattern) return;
		
		isUploading = true;
		errorMessage = null;
		uploadProgress = 0;
		
		try {
			for (const file of Array.from(files)) {
				// Validate file type
				if (!file.type.startsWith('audio/')) {
					errorMessage = `${file.name} is not an audio file`;
					continue;
				}
				
				// Upload sample
				const result = await uploadSample(file, project.id);
				
				if (result.success && result.sample) {
					// Reload samples list
					await loadSamples();
					uploadProgress = 100;
				} else {
					errorMessage = result.error || 'Failed to upload sample';
				}
			}
		} catch (error: any) {
			errorMessage = error.message || 'Failed to upload sample';
		} finally {
			isUploading = false;
			uploadProgress = 0;
			// Reset file input
			if (input) input.value = '';
		}
	}
	
	async function addSampleToPattern(sample: SampleMetadata) {
		if (!project) {
			errorMessage = 'No project loaded';
			return;
		}
		
		// Get pattern from URL or selection
		const currentPattern = pattern;
		if (!currentPattern) {
			errorMessage = 'No pattern selected. Please make sure you are in a pattern editor.';
			return;
		}
		
		// Get engine directly from store (same pattern as engineStore.updateTrack)
		// This gets the current value synchronously, not relying on subscription variable
		let currentEngine: EngineWorklet | null = null;
		engineStore.subscribe((e) => (currentEngine = e))();
		
		// If not available, wait for Toolbar to initialize it
		if (!currentEngine) {
			let retries = 0;
			const maxRetries = 30; // 3 seconds
			while (!currentEngine && retries < maxRetries) {
				await new Promise(resolve => setTimeout(resolve, 100));
				// Get fresh value from store each time
				engineStore.subscribe((e) => (currentEngine = e))();
				retries++;
			}
		}
		
		if (!currentEngine) {
			errorMessage = 'Audio engine not initialized. Please wait a moment and try again.';
			return;
		}
		
		try {
			// Load the audio buffer
			const audioBuffer = await loadSampleAudio(sample.id);
			if (!audioBuffer) {
				errorMessage = 'Failed to load sample audio';
				return;
			}
			
			// Convert to mono Float32Array
			const monoBuffer = audioBuffer.numberOfChannels > 1
				? convertToMono(audioBuffer)
				: new Float32Array(audioBuffer.getChannelData(0));
			
			// Extract filename without extension for display name
			const fileNameWithoutExt = sample.fileName.replace(/\.[^/.]+$/, '');
			
			// Create new instrument with sample type
			const newInstrument: Instrument = {
				id: crypto.randomUUID(),
				instrumentType: 'sample',
				patternTree: {
					id: crypto.randomUUID(),
					division: 4,
					x: 400 + Math.random() * 200,
					y: 200 + Math.random() * 100,
					children: []
				},
				settings: {
					sampleId: sample.id,
					fileName: sample.fileName,
					displayName: fileNameWithoutExt, // Store display name in settings
					duration: sample.duration,
					sampleRate: sample.sampleRate
				},
				instrumentSettings: undefined,
				color: '#9b59b6', // Purple color for samples
				volume: 1.0,
				pan: 0.0,
				mute: false,
				solo: false
			};
			
			// Add instrument to pattern
			projectStore.addPatternInstrument(currentPattern.id, newInstrument);
			
			// Select the new instrument
			selectionStore.selectNode(newInstrument.patternTree.id, null, true, false, currentPattern.id, newInstrument.id);
			
			// Load sample to engine
			const patternTrackId = `__pattern_${currentPattern.id}_${newInstrument.id}`;
			await loadSampleToEngine(currentEngine, patternTrackId, monoBuffer, sample.sampleRate);
			
			// Update engine with the new track
			// Capture engine reference - use a const assertion to preserve type
			const engineForUpdate = currentEngine as EngineWorklet;
			setTimeout(() => {
				if (!engineForUpdate) return;
				
				let currentProject: any = null;
				projectStore.subscribe((p) => (currentProject = p))();
				if (!currentProject) return;
				
				const updatedPattern = currentProject.patterns?.find((p: Pattern) => p.id === currentPattern.id);
				if (!updatedPattern) return;
				
				const updatedInstruments = updatedPattern.instruments && Array.isArray(updatedPattern.instruments) && updatedPattern.instruments.length > 0
					? updatedPattern.instruments
					: [];
				
				const updatedInstrument = updatedInstruments.find((inst: Instrument) => inst.id === newInstrument.id);
				if (!updatedInstrument) return;
				
				const trackForEngine: StandaloneInstrument = {
					id: patternTrackId,
					projectId: currentPattern.projectId,
					instrumentType: 'sample',
					patternTree: updatedInstrument.patternTree,
					settings: updatedInstrument.settings || {},
					instrumentSettings: updatedInstrument.instrumentSettings,
					volume: updatedInstrument.volume ?? 1.0,
					pan: updatedInstrument.pan ?? 0.0,
					color: updatedInstrument.color,
					mute: updatedInstrument.mute ?? false,
					solo: updatedInstrument.solo ?? false
				};
				
				engineForUpdate.updateTrack(patternTrackId, trackForEngine);
			}, 0);
			
			// Close menu
			isOpen = false;
		} catch (error: any) {
			errorMessage = error.message || 'Failed to add sample to pattern';
		}
	}
	
	async function handleDeleteSample(sample: SampleMetadata, event: Event) {
		event.stopPropagation();
		if (!confirm(`Delete "${sample.fileName}"?`)) return;
		
		const result = await deleteSample(sample.id);
		if (result.success) {
			await loadSamples();
		} else {
			errorMessage = result.error || 'Failed to delete sample';
		}
	}
	
	// Convert stereo/multi-channel audio to mono
	function convertToMono(audioBuffer: AudioBuffer): Float32Array {
		const numChannels = audioBuffer.numberOfChannels;
		const length = audioBuffer.length;
		const mono = new Float32Array(length);
		
		for (let i = 0; i < length; i++) {
			let sum = 0;
			for (let ch = 0; ch < numChannels; ch++) {
				sum += audioBuffer.getChannelData(ch)[i];
			}
			mono[i] = sum / numChannels;
		}
		
		return mono;
	}
	
	function formatDuration(seconds: number): string {
		if (seconds < 1) {
			return `${Math.round(seconds * 1000)}ms`;
		}
		return `${seconds.toFixed(2)}s`;
	}
	
	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}
	
	async function previewSample(sample: SampleMetadata, event: Event) {
		event.stopPropagation();
		
		// Stop any currently playing preview
		if (previewSource) {
			try {
				previewSource.stop();
			} catch (e) {
				// Already stopped
			}
			previewSource = null;
		}
		
		// If clicking the same sample, just stop it
		if (previewingSampleId === sample.id) {
			previewingSampleId = null;
			return;
		}
		
		try {
			previewingSampleId = sample.id;
			
			// Create audio context if needed
			if (!previewAudioContext) {
				previewAudioContext = new AudioContext();
			}
			
			// Load and play the sample
			const audioBuffer = await loadSampleAudio(sample.id);
			if (!audioBuffer) {
				previewingSampleId = null;
				return;
			}
			
			const source = previewAudioContext.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(previewAudioContext.destination);
			
			source.onended = () => {
				previewingSampleId = null;
				previewSource = null;
			};
			
			previewSource = source;
			source.start(0);
		} catch (error) {
			console.error('Error previewing sample:', error);
			previewingSampleId = null;
		}
	}
</script>

<button 
	class="sample-menu-btn" 
	onclick={openMenu}
	title="Open sample menu"
>
	Samples
</button>

{#if isOpen}
	<div 
		class="sample-menu-overlay" 
		role="button" 
		tabindex="0"
		onclick={() => isOpen = false}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); isOpen = false; } }}
	>
		<div 
			class="sample-menu" 
			role="dialog"
			aria-label="Sample menu"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="sample-menu-header">
				<h3>Samples</h3>
				<button class="close-btn" onclick={() => isOpen = false}>×</button>
			</div>
			
			<div class="sample-menu-content">
				{#if errorMessage}
					<div class="error-message">{errorMessage}</div>
				{/if}
				
				<div class="upload-section">
					<label class="upload-label">
						<input 
							type="file" 
							accept="audio/*" 
							multiple
							onchange={handleFileUpload}
							disabled={isUploading}
							style="display: none;"
						/>
						<span class="upload-button">
							{isUploading ? `Uploading... ${uploadProgress}%` : '+ Upload Sample'}
						</span>
					</label>
					<p class="upload-hint">Upload audio files (WAV, MP3, OGG, etc.)</p>
				</div>
				
				<div class="samples-list">
					<h4>Project Samples</h4>
					{#if samples.length === 0}
						<p class="empty-state">No samples uploaded yet. Upload a sample to get started.</p>
					{:else}
						<div class="samples-grid">
							{#each samples as sample}
								<div class="sample-item" role="button" tabindex="0" onclick={() => addSampleToPattern(sample)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addSampleToPattern(sample); } }}>
									<button 
										class="preview-btn"
										onclick={(e) => previewSample(sample, e)}
										title={previewingSampleId === sample.id ? "Stop preview" : "Preview sample"}
									>
										{previewingSampleId === sample.id ? '⏸' : '▶'}
									</button>
									<div class="sample-info">
										<div class="sample-name">{sample.fileName}</div>
										<div class="sample-meta">
											{formatDuration(sample.duration)} • {formatFileSize(sample.fileSize)}
										</div>
									</div>
									<button 
										class="delete-btn"
										onclick={(e) => handleDeleteSample(sample, e)}
										title="Delete sample"
									>
										×
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.sample-menu-btn {
		background: #2d2d2d;
		color: #e8e8e8;
		border: 1px solid rgba(155, 89, 182, 0.3); /* Purple border */
		border-radius: 4px;
		padding: 6px 12px;
		cursor: pointer;
		font-size: 13px;
		transition: all 0.2s ease;
	}
	
	.sample-menu-btn:hover {
		background: #333333;
		border-color: rgba(155, 89, 182, 0.5); /* Brighter purple on hover */
		color: #9b59b6; /* Purple text on hover */
	}
	
	.sample-menu-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	
	.sample-menu {
		background: #1a1a1a;
		border-radius: 8px;
		width: 90%;
		max-width: 600px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}
	
	.sample-menu-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid #333;
	}
	
	.sample-menu-header h3 {
		margin: 0;
		font-size: 18px;
		color: #fff;
	}
	
	.close-btn {
		background: none;
		border: none;
		color: #999;
		font-size: 24px;
		cursor: pointer;
		padding: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}
	
	.close-btn:hover {
		color: #fff;
	}
	
	.sample-menu-content {
		padding: 20px;
		overflow-y: auto;
		flex: 1;
	}
	
	.error-message {
		background: #ff4444;
		color: white;
		padding: 12px;
		border-radius: 4px;
		margin-bottom: 16px;
	}
	
	.upload-section {
		margin-bottom: 24px;
	}
	
	.upload-label {
		display: block;
		cursor: pointer;
	}
	
	.upload-button {
		display: inline-block;
		padding: 12px 24px;
		background: #9b59b6;
		color: white;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s;
		font-weight: 500;
	}
	
	.upload-button:hover {
		background: #8e44ad;
	}
	
	.upload-hint {
		margin: 8px 0 0 0;
		color: #999;
		font-size: 12px;
	}
	
	.samples-list h4 {
		margin: 0 0 12px 0;
		color: #fff;
		font-size: 14px;
		font-weight: 600;
	}
	
	.empty-state {
		color: #666;
		text-align: center;
		padding: 40px 20px;
	}
	
	.samples-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	
	.sample-item {
		display: flex;
		align-items: stretch;
		gap: 0;
		padding: 0;
		background: #2a2a2a;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s;
		min-height: 60px;
		overflow: hidden;
	}
	
	.sample-item:hover {
		background: #333;
	}
	
	.preview-btn {
		background: #2d2d2d;
		border: none;
		border-right: 1px solid rgba(255, 255, 255, 0.1);
		color: #e8e8e8;
		padding: 0 24px;
		border-radius: 4px 0 0 4px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 80px;
		flex-shrink: 0;
	}
	
	.preview-btn:hover {
		background: #333333;
		color: #9b59b6;
		border-right-color: rgba(155, 89, 182, 0.3);
	}
	
	.preview-btn:active {
		background: #3a3a3a;
	}
	
	.sample-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 12px 0 12px 16px;
	}
	
	.sample-name {
		color: #fff;
		font-weight: 500;
		margin-bottom: 4px;
	}
	
	.sample-meta {
		color: #999;
		font-size: 12px;
	}
	
	.delete-btn {
		background: transparent;
		border: none;
		color: #999;
		font-size: 20px;
		cursor: pointer;
		padding: 0 16px;
		transition: all 0.2s;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0 4px 4px 0;
	}
	
	.delete-btn:hover {
		color: #ff4444;
		background: rgba(255, 68, 68, 0.1);
	}
</style>

