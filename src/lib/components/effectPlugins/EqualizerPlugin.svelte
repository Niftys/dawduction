<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Effect, TimelineEffect } from '$lib/types/effects';
	import { projectStore } from '$lib/stores/projectStore';
	import { engineStore } from '$lib/stores/engineStore';
	import type { EngineWorklet } from '$lib/audio/engine/EngineWorklet';
	import {
		type EQBand,
		type FilterType,
		generateFrequencyResponseCurve,
		frequencyToX,
		xToFrequency,
		gainToY,
		yToGain
	} from '$lib/utils/eqFrequencyResponse';
	import '$lib/styles/components/EqualizerPlugin.css';

	const { selectedEffect, effectId }: { selectedEffect: Effect | null; effectId?: string } = $props();
	
	let engine: EngineWorklet | null = null;
	engineStore.subscribe((e) => (engine = e));

	// Canvas elements
	let canvas: HTMLCanvasElement;
	let waveformCanvas: HTMLCanvasElement;
	let canvasContainer: HTMLDivElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let waveformCtx: CanvasRenderingContext2D | null = null;
	
	// Dimensions
	let canvasWidth = 600;
	let canvasHeight = 300;
	const minFreq = 20;
	const maxFreq = 20000;
	const minGain = -12;
	const maxGain = 12;
	
	// Selected band
	let selectedBandIndex = $state(0);
	
	// Band dragging state
	let draggingBand: number | null = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartFreq = 0;
	let dragStartGain = 0;
	
	
	
	// Default bands configuration - define first so it's available everywhere
	const DEFAULT_BANDS: Array<{ type: FilterType; frequency: number; gain: number; q: number; enabled: boolean }> = [
		{ type: 'highpass', frequency: 80, gain: 0, q: 0.71, enabled: true },
		{ type: 'bell', frequency: 200, gain: 0, q: 0.71, enabled: true },
		{ type: 'bell', frequency: 500, gain: 0, q: 0.71, enabled: true },
		{ type: 'bell', frequency: 1000, gain: 0, q: 0.71, enabled: true },
		{ type: 'bell', frequency: 2000, gain: 0, q: 0.71, enabled: false },
		{ type: 'bell', frequency: 5000, gain: 0, q: 0.71, enabled: false },
		{ type: 'bell', frequency: 10000, gain: 0, q: 0.71, enabled: false },
		{ type: 'lowpass', frequency: 18000, gain: 0, q: 0.71, enabled: false }
	];
	
	function createDefaultBands(): EQBand[] {
		return DEFAULT_BANDS.map((band, i) => ({
			id: i,
			type: band.type,
			frequency: band.frequency,
			gain: band.gain,
			q: band.q,
			enabled: band.enabled
		}));
	}
	
	function createDefaultSettings(): Record<string, any> {
		const newSettings: Record<string, any> = {};
		for (let i = 0; i < 8; i++) {
			newSettings[`band${i}`] = { ...DEFAULT_BANDS[i] };
		}
		return newSettings;
	}
	
	// Initialize bands from settings or defaults
	function getBandsFromSettings(settings: Record<string, any>): EQBand[] {
		const bands: EQBand[] = [];
		
		for (let i = 0; i < 8; i++) {
			const bandKey = `band${i}`;
			const bandData = settings[bandKey];
			
			// Only use bandData if it's a valid object with at least some properties
			if (bandData && typeof bandData === 'object' && Object.keys(bandData).length > 0) {
				bands.push({
					id: i,
					type: bandData.type || DEFAULT_BANDS[i]?.type || 'bell',
					frequency: typeof bandData.frequency === 'number' ? bandData.frequency : (DEFAULT_BANDS[i]?.frequency || 1000),
					gain: typeof bandData.gain === 'number' ? bandData.gain : (DEFAULT_BANDS[i]?.gain || 0),
					q: typeof bandData.q === 'number' ? bandData.q : (DEFAULT_BANDS[i]?.q || 0.71),
					enabled: bandData.enabled !== false && (i < 4 || bandData.enabled === true) // Enable first 4 by default
				});
			} else {
				// Use default band
				bands.push({
					id: i,
					type: DEFAULT_BANDS[i]?.type || 'bell',
					frequency: DEFAULT_BANDS[i]?.frequency || 1000,
					gain: DEFAULT_BANDS[i]?.gain || 0,
					q: DEFAULT_BANDS[i]?.q || 0.71,
					enabled: DEFAULT_BANDS[i]?.enabled ?? (i < 4) // Use default enabled state
				});
			}
		}
		
		return bands;
	}
	
	// Initialize bands reactively from selectedEffect settings
	// Start with default bands so something always shows
	let bands = $state<EQBand[]>(createDefaultBands());
	let lastEffectId = $state<string | null>(null);
	let isInitialized = $state(false);
	
	// Load bands from effect settings
	function loadBandsFromEffect(effect: Effect) {
		if (!effect || effect.type !== 'equalizer') {
			return;
		}
		
		const settings = effect.settings || {};
		const hasNewFormat = settings.band0 !== undefined;
		
		if (hasNewFormat) {
			// Load from saved settings
			const loadedBands = getBandsFromSettings(settings);
			if (loadedBands.length === 8) {
				bands = loadedBands;
				console.log('[EQ] Loaded', loadedBands.length, 'bands from saved settings');
				
				// Update engine with loaded settings
				if (engine) {
					engine.updateEffect(effect.id, settings);
				}
			} else {
				console.warn('[EQ] Invalid band count, using defaults');
				bands = createDefaultBands();
				const defaultSettings = createDefaultSettings();
				
				// Save defaults to store and update engine
				projectStore.updateEffect(effect.id, {
					settings: defaultSettings
				});
				
				if (engine) {
					engine.updateEffect(effect.id, defaultSettings);
				}
			}
		} else {
			// Old format or no settings - initialize with defaults
			bands = createDefaultBands();
			const defaultSettings = createDefaultSettings();
			
			// Save defaults to store and update engine
			projectStore.updateEffect(effect.id, {
				settings: defaultSettings
			});
			
			if (engine) {
				engine.updateEffect(effect.id, defaultSettings);
			}
		}
	}
	
	// Get the current effect ID (from prop or selectedEffect)
	function getCurrentEffectId(): string | null {
		if (selectedEffect?.id) return selectedEffect.id;
		if (effectId) return effectId;
		return null;
	}
	
	// Function to force reload settings from store
	function reloadSettingsFromStore() {
		const currentEffectId = getCurrentEffectId();
		if (!currentEffectId) {
			console.log('[EQ] Cannot reload - no effect ID available');
			return;
		}
		
		// Always get latest effect from store (source of truth)
		let currentProject: any = null;
		const unsubscribe = projectStore.subscribe((p) => {
			currentProject = p;
		});
		const latestEffect = currentProject?.effects?.find((e: Effect) => e.id === currentEffectId);
		unsubscribe();
		
		if (latestEffect && latestEffect.type === 'equalizer') {
			console.log('[EQ] Reloading settings from store:', {
				effectId: latestEffect.id,
				hasSettings: !!latestEffect.settings,
				hasBand0: latestEffect.settings?.band0 !== undefined,
				bandKeys: latestEffect.settings ? Object.keys(latestEffect.settings).filter(k => k.startsWith('band')) : []
			});
			
			loadBandsFromEffect(latestEffect);
			lastEffectId = latestEffect.id;
			isInitialized = true;
			
			// Redraw after loading
			setTimeout(() => {
				if (ctx && canvas) {
					redraw();
				}
			}, 0);
		} else {
			console.warn('[EQ] Effect not found in store or wrong type:', currentEffectId);
		}
	}
	
	// Watch for effect changes and load settings
	$effect(() => {
		const currentEffectId = getCurrentEffectId();
		if (!currentEffectId) {
			if (bands.length === 0) {
				bands = createDefaultBands();
			}
			return;
		}
		
		// Only reload if effect ID changed (different effect) or not yet initialized
		const effectChanged = lastEffectId !== currentEffectId;
		
		if (effectChanged || !isInitialized) {
			reloadSettingsFromStore();
		}
	});
	
	function updateBand(bandIndex: number, updates: Partial<EQBand>) {
		const currentEffectId = getCurrentEffectId();
		if (!currentEffectId) return;
		
		// Ensure bands are initialized
		if (!bands || bands.length === 0) {
			bands = createDefaultBands();
		}
		
		const updatedBands = [...bands];
		updatedBands[bandIndex] = { ...updatedBands[bandIndex], ...updates };
		bands = updatedBands;
		
		// Build complete settings object with ALL bands
		const newSettings: Record<string, any> = {};
		
		// Get current effect to preserve non-band settings
		let currentProject: any = null;
		const unsubscribe = projectStore.subscribe((p) => {
			currentProject = p;
		});
		const currentEffect = currentProject?.effects?.find((e: Effect) => e.id === currentEffectId);
		unsubscribe();
		
		// Copy existing non-band settings first (preserve any other settings)
		if (currentEffect?.settings) {
			Object.keys(currentEffect.settings).forEach(key => {
				if (!key.startsWith('band')) {
					newSettings[key] = currentEffect.settings[key];
				}
			});
		}
		
		// Update all bands in settings
		for (let i = 0; i < 8; i++) {
			if (updatedBands[i]) {
				newSettings[`band${i}`] = {
					type: updatedBands[i].type,
					frequency: updatedBands[i].frequency,
					gain: updatedBands[i].gain,
					q: updatedBands[i].q,
					enabled: updatedBands[i].enabled
				};
			} else {
				// Use defaults if band is missing
				newSettings[`band${i}`] = DEFAULT_BANDS[i] || {
					type: 'bell',
					frequency: 1000,
					gain: 0,
					q: 0.71,
					enabled: i < 4
				};
			}
		}
		
		// Update store (for persistence)
		projectStore.updateEffect(currentEffectId, {
			settings: newSettings
		});
		
		// Update engine immediately for real-time audio processing
		if (engine) {
			engine.updateEffect(currentEffectId, newSettings);
		}
		
		// Redraw immediately to show visual feedback
		redraw();
	}
	
	function updateSetting(key: string, value: any) {
		const currentEffectId = getCurrentEffectId();
		if (!currentEffectId) return;
		const processedValue = typeof value === 'number' ? parseFloat(value.toFixed(3)) : value;
		
		const band = bands[selectedBandIndex];
		if (band) {
			if (key === 'frequency') {
				updateBand(selectedBandIndex, { frequency: Math.max(minFreq, Math.min(maxFreq, processedValue)) });
			} else if (key === 'gain') {
				updateBand(selectedBandIndex, { gain: Math.max(minGain, Math.min(maxGain, processedValue)) });
			} else if (key === 'q') {
				updateBand(selectedBandIndex, { q: Math.max(0.1, Math.min(10, processedValue)) });
			} else if (key === 'type') {
				updateBand(selectedBandIndex, { type: processedValue });
			} else if (key === 'enabled') {
				updateBand(selectedBandIndex, { enabled: processedValue });
			}
		}
	}
	
	function redraw() {
		if (!ctx || !canvas) {
			console.warn('[EQ] redraw: canvas or context not available', { ctx: !!ctx, canvas: !!canvas });
			return;
		}
		
		// Ensure bands are always initialized - use defaults if empty
		if (!bands || bands.length === 0) {
			console.log('[EQ] redraw: initializing default bands');
			bands = createDefaultBands();
		}
		
		// Clear canvas
		ctx.clearRect(0, 0, canvasWidth, canvasHeight);
		
		// Draw grid
		drawGrid();
		
		// Draw frequency response curve
		drawFrequencyResponse();
		
		// Draw band control points
		drawBandPoints();
	}
	
	function drawGrid() {
		if (!ctx) return;
		
		ctx.strokeStyle = '#444';
		ctx.lineWidth = 1;
		
		// Horizontal lines (gain)
		for (let gain = minGain; gain <= maxGain; gain += 6) {
			const y = gainToY(gain, canvasHeight, minGain, maxGain);
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvasWidth, y);
			ctx.stroke();
			
			// Label
			ctx.fillStyle = '#888';
			ctx.font = '10px monospace';
			ctx.textAlign = 'left';
			ctx.fillText(`${gain}`, 5, y + 4);
		}
		
		// Vertical lines (frequency) - logarithmic scale
		const freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
		for (const freq of freqLabels) {
			const x = frequencyToX(freq, canvasWidth, minFreq, maxFreq);
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvasHeight);
			ctx.stroke();
			
			// Label
			ctx.fillStyle = '#888';
			ctx.font = '10px monospace';
			ctx.textAlign = 'center';
			const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
			ctx.fillText(label, x, canvasHeight - 5);
		}
		
		// Center line (0 dB)
		ctx.strokeStyle = '#666';
		ctx.lineWidth = 1.5;
		const centerY = gainToY(0, canvasHeight, minGain, maxGain);
		ctx.beginPath();
		ctx.moveTo(0, centerY);
		ctx.lineTo(canvasWidth, centerY);
		ctx.stroke();
	}
	
	function drawFrequencyResponse() {
		if (!ctx) return;
		
		// Ensure bands are initialized
		if (!bands || bands.length === 0) {
			return;
		}
		
		const curvePoints = generateFrequencyResponseCurve(bands, canvasWidth, minFreq, maxFreq);
		
		ctx.strokeStyle = '#ff8800';
		ctx.lineWidth = 2;
		ctx.beginPath();
		
		for (let i = 0; i < curvePoints.length; i++) {
			const point = curvePoints[i];
			const x = point.x * canvasWidth;
			const y = gainToY(point.y, canvasHeight, minGain, maxGain);
			
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		
		ctx.stroke();
	}
	
	function drawBandPoints() {
		if (!ctx) return;
		
		// Ensure bands are initialized
		if (!bands || bands.length === 0) {
			return;
		}
		
		for (let i = 0; i < bands.length; i++) {
			const band = bands[i];
			if (!band.enabled) continue;
			
			const x = frequencyToX(band.frequency, canvasWidth, minFreq, maxFreq);
			const y = gainToY(band.gain, canvasHeight, minGain, maxGain);
			
			// Draw point
			ctx.fillStyle = i === selectedBandIndex ? '#ffaa00' : '#ff8800';
			ctx.beginPath();
			ctx.arc(x, y, 6, 0, Math.PI * 2);
			ctx.fill();
			
			// Draw outline
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 2;
			ctx.stroke();
			
			// Draw band number
			ctx.fillStyle = '#000';
			ctx.font = 'bold 10px monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(`${i + 1}`, x, y);
		}
	}
	
	function handleCanvasMouseDown(e: MouseEvent) {
		if (!canvas) return;
		
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		
		// Check if clicking on a band point
		for (let i = 0; i < bands.length; i++) {
			const band = bands[i];
			if (!band.enabled) continue;
			
			const bandX = frequencyToX(band.frequency, canvasWidth, minFreq, maxFreq);
			const bandY = gainToY(band.gain, canvasHeight, minGain, maxGain);
			
			const distance = Math.sqrt((x - bandX) ** 2 + (y - bandY) ** 2);
			
			if (distance < 15) {
				// Clicked on a band point
				draggingBand = i;
				selectedBandIndex = i;
				dragStartX = x;
				dragStartY = y;
				dragStartFreq = band.frequency;
				dragStartGain = band.gain;
				return;
			}
		}
		
		// If no band clicked, update selected band position
		const freq = xToFrequency(x, canvasWidth, minFreq, maxFreq);
		const gain = yToGain(y, canvasHeight, minGain, maxGain);
		
		updateBand(selectedBandIndex, {
			frequency: freq,
			gain: gain,
			enabled: true
		});
		
		draggingBand = selectedBandIndex;
		dragStartX = x;
		dragStartY = y;
		dragStartFreq = freq;
		dragStartGain = gain;
	}
	
	function handleCanvasMouseMove(e: MouseEvent) {
		if (draggingBand === null || !canvas) return;
		
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		
		// Convert current position to frequency and gain
		const freq = xToFrequency(x, canvasWidth, minFreq, maxFreq);
		const gain = yToGain(y, canvasHeight, minGain, maxGain);
		
		updateBand(draggingBand, {
			frequency: Math.max(minFreq, Math.min(maxFreq, freq)),
			gain: Math.max(minGain, Math.min(maxGain, gain))
		});
	}
	
	function handleCanvasMouseUp() {
		draggingBand = null;
	}
	
	function resizeCanvas() {
		if (!canvasContainer || !canvas) return;
		
		const rect = canvasContainer.getBoundingClientRect();
		canvasWidth = rect.width;
		canvasHeight = rect.height;
		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
		
		// Also resize waveform canvas
		if (waveformCanvas && waveformCtx) {
			const dpr = window.devicePixelRatio || 1;
			waveformCanvas.width = canvasWidth * dpr;
			waveformCanvas.height = canvasHeight * dpr;
			waveformCanvas.style.width = `${canvasWidth}px`;
			waveformCanvas.style.height = `${canvasHeight}px`;
			waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		
		redraw();
		
		// Restart spectrum if it was running
		if (isSpectrumRunning && waveformCanvas && engine) {
			stopFrequencySpectrum();
			setTimeout(() => {
				if (engine && engine.getAnalyserNode()) {
					startFrequencySpectrum();
				}
			}, 50);
		}
	}
	
	// Frequency spectrum visualization (background)
	let animationFrameId: number | null = null;
	let isSpectrumRunning = false;
	
	function drawFrequencySpectrum() {
		if (!waveformCanvas || !waveformCtx || !engine || !canvasContainer || canvasWidth <= 0 || canvasHeight <= 0) {
			animationFrameId = null;
			isSpectrumRunning = false;
			return;
		}
		
		const analyser = engine.getAnalyserNode();
		if (!analyser) {
			// Analyser not available - stop the loop and let the retry mechanism handle it
			isSpectrumRunning = false;
			animationFrameId = null;
			// Try to restart after a delay
			setTimeout(() => {
				if (engine && engine.getAnalyserNode() && !isSpectrumRunning && waveformCanvas && waveformCtx) {
					startFrequencySpectrum();
				}
			}, 500);
			return;
		}
		
		// Use same dimensions as the curve canvas
		const width = canvasWidth;
		const height = canvasHeight;
		
		// Set canvas size with device pixel ratio
		const dpr = window.devicePixelRatio || 1;
		if (waveformCanvas.width !== width * dpr || waveformCanvas.height !== height * dpr) {
			waveformCanvas.width = width * dpr;
			waveformCanvas.height = height * dpr;
			waveformCanvas.style.width = `${width}px`;
			waveformCanvas.style.height = `${height}px`;
			waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		
		const bufferLength = analyser.frequencyBinCount;
		
		// Get actual sample rate from audio context
		const sampleRate = engine.getAudioContext()?.sampleRate || 44100;
		const nyquist = sampleRate / 2;
		
		// Clear canvas (transparent so grid shows through)
		waveformCtx.clearRect(0, 0, width, height);
		
		// Draw frequency spectrum mapped to logarithmic scale
		// Use Float32Array for better precision (returns dB values directly)
		const floatDataArray = new Float32Array(bufferLength);
		analyser.getFloatFrequencyData(floatDataArray);
		
		// Create gradient for better visibility
		const gradient = waveformCtx.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, 'rgba(122, 184, 255, 0.4)');
		gradient.addColorStop(0.5, 'rgba(122, 184, 255, 0.3)');
		gradient.addColorStop(1, 'rgba(122, 184, 255, 0.1)');
		
		waveformCtx.fillStyle = gradient;
		waveformCtx.strokeStyle = 'rgba(122, 184, 255, 0.6)';
		waveformCtx.lineWidth = 1.5;
		waveformCtx.beginPath();
		
		// Map each pixel to a frequency range with adaptive smoothing
		// Use more bins per pixel for smoother visualization
		let firstPoint = true;
		
		// Track overall peak for dynamic range adjustment
		let overallPeak = -Infinity;
		const spectrumValues: number[] = [];
		
		for (let pixelX = 0; pixelX < width; pixelX++) {
			// Convert pixel X to frequency (logarithmic scale, same as curve)
			const freq = xToFrequency(pixelX, width, minFreq, maxFreq);
			
			// Find the corresponding bin in the FFT data
			// FFT bins are linear, so we need to map logarithmic frequency to linear bin
			const centerBinIndex = (freq / nyquist) * bufferLength;
			
			// Adaptive smoothing window - larger for lower frequencies (more bins)
			// At low frequencies, we have more bins per Hz, so we can average more
			const freqRatio = freq / maxFreq;
			const baseWindowSize = 5;
			const adaptiveWindowSize = Math.max(2, Math.floor(baseWindowSize * (1 + (1 - freqRatio) * 3)));
			
			const startBin = Math.max(0, Math.floor(centerBinIndex - adaptiveWindowSize));
			const endBin = Math.min(bufferLength - 1, Math.ceil(centerBinIndex + adaptiveWindowSize));
			
			// Average nearby bins for smoother visualization
			// Use RMS (root mean square) for better representation of energy
			let sumSquared = 0;
			let count = 0;
			let maxValue = -Infinity;
			
			for (let i = startBin; i <= endBin; i++) {
				// Use float data for better precision (already in dB)
				const dbValue = floatDataArray[i];
				// Accept any finite value (getFloatFrequencyData returns -Infinity for silence)
				if (!isNaN(dbValue) && isFinite(dbValue) && dbValue > -Infinity) {
					// Convert dB to linear for RMS calculation, then back to dB
					const linearValue = Math.pow(10, dbValue / 20);
					sumSquared += linearValue * linearValue;
					count++;
					
					// Also track peak for reference
					if (dbValue > maxValue) {
						maxValue = dbValue;
					}
				}
			}
			
			// Calculate RMS in dB
			let rmsDb = -100; // Default to very quiet
			if (count > 0 && sumSquared > 0) {
				const rmsLinear = Math.sqrt(sumSquared / count);
				rmsDb = 20 * Math.log10(rmsLinear);
				if (!isFinite(rmsDb)) {
					rmsDb = -100;
				}
			}
			
			// Use RMS for smoother visualization, but fallback to peak if RMS is invalid
			let dbValue = rmsDb > -100 ? rmsDb : (maxValue > -Infinity ? maxValue : -100);
			
			// Track overall peak for dynamic range
			if (dbValue > overallPeak) {
				overallPeak = dbValue;
			}
			
			spectrumValues.push(dbValue);
		}
		
		// Dynamic range adjustment: if we have audio, adjust the range to show it better
		// Use a range that's centered around the peak, but still show the full scale
		const dynamicMinDb = Math.max(-80, overallPeak - 50); // Show 50dB below peak
		const dynamicMaxDb = Math.min(12, overallPeak + 10); // Show 10dB above peak
		
		// Draw the spectrum
		for (let pixelX = 0; pixelX < width; pixelX++) {
			const dbValue = spectrumValues[pixelX];
			
			// Map to visible range (use dynamic range if we have audio, otherwise use fixed range)
			const visibleMinDb = overallPeak > -80 ? dynamicMinDb : -60;
			const visibleMaxDb = overallPeak > -80 ? dynamicMaxDb : 12;
			const clampedDb = Math.max(visibleMinDb, Math.min(visibleMaxDb, dbValue));
			
			// Map to Y position using the same scale as the EQ curve
			// But adjust for the dynamic range
			const normalized = (clampedDb - visibleMinDb) / (visibleMaxDb - visibleMinDb);
			const y = height - (normalized * height);
			
			// Clamp Y to canvas bounds
			const clampedY = Math.max(0, Math.min(height, y));
			
			if (firstPoint) {
				waveformCtx.moveTo(pixelX, height);
				waveformCtx.lineTo(pixelX, clampedY);
				firstPoint = false;
			} else {
				waveformCtx.lineTo(pixelX, clampedY);
			}
		}
		
		// Close the path and fill
		waveformCtx.lineTo(width, height);
		waveformCtx.closePath();
		waveformCtx.fill();
		waveformCtx.stroke();
		
		// Reset transform
		waveformCtx.setTransform(1, 0, 0, 1, 0, 0);
		
		isSpectrumRunning = true;
		animationFrameId = requestAnimationFrame(drawFrequencySpectrum);
	}
	
	function startFrequencySpectrum() {
		if (!waveformCanvas || !engine || !canvasContainer) {
			return;
		}
		
		if (isSpectrumRunning) {
			return; // Already running
		}
		
		// Get or create context
		if (!waveformCtx) {
			waveformCtx = waveformCanvas.getContext('2d');
			if (!waveformCtx) {
				console.warn('Failed to get 2d context for waveform canvas');
				return;
			}
		}
		
		// Ensure canvas is properly sized
		if (canvasWidth > 0 && canvasHeight > 0) {
			const dpr = window.devicePixelRatio || 1;
			if (waveformCanvas.width !== canvasWidth * dpr || waveformCanvas.height !== canvasHeight * dpr) {
				waveformCanvas.width = canvasWidth * dpr;
				waveformCanvas.height = canvasHeight * dpr;
				waveformCanvas.style.width = `${canvasWidth}px`;
				waveformCanvas.style.height = `${canvasHeight}px`;
				waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
			}
			isSpectrumRunning = true;
			drawFrequencySpectrum();
		} else {
			console.warn('Cannot start spectrum: invalid canvas dimensions', canvasWidth, canvasHeight);
		}
	}
	
	function stopFrequencySpectrum() {
		isSpectrumRunning = false;
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	}
	
	onMount(() => {
		// Reset initialization state to force reload when plugin reopens
		lastEffectId = null;
		isInitialized = false;
		
		// Initialize canvas
		if (canvas) {
			ctx = canvas.getContext('2d');
			if (ctx) {
				resizeCanvas();
			} else {
				console.error('Failed to get 2d context for EQ canvas');
			}
		}
		
		// Initialize waveform canvas context
		if (waveformCanvas) {
			waveformCtx = waveformCanvas.getContext('2d');
			if (!waveformCtx) {
				console.warn('Failed to get 2d context for waveform canvas');
			}
		}
		
		// Force reload settings from store when component mounts
		// This ensures we always get the latest saved settings when plugin opens
		setTimeout(() => {
			reloadSettingsFromStore();
		}, 100);
		
		// Start spectrum visualization after a short delay
		const startSpectrum = () => {
			const analyser = engine?.getAnalyserNode();
			if (engine && waveformCanvas && canvasContainer && analyser && waveformCtx) {
				if (canvasWidth > 0 && canvasHeight > 0) {
					startFrequencySpectrum();
				} else {
					setTimeout(startSpectrum, 100);
				}
			} else {
				let retries = 0;
				const retryInterval = setInterval(() => {
					retries++;
					const analyser = engine?.getAnalyserNode();
					if (engine && waveformCanvas && canvasContainer && analyser && waveformCtx) {
						if (canvasWidth > 0 && canvasHeight > 0) {
							startFrequencySpectrum();
							clearInterval(retryInterval);
						}
					} else if (retries >= 30) {
						clearInterval(retryInterval);
						if (engine) {
							console.warn('Frequency spectrum visualization: analyser not available. Make sure audio is playing.');
						}
					}
				}, 100);
			}
		};
		setTimeout(startSpectrum, 300);
		
		window.addEventListener('resize', resizeCanvas);
		canvas?.addEventListener('mousedown', handleCanvasMouseDown);
		window.addEventListener('mousemove', handleCanvasMouseMove);
		window.addEventListener('mouseup', handleCanvasMouseUp);
	});
	
	onDestroy(() => {
		stopFrequencySpectrum();
		window.removeEventListener('resize', resizeCanvas);
		canvas?.removeEventListener('mousedown', handleCanvasMouseDown);
		window.removeEventListener('mousemove', handleCanvasMouseMove);
		window.removeEventListener('mouseup', handleCanvasMouseUp);
	});
	
	// Redraw curve immediately when bands change (reactive)
	$effect(() => {
		// Trigger redraw when bands array changes
		if (bands && bands.length > 0 && ctx && canvas && canvasWidth > 0 && canvasHeight > 0) {
			// Use requestAnimationFrame to batch updates
			requestAnimationFrame(() => {
				if (ctx && canvas) {
					redraw();
				}
			});
		}
	});
	
	// Update spectrum when canvas resizes or engine becomes available
	$effect(() => {
		if (canvasWidth > 0 && canvasHeight > 0 && waveformCanvas && engine && waveformCtx) {
			const analyser = engine.getAnalyserNode();
			if (analyser && !isSpectrumRunning) {
				// Restart spectrum if it's not already running
				// Use a small delay to ensure everything is ready
				setTimeout(() => {
					if (!isSpectrumRunning && engine && engine.getAnalyserNode() && waveformCanvas && waveformCtx) {
						startFrequencySpectrum();
					}
				}, 50);
			}
		}
	});
	
	// Get current band reactively - compute inline
	function getCurrentBand() {
		// Ensure bands are initialized
		if (!bands || bands.length === 0) {
			bands = createDefaultBands();
		}
		return bands[selectedBandIndex];
	}
	const filterTypes: FilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch', 'bell', 'lowshelf', 'highshelf'];
	const filterTypeLabels: Record<FilterType, string> = {
		lowpass: 'LP',
		highpass: 'HP',
		bandpass: 'BP',
		notch: 'N',
		bell: 'Bell',
		lowshelf: 'LS',
		highshelf: 'HS'
	};
</script>

<div class="eq-plugin">
	<div class="eq-header">
		<div class="eq-title">EQ Eight</div>
	</div>
	
	<div class="eq-content">
		<!-- Left Control Panel -->
		<div class="eq-controls-panel">
			<div class="eq-control-group">
				<div class="eq-control-label">Freq</div>
				<div class="eq-control-value">{getCurrentBand()?.frequency.toFixed(1)} Hz</div>
				<input
					type="range"
					class="eq-knob"
					min={minFreq}
					max={maxFreq}
					step={1}
					value={getCurrentBand()?.frequency || 1000}
					oninput={(e) => {
						const target = e.target as HTMLInputElement;
						updateSetting('frequency', Number(target.value));
					}}
				/>
			</div>
			
			<div class="eq-control-group">
				<div class="eq-control-label">Gain</div>
				<div class="eq-control-value">{getCurrentBand()?.gain.toFixed(2)} dB</div>
				<input
					type="range"
					class="eq-knob"
					min={minGain}
					max={maxGain}
					step={0.1}
					value={getCurrentBand()?.gain || 0}
					oninput={(e) => {
						const target = e.target as HTMLInputElement;
						updateSetting('gain', Number(target.value));
					}}
				/>
			</div>
			
			<div class="eq-control-group">
				<div class="eq-control-label">Q</div>
				<div class="eq-control-value">{getCurrentBand()?.q.toFixed(2)}</div>
				<input
					type="range"
					class="eq-knob"
					min={0.1}
					max={10}
					step={0.1}
					value={getCurrentBand()?.q || 0.71}
					oninput={(e) => {
						const target = e.target as HTMLInputElement;
						updateSetting('q', Number(target.value));
					}}
				/>
			</div>
		</div>
		
		<!-- Frequency Response Graph -->
		<div class="eq-graph-container" bind:this={canvasContainer}>
			<!-- Frequency Spectrum Background -->
			<canvas bind:this={waveformCanvas} class="eq-spectrum-background"></canvas>
			<!-- Frequency Response Curve (on top) -->
			<canvas bind:this={canvas} class="eq-curve-canvas"></canvas>
		</div>
	</div>
	
	<!-- Band Selector -->
	<div class="eq-bands">
		{#each bands as band, i}
			<button
				class="eq-band-button"
				class:active={band.enabled}
				class:selected={i === selectedBandIndex}
				onclick={() => {
					selectedBandIndex = i;
					if (!band.enabled) {
						updateBand(i, { enabled: true });
					}
				}}
				title="Band {i + 1}"
			>
				<div class="eq-band-icon">
					{filterTypeLabels[band.type] || 'Bell'}
				</div>
				<div class="eq-band-number">{i + 1}</div>
			</button>
		{/each}
	</div>
</div>
