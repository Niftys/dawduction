/**
 * Handles effect processing based on timeline position and pattern assignments
 * Applies effects to audio samples based on active timeline effects and their pattern assignments
 */

class EffectsProcessor {
	constructor() {
		this.effects = []; // Global effect definitions
		this.timelineEffects = []; // Timeline effect instances
		this.patternToTrackId = new Map(); // Maps pattern IDs to track IDs
		this.timelineTrackToAudioTracks = new Map(); // Maps timeline track IDs to audio track IDs
		this.timelineTracks = []; // Timeline tracks (for looking up patternId on pattern tracks)
		this.processor = null; // Reference to processor for accessing ProjectManager
		this.automation = null; // Project automation data
		
		// Performance optimization caches
		this._trackToTimelineTrackId = new Map(); // trackId -> timelineTrackId
		this._activeEffectsCache = new Map(); // trackId_patternId_beat -> activeEffects[]
		this._globalEffectsCache = null; // Cached global effects (beat -> activeEffects[])
		this._lastGlobalCacheBeat = -1;
		this._lastCacheUpdateBeat = -1;
		this._cacheUpdateInterval = 0.1; // Update cache every 0.1 beats (~100ms at 120 BPM)
		
		// Automation optimization caches
		this._automationByEffectInstance = new Map(); // timelineEffectId -> automation[]
		this._sortedPointsCache = new Map(); // automationId -> sortedPoints[]
		this._automationSettingsCache = new Map(); // timelineEffectId_beat -> settings
	}

	initialize(effects, timelineEffects, patternToTrackId, timelineTrackToAudioTracks, processor, timelineTracks, automation) {
		this.effects = effects || [];
		this.timelineEffects = timelineEffects || [];
		this.patternToTrackId = patternToTrackId || new Map();
		this.timelineTrackToAudioTracks = timelineTrackToAudioTracks || new Map();
		this.timelineTracks = timelineTracks || [];
		this.processor = processor || null;
		this.automation = automation || null;
		
		// Clear caches when reinitializing
		this.clearCaches();
		
		// Build automation lookup map for fast access
		this._buildAutomationMap();
		
		// Debug: Log initialization
		if (this.processor && this.processor.port) {
			const automationKeys = automation ? Object.keys(automation) : [];
			this.processor.port.postMessage({
				type: 'debug',
				message: 'EffectsProcessor initialized',
				data: {
					effectsCount: this.effects.length,
					timelineEffectsCount: this.timelineEffects.length,
					timelineTrackMappingSize: this.timelineTrackToAudioTracks.size,
					automationLoaded: !!automation,
					automationKeysCount: automationKeys.length,
					automationKeys: automationKeys.slice(0, 5) // First 5 keys for debugging
				}
			});
		}
	}

	/**
	 * Clear all performance caches (call when project changes)
	 */
	clearCaches() {
		this._trackToTimelineTrackId.clear();
		this._activeEffectsCache.clear();
		this._globalEffectsCache = null;
		this._lastGlobalCacheBeat = -1;
		this._lastCacheUpdateBeat = -1;
		this._automationByEffectInstance.clear();
		this._sortedPointsCache.clear();
		this._automationSettingsCache.clear();
	}
	
	/**
	 * Build automation lookup map indexed by effect instance ID
	 * This avoids iterating through all automation entries every sample
	 */
	_buildAutomationMap() {
		this._automationByEffectInstance.clear();
		this._sortedPointsCache.clear();
		
		if (!this.automation) return;
		
		for (const [automationId, automation] of Object.entries(this.automation)) {
			if (!automation || typeof automation !== 'object') continue;
			if (automation.targetType !== 'effect' || !automation.timelineInstanceId) continue;
			
			const timelineEffectId = automation.timelineInstanceId;
			if (!this._automationByEffectInstance.has(timelineEffectId)) {
				this._automationByEffectInstance.set(timelineEffectId, []);
			}
			// Store automation with its ID for cache lookup
			const automationWithId = { ...automation, id: automationId };
			this._automationByEffectInstance.get(timelineEffectId).push(automationWithId);
			
			// Pre-sort and cache points for this automation
			if (automation.points && automation.points.length > 0) {
				const sortedPoints = [...automation.points].sort((a, b) => a.beat - b.beat);
				this._sortedPointsCache.set(automationId, sortedPoints);
			}
		}
	}

	/**
	 * Update effect settings in real-time
	 * @param {string} effectId - The effect ID to update
	 * @param {Object} settings - New settings object (will be merged with existing settings)
	 */
	updateEffect(effectId, settings) {
		const effect = this.effects.find(e => e.id === effectId);
		if (effect) {
			// Update effect settings
			effect.settings = { ...effect.settings, ...settings };
		}
	}

	/**
	 * Get active effects for a track at a specific timeline position
	 * @param {string} trackId - The track ID to get effects for
	 * @param {number} currentBeat - Current playback position in beats
	 * @param {boolean} isArrangementView - Whether we're in arrangement view
	 * @param {string} patternId - Optional pattern ID for pattern-specific effects
	 * @returns {Array} Array of active effect definitions with their settings
	 */
	getActiveEffects(trackId, currentBeat, isArrangementView, patternId = null) {
		if (!isArrangementView) {
			// In pattern view, return global effects or pattern-specific effects
			// For now, return empty array - pattern view effects can be added later
			return [];
		}

		// Update caches periodically (not every sample)
		const shouldUpdateCache = Math.abs(currentBeat - this._lastCacheUpdateBeat) >= this._cacheUpdateInterval;
		if (shouldUpdateCache) {
			this._updateCaches(currentBeat);
			this._lastCacheUpdateBeat = currentBeat;
		}

		// Check cache first (track-specific)
		const cacheKey = `${trackId}_${patternId || 'null'}_${Math.floor(currentBeat / this._cacheUpdateInterval)}`;
		const cached = this._activeEffectsCache.get(cacheKey);
		if (cached && Math.abs(currentBeat - cached.beat) < this._cacheUpdateInterval * 2) {
			return cached.effects;
		}

		// Optimize: For global effects, calculate once and reuse
		// Check if we need to recalculate global effects
		const beatBucket = Math.floor(currentBeat / this._cacheUpdateInterval);
		const shouldRecalcGlobal = !this._globalEffectsCache || 
		                           Math.abs(currentBeat - this._lastGlobalCacheBeat) >= this._cacheUpdateInterval;
		
		let globalEffects = [];
		if (shouldRecalcGlobal) {
			// Calculate global effects once (effects with no trackId and no patternId)
			globalEffects = this._calculateGlobalEffects(currentBeat);
			this._globalEffectsCache = {
				beat: currentBeat,
				beatBucket: beatBucket,
				effects: globalEffects
			};
			this._lastGlobalCacheBeat = currentBeat;
		} else {
			// Reuse cached global effects
			globalEffects = this._globalEffectsCache.effects;
		}

		// Calculate track-specific effects (pattern-specific or track-specific)
		const trackSpecificEffects = this._calculateTrackSpecificEffects(trackId, currentBeat, patternId);

		// Combine global and track-specific effects
		const activeEffects = [...globalEffects, ...trackSpecificEffects];

		// Store in cache
		this._activeEffectsCache.set(cacheKey, {
			beat: currentBeat,
			effects: activeEffects
		});

		return activeEffects;
	}

	/**
	 * Calculate global effects (effects with no trackId/patternId OR effects on effect tracks)
	 * These apply to all tracks, so we calculate once and reuse
	 */
	_calculateGlobalEffects(currentBeat) {
		const globalEffects = [];
		
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);
			
			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				// Include global effects: no trackId/patternId OR on effect track
				let isGlobal = false;
				if (!timelineEffect.trackId && !timelineEffect.patternId) {
					isGlobal = true;
				} else if (timelineEffect.trackId) {
					// Check if it's on an effect track (which makes it global)
					const effectTimelineTrack = this.timelineTracks.find(t => t.id === timelineEffect.trackId);
					if (effectTimelineTrack && effectTimelineTrack.type === 'effect') {
						isGlobal = true;
					}
				}
				
				if (isGlobal) {
					const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
					if (effectDef) {
						// Apply automation to effect settings
						const automatedSettings = this.applyAutomationToEffect(
							effectDef,
							timelineEffect.id,
							currentBeat,
							startBeat,
							endBeat
						);
						
						globalEffects.push({
							...effectDef,
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat)
						});
					}
				}
			}
		}
		
		return globalEffects;
	}
	
	/**
	 * Calculate track-specific effects (pattern-specific or track-specific)
	 */
	_calculateTrackSpecificEffects(trackId, currentBeat, patternId = null) {
		const trackSpecificEffects = [];
		
		// Use cached timeline track ID lookup
		let timelineTrackId = this._trackToTimelineTrackId.get(trackId);
		if (timelineTrackId === undefined && this.timelineTrackToAudioTracks) {
			// Fallback: calculate if not cached
			for (const [tId, audioTrackIds] of this.timelineTrackToAudioTracks.entries()) {
				if (audioTrackIds.includes(trackId)) {
					timelineTrackId = tId;
					this._trackToTimelineTrackId.set(trackId, tId);
					break;
				}
			}
		}
		
		// Find timeline effects that are active at this position and track-specific
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);
			
			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				// Skip global effects (already handled)
				if (timelineEffect.trackId || timelineEffect.patternId) {
					let shouldApply = false;
					
					// Check pattern assignment
					if (timelineEffect.patternId) {
						if (patternId && timelineEffect.patternId === patternId) {
							shouldApply = true;
						}
					// Note: Effects on effect tracks are now handled in _calculateGlobalEffects
					// This method only handles pattern-specific effects
					
					if (shouldApply) {
						const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
						if (effectDef) {
							// Apply automation to effect settings
							const automatedSettings = this.applyAutomationToEffect(
								effectDef,
								timelineEffect.id,
								currentBeat,
								startBeat,
								endBeat
							);
							
							trackSpecificEffects.push({
								...effectDef,
								settings: automatedSettings,
								progress: (currentBeat - startBeat) / (endBeat - startBeat)
							});
						}
					}
				}
			}
		}
		
		return trackSpecificEffects;
	}
	
	/**
	 * Calculate active effects (uncached version) - DEPRECATED, use _calculateGlobalEffects + _calculateTrackSpecificEffects
	 */
	_calculateActiveEffects(trackId, currentBeat, patternId = null) {
		const activeEffects = [];

		// Use cached timeline track ID lookup
		let timelineTrackId = this._trackToTimelineTrackId.get(trackId);
		if (timelineTrackId === undefined && this.timelineTrackToAudioTracks) {
			// Fallback: calculate if not cached
			for (const [tId, audioTrackIds] of this.timelineTrackToAudioTracks.entries()) {
				if (audioTrackIds.includes(trackId)) {
					timelineTrackId = tId;
					this._trackToTimelineTrackId.set(trackId, tId);
					break;
				}
			}
		}

		// Debug: Log effect matching details (occasionally)
		if (this.processor && this.processor.port && (!this._lastEffectDebugTime || (currentBeat - this._lastEffectDebugTime) > 8)) {
			this._lastEffectDebugTime = currentBeat;
			const matchingDetails = this.timelineEffects.map(te => {
				const startBeat = te.startBeat || 0;
				const endBeat = startBeat + (te.duration || 0);
				const isActive = currentBeat >= startBeat && currentBeat < endBeat;
				let matchStatus = 'not active';
				if (isActive) {
					if (te.patternId) {
						matchStatus = te.patternId === patternId ? 'MATCH (patternId)' : `NO MATCH: patternId mismatch (effect=${te.patternId}, track=${patternId})`;
					} else if (te.trackId) {
						matchStatus = te.trackId === timelineTrackId ? 'MATCH (trackId)' : `NO MATCH: trackId mismatch (effect=${te.trackId}, audioTrack=${timelineTrackId})`;
					} else {
						matchStatus = 'MATCH (global effect)';
					}
				}
				return {
					effectId: te.effectId,
					trackId: te.trackId,
					patternId: te.patternId,
					startBeat,
					duration: te.duration,
					endBeat,
					isActive,
					matchStatus
				};
			});
			this.processor.port.postMessage({
				type: 'debug',
				message: 'Effect matching debug',
				data: {
					trackId,
					patternId,
					timelineTrackId,
					currentBeat: currentBeat.toFixed(2),
					timelineEffectsCount: this.timelineEffects.length,
					timelineEffects: matchingDetails,
					timelineTrackMapping: Array.from(this.timelineTrackToAudioTracks.entries()).map(([tid, aids]) => ({
						timelineTrackId: tid,
						audioTrackIds: aids,
						includesCurrentTrack: aids.includes(trackId)
					}))
				}
			});
		}

		// Find timeline effects that are active at this position
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);

			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				let shouldApply = false;
				let matchReason = '';

				// Check pattern assignment first
				if (timelineEffect.patternId) {
					// Effect is assigned to a specific pattern
					if (patternId && timelineEffect.patternId === patternId) {
						shouldApply = true;
						matchReason = 'patternId match';
					} else {
						matchReason = `patternId mismatch: effect=${timelineEffect.patternId}, track=${patternId}`;
					}
				} else if (timelineEffect.trackId) {
					// Effect is assigned to a specific timeline track
					// Effects can ONLY be on effect tracks (not pattern or envelope tracks)
					const effectTimelineTrack = this.timelineTracks.find(t => t.id === timelineEffect.trackId);
					if (effectTimelineTrack) {
						if (effectTimelineTrack.type === 'effect') {
							// Effect is on an effect track - apply globally to all tracks
							shouldApply = true;
							matchReason = 'effect track (global)';
						} else {
							// Effect is incorrectly placed on a non-effect track (shouldn't happen, but handle gracefully)
							matchReason = `effect on wrong track type: effect=${timelineEffect.trackId} (type=${effectTimelineTrack.type}, should be 'effect')`;
						}
					} else {
						// Timeline track not found - this shouldn't happen but handle gracefully
						// Debug: Log this case
						if (this.processor && this.processor.port && Math.random() < 0.1) {
							this.processor.port.postMessage({
								type: 'debug',
								message: 'Timeline track not found for effect',
								data: {
									effectTrackId: timelineEffect.trackId,
									availableTrackIds: this.timelineTracks.map(t => t.id),
									timelineTracksCount: this.timelineTracks.length
								}
							});
						}
						matchReason = `trackId mismatch: effect=${timelineEffect.trackId} (track not found), audioTrack=${timelineTrackId}`;
					}
				} else {
					// Global effect (no trackId or patternId) - applies to all tracks
					shouldApply = true;
					matchReason = 'global effect';
				}

				if (shouldApply) {
					const effectDef = this.effects.find(e => e.id === timelineEffect.effectId);
					if (effectDef) {
						// Apply automation to effect settings
						const automatedSettings = this.applyAutomationToEffect(
							effectDef,
							timelineEffect.id,
							currentBeat,
							startBeat,
							endBeat
						);
						
						activeEffects.push({
							...effectDef,
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat) // 0-1 progress through effect
						});
					} else {
						// Debug: Effect definition not found (throttled to avoid spam)
						if (this.processor && this.processor.port) {
							// Track last log time per effect ID to avoid spam
							const lastLogKey = `missing_effect_${timelineEffect.effectId}`;
							const lastLogTime = this._missingEffectLogTimes?.[lastLogKey] || 0;
							if (!this._missingEffectLogTimes) {
								this._missingEffectLogTimes = {};
							}
							
							// Only log once every 4 beats to avoid infinite loops
							if (currentBeat - lastLogTime > 4) {
								this._missingEffectLogTimes[lastLogKey] = currentBeat;
								this.processor.port.postMessage({
									type: 'debug',
									message: 'Effect definition not found',
									data: { 
										effectId: timelineEffect.effectId, 
										availableIds: this.effects.map(e => e.id),
										matchReason
									}
								});
							}
						}
					}
				} else {
					// Debug: Log why effect didn't match (occasionally)
					if (this.processor && this.processor.port && Math.random() < 0.1) {
						this.processor.port.postMessage({
							type: 'debug',
							message: 'Effect not matching',
							data: {
								effectId: timelineEffect.effectId,
								matchReason,
								effectTrackId: timelineEffect.trackId,
								effectPatternId: timelineEffect.patternId,
								audioTrackId: trackId,
								audioPatternId: patternId,
								audioTimelineTrackId: timelineTrackId,
								currentBeat: currentBeat.toFixed(2),
								effectTimeRange: `${startBeat.toFixed(2)}-${endBeat.toFixed(2)}`
							}
						});
					}
				}
			}
		}

		return activeEffects;
	}

	/**
	 * Update performance caches to avoid expensive lookups per-sample
	 * Called periodically (every ~0.1 beats) instead of every sample
	 */
	_updateCaches(currentBeat) {
		// Build trackId -> timelineTrackId map (only if not already built)
		if (this._trackToTimelineTrackId.size === 0 && this.timelineTrackToAudioTracks) {
			for (const [timelineTrackId, audioTrackIds] of this.timelineTrackToAudioTracks.entries()) {
				for (const audioTrackId of audioTrackIds) {
					if (!this._trackToTimelineTrackId.has(audioTrackId)) {
						this._trackToTimelineTrackId.set(audioTrackId, timelineTrackId);
					}
				}
			}
		}

		// Clear old cache entries (keep only recent ones)
		const cacheKeysToDelete = [];
		for (const [key, cached] of this._activeEffectsCache.entries()) {
			if (Math.abs(currentBeat - cached.beat) > this._cacheUpdateInterval * 4) {
				cacheKeysToDelete.push(key);
			}
		}
		for (const key of cacheKeysToDelete) {
			this._activeEffectsCache.delete(key);
		}
	}

	/**
	 * Apply effects to an audio sample
	 * @param {number} sample - Input audio sample
	 * @param {Array} activeEffects - Array of active effects to apply
	 * @returns {number} Processed audio sample
	 */
	processSample(sample, activeEffects) {
		let processed = sample;

		if (activeEffects && activeEffects.length > 0) {
			for (const effect of activeEffects) {
				processed = this.applyEffect(processed, effect);
			}
		}

		return processed;
	}

	/**
	 * Apply automation curves to effect settings
	 * @param {Object} effectDef - Effect definition
	 * @param {string} timelineEffectId - Timeline effect instance ID
	 * @param {number} currentBeat - Current playback position
	 * @param {number} startBeat - Effect start beat
	 * @param {number} endBeat - Effect end beat
	 * @returns {Object} Effect settings with automation applied
	 */
	applyAutomationToEffect(effectDef, timelineEffectId, currentBeat, startBeat, endBeat) {
		if (!this.automation || !effectDef) {
			return effectDef.settings || {};
		}

		// Check cache first (cache per 0.1 beats to reduce recalculations)
		const cacheKey = `${timelineEffectId}_${Math.floor(currentBeat / 0.1)}`;
		const cached = this._automationSettingsCache.get(cacheKey);
		if (cached && Math.abs(currentBeat - cached.beat) < 0.15) {
			return cached.settings;
		}

		// Start with base settings
		const automatedSettings = { ...(effectDef.settings || {}) };

		// Use pre-built automation map for fast lookup
		const automations = this._automationByEffectInstance.get(timelineEffectId);
		if (automations && automations.length > 0) {
			for (const auto of automations) {
				// Verify this automation is for this effect (should already be filtered, but double-check)
				if (auto.targetId === effectDef.id) {
					// Get cached sorted points or sort if not cached
					let sortedPoints = this._sortedPointsCache.get(auto.id || '');
					if (!sortedPoints && auto.points && auto.points.length > 0) {
						sortedPoints = [...auto.points].sort((a, b) => a.beat - b.beat);
						if (auto.id) {
							this._sortedPointsCache.set(auto.id, sortedPoints);
						}
					}
					
					// Get automation value at current beat (using cached sorted points)
					const value = this.getAutomationValueAtBeatFast(sortedPoints || [], currentBeat, auto.min || 0, auto.max || 1);
					
					// Apply to the parameter
					automatedSettings[auto.parameterKey] = value;
				}
			}
		}
		
		// Cache the result
		this._automationSettingsCache.set(cacheKey, {
			beat: currentBeat,
			settings: automatedSettings
		});
		
		// Clean old cache entries (keep only recent ones)
		if (this._automationSettingsCache.size > 100) {
			const keysToDelete = [];
			for (const [key, cached] of this._automationSettingsCache.entries()) {
				if (Math.abs(currentBeat - cached.beat) > 1.0) {
					keysToDelete.push(key);
				}
			}
			for (const key of keysToDelete) {
				this._automationSettingsCache.delete(key);
			}
		}

		return automatedSettings;
	}

	/**
	 * Get automation value at a specific beat using linear interpolation
	 * @param {Array} points - Automation points array
	 * @param {number} beat - Beat position
	 * @param {number} min - Minimum value
	 * @param {number} max - Maximum value
	 * @returns {number} Interpolated value
	 */
	getAutomationValueAtBeat(points, beat, min, max) {
		if (!points || points.length === 0) {
			return (min + max) / 2; // Default to middle value
		}

		// Sort points by beat (fallback for uncached calls)
		const sortedPoints = [...points].sort((a, b) => a.beat - b.beat);
		return this.getAutomationValueAtBeatFast(sortedPoints, beat, min, max);
	}
	
	/**
	 * Fast version that assumes points are already sorted
	 * Uses binary search for O(log n) lookup instead of O(n)
	 * @param {Array} sortedPoints - Pre-sorted automation points array
	 * @param {number} beat - Beat position
	 * @param {number} min - Minimum value
	 * @param {number} max - Maximum value
	 * @returns {number} Interpolated value
	 */
	getAutomationValueAtBeatFast(sortedPoints, beat, min, max) {
		if (!sortedPoints || sortedPoints.length === 0) {
			return (min + max) / 2; // Default to middle value
		}

		// Before first point
		if (beat <= sortedPoints[0].beat) {
			return sortedPoints[0].value;
		}

		// After last point
		if (beat >= sortedPoints[sortedPoints.length - 1].beat) {
			return sortedPoints[sortedPoints.length - 1].value;
		}

		// Binary search for the two points to interpolate between
		let left = 0;
		let right = sortedPoints.length - 1;
		
		while (left < right - 1) {
			const mid = Math.floor((left + right) / 2);
			if (sortedPoints[mid].beat <= beat) {
				left = mid;
			} else {
				right = mid;
			}
		}
		
		// Interpolate between sortedPoints[left] and sortedPoints[right]
		const p1 = sortedPoints[left];
		const p2 = sortedPoints[right];
		const t = (beat - p1.beat) / (p2.beat - p1.beat);
		return p1.value + (p2.value - p1.value) * t;
	}

	/**
	 * Apply a single effect to a sample
	 * @param {number} sample - Input audio sample
	 * @param {Object} effect - Effect definition with settings
	 * @returns {number} Processed audio sample
	 */
	applyEffect(sample, effect) {
		if (!effect || !effect.settings) return sample;

		const settings = effect.settings;
		// Get sample rate from processor if available, otherwise use default
		const sampleRate = (this.processor && this.processor.sampleRate) ? this.processor.sampleRate : 44100;

		switch (effect.type) {
		case 'reverb':
			// Simple reverb using wet/dry mix
			// Real reverb would need delay buffers, but this provides basic effect
			const reverbWet = settings.wet !== undefined ? settings.wet : 0.5;
			const reverbDry = settings.dry !== undefined ? settings.dry : 0.5;
			const reverbRoomSize = settings.roomSize !== undefined ? settings.roomSize : 0.7;
			// Make reverb more noticeable - add some resonance/feedback effect
			const reverbAmount = reverbRoomSize * 0.6; // Increased for more noticeable effect
			// Add harmonic enhancement and slight delay-like effect to make it more audible
			const reverbEnhanced = sample * (1 + reverbWet * reverbAmount);
			// Add slight feedback for more realistic reverb tail
			const reverbFeedback = this._reverbFeedback || 0;
			this._reverbFeedback = reverbEnhanced * 0.3 * reverbRoomSize;
			return sample * reverbDry + (reverbEnhanced + reverbFeedback * 0.5) * reverbWet;

		case 'delay':
			// Delay with proper delay buffer and feedback
			const delayWet = settings.wet !== undefined ? settings.wet : 0.5;
			const delayDry = settings.dry !== undefined ? settings.dry : 0.5;
			const delayFeedback = settings.feedback !== undefined ? settings.feedback : 0.5;
			const delayTime = settings.time !== undefined ? settings.time : 0.25;
			// Use delay buffer for proper echo effect
			if (!this._delayBuffers) {
				this._delayBuffers = new Map(); // trackId -> { buffer, writeIndex }
			}
			const delayKey = 'global'; // Could be per-track if needed
			const maxDelayTime = 2.0; // Maximum delay time in seconds (from UI max)
			const bufferSize = Math.floor(sampleRate * maxDelayTime * 1.5); // Buffer for max delay + safety
			
			if (!this._delayBuffers.has(delayKey)) {
				this._delayBuffers.set(delayKey, {
					buffer: new Float32Array(bufferSize),
					writeIndex: 0
				});
			}
			const delayState = this._delayBuffers.get(delayKey);
			
			// Calculate read position based on delayTime (in samples)
			const delaySamples = Math.floor(delayTime * sampleRate);
			const delayReadIndex = (delayState.writeIndex - delaySamples + bufferSize) % bufferSize;
			
			// Read delayed sample (with linear interpolation for smooth changes)
			const delayReadIndex1 = Math.floor(delayReadIndex);
			const delayReadIndex2 = (delayReadIndex1 + 1) % bufferSize;
			const delayFrac = delayReadIndex - delayReadIndex1;
			const delayedSample1 = delayState.buffer[delayReadIndex1];
			const delayedSample2 = delayState.buffer[delayReadIndex2];
			const delayedSample = delayedSample1 * (1 - delayFrac) + delayedSample2 * delayFrac;
			
			// Write current sample + feedback
			delayState.buffer[delayState.writeIndex] = sample + (delayedSample * delayFeedback);
			delayState.writeIndex = (delayState.writeIndex + 1) % bufferSize;
			
			// Mix dry and wet
			return sample * delayDry + delayedSample * delayWet;

		case 'filter':
			// Simple low-pass filter approximation
			const filterFreq = settings.frequency !== undefined ? settings.frequency : 0.5;
			const filterResonance = settings.resonance !== undefined ? settings.resonance : 0.5;
			// Map frequency (0-1) to a more noticeable filter effect
			// Lower frequency = more filtering (darker sound)
			const filterAmount = filterFreq; // 0 = full filter, 1 = no filter
			// Add resonance boost to make it more audible
			const resonanceBoost = 1 + (filterResonance * 0.3);
			return sample * filterAmount * resonanceBoost;

		case 'distortion':
			// Simple distortion/saturation
			const distortionDrive = settings.drive !== undefined ? settings.drive : 0.5;
			const distortionAmount = settings.amount !== undefined ? settings.amount : 0.3;
			// Apply drive and tanh saturation - make it more aggressive
			const driven = sample * (1 + distortionDrive * 4); // Increased from 2
			const distorted = Math.tanh(driven);
			// Mix between dry and distorted
			return sample * (1 - distortionAmount) + distorted * distortionAmount;

		case 'compressor':
			// Simple compression
			const compThreshold = settings.threshold !== undefined ? settings.threshold : 0.7;
			const compRatio = settings.ratio !== undefined ? settings.ratio : 4;
			const compAttack = settings.attack !== undefined ? settings.attack : 0.01;
			const compRelease = settings.release !== undefined ? settings.release : 0.1;
			const absSample = Math.abs(sample);
			if (absSample > compThreshold) {
				const excess = absSample - compThreshold;
				const compressed = compThreshold + excess / compRatio;
				return Math.sign(sample) * compressed;
			}
			return sample;

		case 'chorus':
			// Chorus would need delay buffers - simple approximation for now
			const chorusWet = settings.wet !== undefined ? settings.wet : 0.5;
			const chorusRate = settings.rate !== undefined ? settings.rate : 0.5;
			const chorusDepth = settings.depth !== undefined ? settings.depth : 0.6;
			const chorusDelay = settings.delay !== undefined ? settings.delay : 0.02;
			// Make chorus more noticeable - use delay buffer with modulation
			if (!this._chorusBuffers) {
				this._chorusBuffers = new Map();
				this._chorusPhases = new Map();
			}
			const chorusKey = 'global';
			if (!this._chorusBuffers.has(chorusKey)) {
				const bufferSize = Math.floor(sampleRate * chorusDelay * 2);
				this._chorusBuffers.set(chorusKey, {
					buffer: new Float32Array(bufferSize),
					writeIndex: 0
				});
				this._chorusPhases.set(chorusKey, 0);
			}
			const chorusState = this._chorusBuffers.get(chorusKey);
			const chorusPhase = this._chorusPhases.get(chorusKey);
			// Write current sample
			chorusState.buffer[chorusState.writeIndex] = sample;
			chorusState.writeIndex = (chorusState.writeIndex + 1) % chorusState.buffer.length;
			// Calculate modulated delay (LFO)
			const lfo = Math.sin(chorusPhase * 2 * Math.PI * chorusRate);
			const modulatedDelay = chorusDelay * (1 + lfo * chorusDepth);
			const chorusReadIndex = (chorusState.writeIndex - Math.floor(modulatedDelay * sampleRate) + chorusState.buffer.length) % chorusState.buffer.length;
			const chorusedSample = chorusState.buffer[chorusReadIndex];
			// Update phase
			this._chorusPhases.set(chorusKey, (chorusPhase + chorusRate / sampleRate) % 1.0);
			// Mix dry and wet
			return sample * (1 - chorusWet) + chorusedSample * chorusWet;

		default:
			return sample;
		}
	}
}

