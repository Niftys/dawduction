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

	/**
	 * Flush extremely small float values to zero to avoid denormals/subnormals
	 * Denormals can severely impact CPU performance in deep tails/low frequencies.
	 */
	_flushDenormals(x) {
		// Threshold tuned to be inaudible and effective for JS engines
		return (x > -1e-20 && x < 1e-20) ? 0 : x;
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
		
		for (const automationId in this.automation) {
			const automation = this.automation[automationId];
			if (!automation || typeof automation !== 'object') continue;
			if (automation.targetType !== 'effect' || !automation.timelineInstanceId) continue;
			
			const timelineEffectId = automation.timelineInstanceId;
			if (!this._automationByEffectInstance.has(timelineEffectId)) {
				this._automationByEffectInstance.set(timelineEffectId, []);
			}
			// Store automation with its ID for cache lookup
			const automationWithId = Object.assign({}, automation, { id: automationId });
			this._automationByEffectInstance.get(timelineEffectId).push(automationWithId);
			
			// Pre-sort and cache points for this automation
			if (automation.points && automation.points.length > 0) {
				const sortedPoints = automation.points.slice().sort((a, b) => a.beat - b.beat);
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
			// Update effect settings - deep merge to ensure all band settings are preserved
			if (effect.type === 'equalizer' && settings.band0 !== undefined) {
				// For equalizer, completely replace settings to ensure all bands are updated
				effect.settings = Object.assign({}, settings);
			} else {
				// For other effects, merge settings
				effect.settings = Object.assign({}, effect.settings || {}, settings);
			}
			
			// If this is an equalizer effect, invalidate EQ state cache to force recalculation
			// This ensures immediate updates when EQ bands are changed
			if (effect.type === 'equalizer' && this._eqStates) {
				// Find all timeline effects using this effect ID and invalidate their EQ states
				const timelineEffectIds = this.timelineEffects
					.filter(te => te.effectId === effectId)
					.map(te => te.id);
				
				// Clear EQ states for this effect (both global and timeline-specific)
				// The EQ processor will recreate states with new settings on next process call
				for (const [key, state] of this._eqStates.entries()) {
					// Invalidate if it's the global state or matches a timeline effect using this effect
					const isGlobal = key === 'global';
					const isTimelineEffect = timelineEffectIds.includes(key);
					
					if (isGlobal || isTimelineEffect) {
						// Invalidate cached values to force recalculation
						state.cachedSampleRate = -1;
						for (let i = 0; i < state.bands.length; i++) {
							state.bands[i].cachedFreq = -1;
							state.bands[i].cachedQ = -1;
							state.bands[i].cachedGain = -1;
							state.bands[i].cachedType = null;
							state.bands[i].coeffs = null;
						}
					}
				}
			}
		}
	}

	/**
	 * Get active effects for a track at a specific timeline position (track-based only)
	 * @param {string} trackId - The audio track ID to get effects for
	 * @param {number} currentBeat - Current playback position in beats
	 * @param {boolean} isArrangementView - Whether we're in arrangement view
	 * @returns {Array} Array of active effect definitions with their settings
	 */
	getActiveEffects(trackId, currentBeat, isArrangementView) {
		if (!isArrangementView) {
			// No per-track timeline effects outside arrangement view (for now)
			return [];
		}

		// Update caches periodically (not every sample)
		const shouldUpdateCache = Math.abs(currentBeat - this._lastCacheUpdateBeat) >= this._cacheUpdateInterval;
		if (shouldUpdateCache) {
			this._updateCaches(currentBeat);
			this._lastCacheUpdateBeat = currentBeat;
		}

		// Check cache first (track-specific)
		const cacheKey = trackId + '_' + Math.floor(currentBeat / this._cacheUpdateInterval);
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

		// Calculate track-specific effects (track-targeted only)
		const trackSpecificEffects = this._calculateTrackSpecificEffects(trackId, currentBeat);

		// Combine global and track-specific effects
		const activeEffects = globalEffects.concat(trackSpecificEffects);

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
				// Skip effects with targetTrackId - those are track-specific, not global
				if (timelineEffect.targetTrackId) {
					continue;
				}
				
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
						
						globalEffects.push(Object.assign({}, effectDef, {
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat),
							timelineEffectId: timelineEffect.id // Include timeline effect ID for buffer isolation
						}));
					}
				}
			}
		}
		
		return globalEffects;
	}
	
	/**
	 * Calculate track-specific effects (track-targeted only)
	 */
	_calculateTrackSpecificEffects(trackId, currentBeat) {
		const trackSpecificEffects = [];
		
		// Use cached timeline track ID lookup
		let timelineTrackId = this._trackToTimelineTrackId.get(trackId);
		if (timelineTrackId === undefined && this.timelineTrackToAudioTracks) {
			// Fallback: calculate if not cached
			const entries = this.timelineTrackToAudioTracks.entries();
			for (let entry = entries.next(); !entry.done; entry = entries.next()) {
				const tId = entry.value[0];
				const audioTrackIds = entry.value[1];
				if (audioTrackIds.includes(trackId)) {
					timelineTrackId = tId;
					this._trackToTimelineTrackId.set(trackId, tId);
					break;
				}
			}
		}
		
		// Find timeline effects that are active at this position and targeted to a track
		for (const timelineEffect of this.timelineEffects) {
			const startBeat = timelineEffect.startBeat || 0;
			const endBeat = startBeat + (timelineEffect.duration || 0);
			
			// Check if effect is active at current position
			if (currentBeat >= startBeat && currentBeat < endBeat) {
				// Only process effects with targetTrackId (track-specific inserts)
				// Global effects are handled in _calculateGlobalEffects
				if (!timelineEffect.targetTrackId) {
					continue;
				}
				
				// Check track assignment (per-track insert)
				let shouldApply = false;
				if (timelineTrackId && timelineEffect.targetTrackId === timelineTrackId) {
					shouldApply = true;
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
						
						trackSpecificEffects.push(Object.assign({}, effectDef, {
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat),
							timelineEffectId: timelineEffect.id // Include timeline effect ID for buffer isolation
						}));
					}
				}
			}
		}
		
		return trackSpecificEffects;
	}
	
	/**
	 * Calculate active effects (uncached version) - DEPRECATED
	 */
	_calculateActiveEffects(trackId, currentBeat) {
		const activeEffects = [];

		// Use cached timeline track ID lookup
		let timelineTrackId = this._trackToTimelineTrackId.get(trackId);
		if (timelineTrackId === undefined && this.timelineTrackToAudioTracks) {
			// Fallback: calculate if not cached
			const entries = this.timelineTrackToAudioTracks.entries();
			for (let entry = entries.next(); !entry.done; entry = entries.next()) {
				const tId = entry.value[0];
				const audioTrackIds = entry.value[1];
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
					if (te.targetTrackId) {
						matchStatus = te.targetTrackId === timelineTrackId ? 'MATCH (targetTrackId)' : 'NO MATCH: targetTrackId mismatch (effect=' + te.targetTrackId + ', audioTrack=' + timelineTrackId + ')';
					} else if (te.trackId) {
						matchStatus = 'GLOBAL (effect track)';
					} else {
						matchStatus = 'MATCH (global effect)';
					}
				}
				return {
					effectId: te.effectId,
					trackId: te.trackId,
					targetTrackId: te.targetTrackId,
					startBeat,
					duration: te.duration,
					endBeat,
					isActive,
					matchStatus
				};
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

				if (timelineEffect.trackId) {
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
							matchReason = 'effect on wrong track type: effect=' + timelineEffect.trackId + ' (type=' + effectTimelineTrack.type + ', should be \'effect\')';
						}
					} else {
						// Timeline track not found - this shouldn't happen but handle gracefully
						matchReason = 'trackId mismatch: effect=' + timelineEffect.trackId + ' (track not found), audioTrack=' + timelineTrackId;
					}
				} else if (timelineEffect.targetTrackId) {
					// Per-track insert
					if (timelineEffect.targetTrackId === timelineTrackId) {
						shouldApply = true;
						matchReason = 'targetTrackId match';
					} else {
						matchReason = 'targetTrackId mismatch: effect=' + timelineEffect.targetTrackId + ', audioTrack=' + timelineTrackId;
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
						
						activeEffects.push(Object.assign({}, effectDef, {
							settings: automatedSettings,
							progress: (currentBeat - startBeat) / (endBeat - startBeat) // 0-1 progress through effect
						}));
					} else {
						// Debug: Effect definition not found (throttled to avoid spam)
						if (this.processor && this.processor.port) {
						// Track last log time per effect ID to avoid spam
						const lastLogKey = 'missing_effect_' + timelineEffect.effectId;
						if (!this._missingEffectLogTimes) {
							this._missingEffectLogTimes = {};
						}
						const lastLogTime = (this._missingEffectLogTimes && this._missingEffectLogTimes[lastLogKey]) ? this._missingEffectLogTimes[lastLogKey] : 0;
							
							// Only log once every 4 beats to avoid infinite loops
							if (currentBeat - lastLogTime > 4) {
								this._missingEffectLogTimes[lastLogKey] = currentBeat;
							}
						}
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
			const entries = this.timelineTrackToAudioTracks.entries();
			for (let entry = entries.next(); !entry.done; entry = entries.next()) {
				const timelineTrackId = entry.value[0];
				const audioTrackIds = entry.value[1];
				for (let i = 0; i < audioTrackIds.length; i++) {
					const audioTrackId = audioTrackIds[i];
					if (!this._trackToTimelineTrackId.has(audioTrackId)) {
						this._trackToTimelineTrackId.set(audioTrackId, timelineTrackId);
					}
				}
			}
		}

		// Clear old cache entries (keep only recent ones)
		const cacheKeysToDelete = [];
		const cacheEntries = this._activeEffectsCache.entries();
		for (let entry = cacheEntries.next(); !entry.done; entry = cacheEntries.next()) {
			const key = entry.value[0];
			const cached = entry.value[1];
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
		let processed = Number.isFinite(sample) ? sample : 0;
		processed = this._flushDenormals(processed);

		if (activeEffects && activeEffects.length > 0) {
			for (const effect of activeEffects) {
				// Smooth fade-in for effects (prevent clicks when effect starts)
				// Use progress (0-1) to fade in over first ~10ms (0.01 beats at 120 BPM)
				let effectMix = 1.0;
				if (effect.progress !== undefined && effect.progress < 0.01) {
					// Fade in over first 0.01 beats (~10ms at 120 BPM)
					effectMix = Math.min(1.0, effect.progress / 0.01);
				}
				
				const effectOutput = this._flushDenormals(this.applyEffect(processed, effect));
				// Crossfade between dry and wet to prevent clicks
				processed = processed * (1 - effectMix) + effectOutput * effectMix;
				processed = this._flushDenormals(processed);
				
				// Safety: prevent NaN/Infinity from propagating and killing audio
				if (!Number.isFinite(processed)) {
					processed = 0;
				}
			}
		}

		// Final safety clamp
		if (!Number.isFinite(processed)) {
			return 0;
		}

		// Flush denormals before clamp (keeps state clean)
		processed = this._flushDenormals(processed);

		// Hard clamp to [-2, 2] to avoid runaway values
		if (processed > 2) processed = 2;
		if (processed < -2) processed = -2;

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
		const cacheKey = timelineEffectId + '_' + Math.floor(currentBeat / 0.1);
		const cached = this._automationSettingsCache.get(cacheKey);
		if (cached && Math.abs(currentBeat - cached.beat) < 0.15) {
			return cached.settings;
		}

		// Start with base settings
		const automatedSettings = Object.assign({}, effectDef.settings || {});

		// Use pre-built automation map for fast lookup
		const automations = this._automationByEffectInstance.get(timelineEffectId);
		if (automations && automations.length > 0) {
			for (const auto of automations) {
				// Verify this automation is for this effect (should already be filtered, but double-check)
				if (auto.targetId === effectDef.id) {
					// Get cached sorted points or sort if not cached
					let sortedPoints = this._sortedPointsCache.get(auto.id || '');
					if (!sortedPoints && auto.points && auto.points.length > 0) {
						sortedPoints = auto.points.slice().sort((a, b) => a.beat - b.beat);
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
			const cacheEntries = this._automationSettingsCache.entries();
			for (let entry = cacheEntries.next(); !entry.done; entry = cacheEntries.next()) {
				const key = entry.value[0];
				const cached = entry.value[1];
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
		const sortedPoints = points.slice().sort((a, b) => a.beat - b.beat);
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
		
		// Use effect handlers (always available after build)
		if (typeof EffectHandlers !== 'undefined' && EffectHandlers[effect.type]) {
			const HandlerClass = EffectHandlers[effect.type];
			if (!this._effectHandlerInstances) {
				this._effectHandlerInstances = new Map();
			}
			if (!this._effectHandlerInstances.has(effect.type)) {
				this._effectHandlerInstances.set(effect.type, new HandlerClass(this));
			}
			const handler = this._effectHandlerInstances.get(effect.type);
			return handler.process(sample, settings, effect);
		}

		// Unknown effect type
		return sample;
	}
}
