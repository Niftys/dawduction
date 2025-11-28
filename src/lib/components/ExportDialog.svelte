<script lang="ts">
	import { projectStore } from '$lib/stores/projectStore';
	import { recordProject, exportBuffer, type ExportFormat } from '$lib/audio/utils/audioExport';
	
	export let isOpen = false;
	export let onClose: () => void;
	
	let project: any;
	projectStore.subscribe((p) => (project = p));
	
	$: bpm = project?.bpm ?? 120;
	$: timeline = project?.timeline;
	$: hasTimeline = timeline && timeline.clips && timeline.clips.length > 0;
	
	// Export options
	type ExportRange = 'full' | 'custom';
	let exportRange: ExportRange = hasTimeline ? 'full' : 'custom';
	let exportFormat: ExportFormat = 'wav';
	let customStartBeat = 0;
	let customEndBeat = 64; // Default to 16 measures at 4/4 time
	let filename = '';
	
	// Track if user has manually set values (to prevent reactive overrides)
	let hasCustomStart = false;
	let hasCustomEnd = false;
	
	// Calculate available ranges
	$: timelineLength = timeline?.totalLength || 64; // 16 measures at 4/4 time
	
	// Track if user is actively editing to prevent reactive overrides
	let isEditingStart = false;
	let isEditingEnd = false;
	
	// Initialize custom range when timeline changes (only if user hasn't set custom values)
	$: if (timeline && timelineLength > 0 && !isEditingEnd && !hasCustomEnd) {
		if (customEndBeat > timelineLength || customEndBeat === 64) {
			customEndBeat = timelineLength;
		}
	}
	
	// Validation functions for input handlers
	function validateStartBeat(value: number) {
		const max = timelineLength > 0 ? Math.min(timelineLength - 0.25, customEndBeat - 0.25) : customEndBeat - 0.25;
		return Math.max(0, Math.min(value, max));
	}
	
	function validateEndBeat(value: number) {
		const max = timelineLength > 0 ? timelineLength : Infinity;
		return Math.max(customStartBeat + 0.25, Math.min(value, max));
	}
	
	// Calculate duration based on selected range
	$: durationInBeats = (() => {
		if (exportRange === 'full') {
			return timelineLength;
		} else {
			return customEndBeat - customStartBeat;
		}
	})();
	
	$: durationInSeconds = (durationInBeats * 60) / bpm;
	$: durationMinutes = Math.floor(durationInSeconds / 60);
	$: durationSeconds = Math.floor(durationInSeconds % 60);
	$: durationDisplay = durationInSeconds < 60 
		? `${durationInSeconds.toFixed(1)}s`
		: `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
	
	// Generate default filename
	$: if (!filename && project) {
		const projectName = project.name || 'untitled';
		const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
		const extension = exportFormat === 'wav' ? 'wav' : exportFormat === 'mp3' ? 'mp3' : exportFormat === 'ogg' ? 'ogg' : 'wav';
		filename = `${projectName}-${timestamp}.${extension}`;
	}
	
	// Update filename extension when format changes
	$: if (filename && project) {
		const baseName = filename.replace(/\.(wav|ogg|mp3)$/i, '');
		const extension = exportFormat === 'wav' ? 'wav' : exportFormat === 'mp3' ? 'mp3' : exportFormat === 'ogg' ? 'ogg' : 'wav';
		if (!filename.endsWith(`.${extension}`)) {
			filename = `${baseName}.${extension}`;
		}
	}
	
	// Export state
	let isExporting = false;
	let exportProgress = 0;
	let exportError: string | null = null;
	
	async function handleExport() {
		if (!project || !project.standaloneInstruments || project.standaloneInstruments.length === 0) {
			exportError = 'No project to export';
			return;
		}
		
		if (isExporting) return;
		
		isExporting = true;
		exportProgress = 0;
		exportError = null;
		
		try {
			let durationInBeats: number;
			let timelineToUse: any = null;
			
			if (exportRange === 'full') {
				durationInBeats = timelineLength;
				timelineToUse = timeline;
			} else if (exportRange === 'custom') {
				// Custom range
				if (timeline) {
					// Create a modified timeline that only includes clips in the custom range
					// Shift all clips, effects, and envelopes to start from beat 0
					const customTimeline = {
						...timeline,
					tracks: timeline?.tracks || [],
					clips: (timeline?.clips || []).filter((clip: any) => {
						const clipEnd = clip.startBeat + clip.duration;
						// Include clips that overlap with the custom range
						return clipEnd > customStartBeat && clip.startBeat < customEndBeat;
					}).map((clip: any) => {
						// Shift clip to start from 0
						const newStartBeat = Math.max(0, clip.startBeat - customStartBeat);
						// Adjust duration to fit within custom range
						const clipStartInRange = Math.max(customStartBeat, clip.startBeat);
						const clipEndInRange = Math.min(customEndBeat, clip.startBeat + clip.duration);
						const newDuration = clipEndInRange - clipStartInRange;
						
						return {
							...clip,
							startBeat: newStartBeat,
							duration: Math.max(0, newDuration)
						};
					}),
					effects: (timeline?.effects || []).filter((effect: any) => {
						const effectEnd = effect.startBeat + effect.duration;
						// Include effects that overlap with the custom range
						return effectEnd > customStartBeat && effect.startBeat < customEndBeat;
					}).map((effect: any) => {
						// Shift effect to start from 0
						const newStartBeat = Math.max(0, effect.startBeat - customStartBeat);
						// Adjust duration to fit within custom range
						const effectStartInRange = Math.max(customStartBeat, effect.startBeat);
						const effectEndInRange = Math.min(customEndBeat, effect.startBeat + effect.duration);
						const newDuration = effectEndInRange - effectStartInRange;
						
						return {
							...effect,
							startBeat: newStartBeat,
							duration: Math.max(0, newDuration)
						};
					}),
					envelopes: (timeline?.envelopes || []).filter((envelope: any) => {
						const envelopeEnd = envelope.startBeat + envelope.duration;
						// Include envelopes that overlap with the custom range
						return envelopeEnd > customStartBeat && envelope.startBeat < customEndBeat;
					}).map((envelope: any) => {
						// Shift envelope to start from 0
						const newStartBeat = Math.max(0, envelope.startBeat - customStartBeat);
						// Adjust duration to fit within custom range
						const envelopeStartInRange = Math.max(customStartBeat, envelope.startBeat);
						const envelopeEndInRange = Math.min(customEndBeat, envelope.startBeat + envelope.duration);
						const newDuration = envelopeEndInRange - envelopeStartInRange;
						
						return {
							...envelope,
							startBeat: newStartBeat,
							duration: Math.max(0, newDuration)
						};
					}),
						totalLength: customEndBeat - customStartBeat
					};
					durationInBeats = customEndBeat - customStartBeat;
					timelineToUse = customTimeline;
				} else {
					// No timeline - just export the custom range from standalone instruments
					durationInBeats = customEndBeat - customStartBeat;
					timelineToUse = null;
				}
			} else {
				// Pattern loop - no timeline
				durationInBeats = patternLength;
				timelineToUse = null;
			}
			
			const updateProgress = (progress: number) => {
				exportProgress = progress;
			};
			
			// Record the project
			const audioBuffer = await recordProject(
				project.standaloneInstruments,
				bpm,
				project.baseMeterTrackId,
				durationInBeats,
				updateProgress,
				timelineToUse,
				project.patterns,
				project.effects,
				project.envelopes,
				project.automation
			);
			
			// Export based on selected format
			const baseFilename = filename.replace(/\.(wav|ogg|mp3)$/i, '');
			const extension = exportFormat === 'wav' ? 'wav' : exportFormat === 'mp3' ? 'mp3' : exportFormat === 'ogg' ? 'ogg' : 'wav';
			const finalFilename = `${baseFilename}.${extension}`;
			await exportBuffer(audioBuffer, finalFilename, exportFormat);
			
			// Close dialog after successful export
			setTimeout(() => {
				onClose();
				isExporting = false;
				exportProgress = 0;
			}, 500);
		} catch (error) {
			console.error('Export failed:', error);
			exportError = error instanceof Error ? error.message : String(error);
			isExporting = false;
		}
	}
	
	function handleClose() {
		if (!isExporting) {
			onClose();
		}
	}
	
	// Update custom range when timeline changes (only if user hasn't set custom values)
	$: if (exportRange === 'custom' && timeline && !isEditingEnd && !isEditingStart && !hasCustomEnd) {
		// Only update if current value is less than timeline length AND it's still the default
		if (customEndBeat < timelineLength && customEndBeat === 64) {
			// Only auto-update if it's still the default value
			customEndBeat = timelineLength;
		}
	}
</script>

{#if isOpen}
	<div 
		class="export-dialog-overlay" 
		role="presentation"
		on:click={handleClose} 
		on:keydown={(e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				handleClose();
			}
		}}
	>
		<div class="export-dialog" on:click|stopPropagation role="dialog" aria-modal="true" aria-label="Export audio dialog">
			<div class="export-dialog-header">
				<h2>Export Audio</h2>
				<button class="close-button" on:click={handleClose} disabled={isExporting} title="Close">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</div>
			
			<div class="export-dialog-content">
				{#if exportError}
					<div class="export-error">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M8 4V8M8 12H8.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							<circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
						</svg>
						<span>{exportError}</span>
					</div>
				{/if}
				
				<div class="export-section">
					<div class="export-label">Export Range</div>
					<div class="export-options">
						{#if hasTimeline}
							<label class="export-option">
								<input type="radio" bind:group={exportRange} value="full" disabled={isExporting} />
								<div class="option-content">
									<span class="option-title">Full Timeline</span>
									<span class="option-description">{timelineLength} beats ({durationDisplay})</span>
								</div>
							</label>
						{/if}
						<label class="export-option">
							<input type="radio" bind:group={exportRange} value="custom" disabled={isExporting} />
							<div class="option-content">
								<span class="option-title">Custom Range</span>
								<span class="option-description">Select specific beats</span>
							</div>
						</label>
					</div>
				</div>
				
				{#if exportRange === 'custom'}
					<div class="export-section">
						<div class="export-label">Custom Range (beats)</div>
						<div class="custom-range-inputs">
							<div class="range-input-group">
								<label for="custom-start-beat">Start</label>
								<div class="number-input-wrapper">
									<input 
										id="custom-start-beat"
										type="number" 
										bind:value={customStartBeat}
									on:focus={() => {
										isEditingStart = true;
										hasCustomStart = true;
									}}
									on:blur={() => {
										isEditingStart = false;
										customStartBeat = validateStartBeat(customStartBeat);
										// Ensure end beat is still valid after start changes
										if (customEndBeat <= customStartBeat) {
											customEndBeat = customStartBeat + 0.25;
											hasCustomEnd = true;
										}
									}}
										min="0" 
										max={timelineLength > 0 ? timelineLength - 0.25 : undefined}
										step="0.25"
										disabled={isExporting}
										class="range-number-input"
									/>
									<div class="number-input-arrows">
										<button
											type="button"
											class="arrow-button arrow-up"
											on:click={() => {
												hasCustomStart = true;
												const newValue = Math.min(
													timelineLength > 0 ? timelineLength - 0.25 : Infinity,
													customEndBeat - 0.25,
													customStartBeat + 0.25
												);
												customStartBeat = validateStartBeat(newValue);
											}}
											disabled={isExporting}
											title="Increase start beat"
										>
											<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M5 2L8 6H2L5 2Z" fill="currentColor" />
											</svg>
										</button>
										<button
											type="button"
											class="arrow-button arrow-down"
											on:click={() => {
												hasCustomStart = true;
												const newValue = Math.max(0, customStartBeat - 0.25);
												customStartBeat = validateStartBeat(newValue);
											}}
											disabled={isExporting}
											title="Decrease start beat"
										>
											<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M5 8L2 4H8L5 8Z" fill="currentColor" />
											</svg>
										</button>
									</div>
								</div>
							</div>
							<div class="range-input-group">
								<label for="custom-end-beat">End</label>
								<div class="number-input-wrapper">
									<input 
										id="custom-end-beat"
										type="number" 
										bind:value={customEndBeat}
									on:focus={() => {
										isEditingEnd = true;
										hasCustomEnd = true;
									}}
									on:blur={() => {
										isEditingEnd = false;
										customEndBeat = validateEndBeat(customEndBeat);
									}}
										min={customStartBeat + 0.25}
										max={timelineLength > 0 ? timelineLength : undefined}
										step="0.25"
										disabled={isExporting}
										class="range-number-input"
									/>
									<div class="number-input-arrows">
										<button
											type="button"
											class="arrow-button arrow-up"
											on:click={() => {
												hasCustomEnd = true;
												const max = timelineLength > 0 ? timelineLength : Infinity;
												const newValue = Math.min(max, customEndBeat + 0.25);
												customEndBeat = validateEndBeat(newValue);
											}}
											disabled={isExporting}
											title="Increase end beat"
										>
											<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M5 2L8 6H2L5 2Z" fill="currentColor" />
											</svg>
										</button>
										<button
											type="button"
											class="arrow-button arrow-down"
											on:click={() => {
												hasCustomEnd = true;
												const newValue = Math.max(customStartBeat + 0.25, customEndBeat - 0.25);
												customEndBeat = validateEndBeat(newValue);
											}}
											disabled={isExporting}
											title="Decrease end beat"
										>
											<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M5 8L2 4H8L5 8Z" fill="currentColor" />
											</svg>
										</button>
									</div>
								</div>
							</div>
						</div>
						<div class="range-info">
							Duration: {durationInBeats.toFixed(2)} beats ({durationDisplay})
						</div>
					</div>
				{/if}
				
				<div class="export-section">
					<div class="export-label">Format</div>
					<div class="format-selector" role="radiogroup" aria-label="Export format">
						<label class="format-option">
							<input type="radio" bind:group={exportFormat} value="wav" disabled={isExporting} />
							<span>WAV (Lossless)</span>
						</label>
						<label class="format-option">
							<input type="radio" bind:group={exportFormat} value="mp3" disabled={isExporting} />
							<span>MP3</span>
						</label>
						<label class="format-option">
							<input type="radio" bind:group={exportFormat} value="ogg" disabled={isExporting} />
							<span>OGG Vorbis</span>
						</label>
					</div>
				</div>
				
				<div class="export-section">
					<label class="export-label" for="filename-input">Filename</label>
					<input 
						id="filename-input"
						type="text" 
						bind:value={filename} 
						placeholder="export.wav"
						disabled={isExporting}
						class="filename-input"
					/>
				</div>
				
				<div class="export-section">
					<div class="export-info">
						<div class="info-item">
							<span class="info-label">Duration:</span>
							<span class="info-value">{durationDisplay}</span>
						</div>
						<div class="info-item">
							<span class="info-label">BPM:</span>
							<span class="info-value">{bpm}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Format:</span>
							<span class="info-value">
								{exportFormat === 'wav' ? 'WAV (44.1kHz, 16-bit)' : 
								 exportFormat === 'mp3' ? 'MP3' :
								 exportFormat === 'ogg' ? 'OGG Vorbis' : 'WAV'}
							</span>
						</div>
					</div>
				</div>
				
				{#if isExporting}
					<div class="export-progress-section">
						<div class="export-progress-bar">
							<div class="export-progress-fill" style="width: {exportProgress * 100}%"></div>
						</div>
						<div class="export-progress-text">
							Exporting... {Math.round(exportProgress * 100)}%
						</div>
					</div>
				{/if}
			</div>
			
			<div class="export-dialog-footer">
				<button class="export-button-cancel" on:click={handleClose} disabled={isExporting}>
					Cancel
				</button>
				<button 
					class="export-button-submit" 
					on:click={handleExport} 
					disabled={isExporting || !filename.trim()}
				>
					{isExporting ? 'Exporting...' : 'Export'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.export-dialog-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
		backdrop-filter: blur(4px);
	}
	
	.export-dialog {
		background: #1f1f1f;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		width: 90%;
		max-width: 500px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}
	
	.export-dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.export-dialog-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #e8e8e8;
	}
	
	.close-button {
		background: transparent;
		border: none;
		color: #b8b8b8;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.2s ease;
	}
	
	.close-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: #e8e8e8;
	}
	
	.close-button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	
	.export-dialog-content {
		padding: 24px;
		overflow-y: auto;
		flex: 1;
	}
	
	.export-error {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: rgba(255, 68, 68, 0.1);
		border: 1px solid rgba(255, 68, 68, 0.3);
		border-radius: 6px;
		color: #ff6b6b;
		font-size: 13px;
		margin-bottom: 20px;
	}
	
	.export-error svg {
		flex-shrink: 0;
	}
	
	.export-section {
		margin-bottom: 24px;
	}
	
	.export-section:last-child {
		margin-bottom: 0;
	}
	
	.export-label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: #b8b8b8;
		margin-bottom: 12px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	
	.export-options {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	
	.export-option {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: #2d2d2d;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	
	.export-option:hover:not(:has(input:disabled)) {
		background: #333333;
		border-color: rgba(255, 255, 255, 0.2);
	}
	
	.export-option input[type="radio"] {
		margin: 0;
		cursor: pointer;
		accent-color: #00ff88;
	}
	
	.export-option:has(input:checked) {
		background: #2d4d2d;
		border-color: #00ff88;
	}
	
	.export-option:has(input:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.option-content {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
	}
	
	.option-title {
		font-size: 14px;
		font-weight: 500;
		color: #e8e8e8;
	}
	
	.option-description {
		font-size: 12px;
		color: #b8b8b8;
	}
	
	.custom-range-inputs {
		display: flex;
		gap: 12px;
	}
	
	.range-input-group {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	
	.range-input-group label {
		font-size: 12px;
		color: #b8b8b8;
	}
	
	.range-input-group .number-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
	}
	
	.range-number-input {
		width: 100%;
		background: #2d2d2d;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 8px 28px 8px 12px;
		color: #e8e8e8;
		font-size: 14px;
		transition: all 0.2s ease;
		-moz-appearance: textfield;
	}
	
	.range-number-input::-webkit-outer-spin-button,
	.range-number-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	
	.range-number-input:focus {
		outline: none;
		border-color: #00ff88;
		background: #333333;
	}
	
	.range-number-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.range-input-group .number-input-arrows {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		flex-direction: column;
		gap: 2px;
		pointer-events: none;
	}
	
	.range-input-group .arrow-button {
		background: transparent;
		border: none;
		color: #b8b8b8;
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		border-radius: 2px;
		width: 16px;
		height: 12px;
		pointer-events: auto;
	}
	
	.range-input-group .arrow-button:hover:not(:disabled) {
		color: #e8e8e8;
		background: rgba(255, 255, 255, 0.1);
	}
	
	.range-input-group .arrow-button:active:not(:disabled) {
		color: #7ab8ff;
		background: rgba(122, 184, 255, 0.2);
		transform: scale(0.9);
	}
	
	.range-input-group .arrow-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: transparent;
		color: #5a5a5a;
	}
	
	.range-input-group .arrow-button svg {
		width: 10px;
		height: 10px;
	}
	
	.range-info {
		margin-top: 8px;
		font-size: 12px;
		color: #b8b8b8;
	}
	
	.filename-input {
		width: 100%;
		background: #2d2d2d;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 10px 12px;
		color: #e8e8e8;
		font-size: 14px;
		transition: all 0.2s ease;
	}
	
	.filename-input:focus {
		outline: none;
		border-color: #00ff88;
		background: #333333;
	}
	
	.filename-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.format-selector {
		display: flex;
		gap: 8px;
	}
	
	.format-option {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 12px;
		background: #2d2d2d;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 13px;
		color: #e8e8e8;
	}
	
	.format-option:hover:not(:has(input:disabled)) {
		background: #333333;
		border-color: rgba(255, 255, 255, 0.2);
	}
	
	.format-option input[type="radio"] {
		margin: 0;
		cursor: pointer;
		accent-color: #00ff88;
	}
	
	.format-option:has(input:checked) {
		background: #2d4d2d;
		border-color: #00ff88;
	}
	
	.format-option:has(input:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.export-info {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		background: #2d2d2d;
		border-radius: 6px;
	}
	
	.info-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	
	.info-label {
		font-size: 13px;
		color: #b8b8b8;
	}
	
	.info-value {
		font-size: 13px;
		color: #e8e8e8;
		font-weight: 500;
	}
	
	.export-progress-section {
		margin-top: 20px;
		padding-top: 20px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.export-progress-bar {
		width: 100%;
		height: 6px;
		background: #2d2d2d;
		border-radius: 3px;
		overflow: hidden;
		margin-bottom: 8px;
	}
	
	.export-progress-fill {
		height: 100%;
		background: #00ff88;
		border-radius: 3px;
		transition: width 0.1s ease;
	}
	
	.export-progress-text {
		text-align: center;
		font-size: 12px;
		color: #b8b8b8;
	}
	
	.export-dialog-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		padding: 20px 24px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.export-button-cancel,
	.export-button-submit {
		padding: 10px 20px;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}
	
	.export-button-cancel {
		background: #2d2d2d;
		color: #e8e8e8;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	
	.export-button-cancel:hover:not(:disabled) {
		background: #333333;
		border-color: rgba(255, 255, 255, 0.2);
	}
	
	.export-button-submit {
		background: #00ff88;
		color: #1a1a1a;
		font-weight: 600;
	}
	
	.export-button-submit:hover:not(:disabled) {
		background: #00cc6a;
	}
	
	.export-button-cancel:disabled,
	.export-button-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

