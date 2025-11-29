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
			// Update effect settings
			effect.settings = Object.assign({}, effect.settings || {}, settings);
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
				// Skip global effects (already handled)
				if (timelineEffect.trackId || timelineEffect.targetTrackId) {
					let shouldApply = false;
					
					// Check track assignment (per-track insert)
					if (timelineEffect.targetTrackId && timelineTrackId) {
						if (timelineEffect.targetTrackId === timelineTrackId) {
							shouldApply = true;
						}
					} else if (timelineEffect.trackId) {
						// Effects on effect tracks are handled as global in _calculateGlobalEffects
						shouldApply = false;
					}
					// Note: Effects on effect tracks are handled in _calculateGlobalEffects
					
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
			this.processor.port.postMessage({
				type: 'debug',
				message: 'Effect matching debug',
				data: {
					trackId,
					timelineTrackId,
					currentBeat: currentBeat.toFixed(2),
					timelineEffectsCount: this.timelineEffects.length,
					timelineEffects: matchingDetails,
					timelineTrackMapping: (function() {
						const result = [];
						const entries = this.timelineTrackToAudioTracks.entries();
						for (let entry = entries.next(); !entry.done; entry = entries.next()) {
							const tid = entry.value[0];
							const aids = entry.value[1];
							result.push({
								timelineTrackId: tid,
								audioTrackIds: aids,
								includesCurrentTrack: aids.includes(trackId)
							});
						}
						return result;
					}.call(this))
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
								targetTrackId: timelineEffect.targetTrackId,
								audioTrackId: trackId,
								audioTimelineTrackId: timelineTrackId,
								currentBeat: currentBeat.toFixed(2),
								effectTimeRange: startBeat.toFixed(2) + '-' + endBeat.toFixed(2)
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
		// Get sample rate from processor if available, otherwise use default
		const sampleRate = (this.processor && this.processor.sampleRate) ? this.processor.sampleRate : 44100;

		switch (effect.type) {
		case 'reverb':
			// Proper reverb using Schroeder reverb algorithm with multiple delay taps
			// Parameters can go from 0 to very high values for maximum flexibility
			const reverbWet = settings.wet !== undefined ? Math.max(0, Math.min(1, settings.wet)) : 0.5;
			const reverbDry = settings.dry !== undefined ? Math.max(0, Math.min(1, settings.dry)) : 0.5;
			// Room size: 0 = small room, 1 = huge hall (maps to 0.02s to 3.0s reverb time)
			const reverbRoomSize = settings.roomSize !== undefined ? Math.max(0, Math.min(1, settings.roomSize)) : 0.5;
			// Dampening: 0 = bright, 1 = very dark (lowpass filter cutoff)
			const reverbDampening = settings.dampening !== undefined ? Math.max(0, Math.min(1, settings.dampening)) : 0.5;
			
			// Initialize reverb buffers if needed
			if (!this._reverbBuffers) {
				this._reverbBuffers = new Map();
			}
			// Use timeline effect ID for buffer isolation (each effect instance gets its own buffers)
			const reverbKey = effect.timelineEffectId || 'global';
			
			if (!this._reverbBuffers.has(reverbKey)) {
				// Create multiple comb filters and allpass filters for realistic reverb
				// Using prime numbers for delay times to avoid comb filtering artifacts
				const maxReverbTime = 3.0; // Maximum reverb time in seconds
				const reverbBufferSize = Math.floor(sampleRate * maxReverbTime * 1.5);
				
				// 4 comb filters with different delay times (in samples)
				const combDelays = [
					Math.floor(sampleRate * 0.0297), // ~30ms
					Math.floor(sampleRate * 0.0371), // ~37ms
					Math.floor(sampleRate * 0.0411), // ~41ms
					Math.floor(sampleRate * 0.0437)  // ~44ms
				];
				
				// 2 allpass filters for diffusion
				const allpassDelays = [
					Math.floor(sampleRate * 0.005), // ~5ms
					Math.floor(sampleRate * 0.0017) // ~1.7ms
				];
				
				this._reverbBuffers.set(reverbKey, {
					// Comb filter buffers and indices
					combBuffers: combDelays.map(() => new Float32Array(reverbBufferSize)),
					combIndices: combDelays.map(() => 0),
					combDelays: combDelays,
					combFeedbacks: combDelays.map(() => 0),
					
					// Allpass filter buffers and indices
					allpassBuffers: allpassDelays.map(() => new Float32Array(reverbBufferSize)),
					allpassIndices: allpassDelays.map(() => 0),
					allpassDelays: allpassDelays,
					
					// Lowpass filter states for dampening (one per comb filter)
					lowpassStates: combDelays.map(() => 0)
				});
			}
			
			const reverbState = this._reverbBuffers.get(reverbKey);
			if (!reverbState) {
				return sample; // Safety check
			}
			
			// Map room size to reverb time (0.02s to 3.0s)
			const reverbTime = 0.02 + (reverbRoomSize * 2.98);
			// Calculate feedback for comb filters based on reverb time
			// Longer reverb time = higher feedback
			const baseFeedback = Math.pow(0.001, reverbState.combDelays[0] / (sampleRate * reverbTime));
			
			// Process through allpass filters first (for diffusion)
			let processed = sample;
			for (let i = 0; i < reverbState.allpassDelays.length; i++) {
				const delay = reverbState.allpassDelays[i];
				const readIndex = (reverbState.allpassIndices[i] - delay + reverbState.allpassBuffers[i].length) % reverbState.allpassBuffers[i].length;
				const delayed = reverbState.allpassBuffers[i][readIndex];
				
				// Allpass filter: output = input + delayed * feedback, store input - delayed * feedback
				const allpassFeedback = 0.5; // Fixed feedback for allpass
				const output = processed + delayed * allpassFeedback;
				reverbState.allpassBuffers[i][reverbState.allpassIndices[i]] = processed - delayed * allpassFeedback;
				reverbState.allpassIndices[i] = (reverbState.allpassIndices[i] + 1) % reverbState.allpassBuffers[i].length;
				processed = output;
			}
			
			// Process through comb filters (for reverb tail)
			let reverbOutput = 0;
			for (let i = 0; i < reverbState.combDelays.length; i++) {
				const delay = reverbState.combDelays[i];
				const readIndex = (reverbState.combIndices[i] - delay + reverbState.combBuffers[i].length) % reverbState.combBuffers[i].length;
				const delayed = reverbState.combBuffers[i][readIndex];
				
				// Apply dampening (lowpass filter) to delayed signal
				let dampened = delayed;
				if (reverbDampening > 0) {
					// Lowpass filter: cutoff frequency decreases with dampening
					// 0 = no filtering, 1 = very dark (cutoff ~500Hz)
					const cutoff = 20000 * (1 - reverbDampening * 0.975); // 20kHz to 500Hz
					const rc = 1.0 / (cutoff * 2 * Math.PI / sampleRate);
					const alpha = 1.0 / (1.0 + rc);
					reverbState.lowpassStates[i] = alpha * dampened + (1 - alpha) * reverbState.lowpassStates[i];
					dampened = reverbState.lowpassStates[i];
				}
				
				// Calculate feedback based on reverb time
				const feedback = baseFeedback * (1 - reverbDampening * 0.3); // Slightly reduce feedback with dampening
				
				// Write input + feedback to buffer
				reverbState.combBuffers[i][reverbState.combIndices[i]] = processed + dampened * feedback;
				reverbState.combIndices[i] = (reverbState.combIndices[i] + 1) % reverbState.combBuffers[i].length;
				
				// Add to reverb output
				reverbOutput += dampened;
			}
			
			// Normalize and mix
			reverbOutput /= reverbState.combDelays.length; // Average the comb filters
			
			// Mix dry and wet signals
			return sample * reverbDry + reverbOutput * reverbWet;

		case 'delay':
			// Delay with proper delay buffer and feedback - can be pushed to extreme
			const delayWet = settings.wet !== undefined ? Math.max(0, Math.min(1, settings.wet)) : 0.5;
			const delayDry = settings.dry !== undefined ? Math.max(0, Math.min(1, settings.dry)) : 0.5;
			// Clamp feedback to prevent infinite oscillation (0.99 max for safety)
			const delayFeedback = settings.feedback !== undefined ? Math.max(0, Math.min(0.99, settings.feedback)) : 0.5;
			const delayTime = settings.time !== undefined ? Math.max(0, Math.min(2.0, settings.time)) : 0.25;
			// Use delay buffer for proper echo effect
			if (!this._delayBuffers) {
				this._delayBuffers = new Map();
			}
			// Use timeline effect ID for buffer isolation (each effect instance gets its own buffers)
			const delayKey = effect.timelineEffectId || 'global';
			const maxDelayTime = 2.0; // Maximum delay time in seconds
			const delayBufferSize = Math.floor(sampleRate * maxDelayTime * 1.5);
			
			if (!this._delayBuffers.has(delayKey)) {
				this._delayBuffers.set(delayKey, {
					buffer: new Float32Array(delayBufferSize),
					writeIndex: 0
				});
			}
			const delayState = this._delayBuffers.get(delayKey);
			
			// Calculate read position based on delayTime (in samples)
			const delaySamples = Math.floor(delayTime * sampleRate);
			const delayReadIndex = (delayState.writeIndex - delaySamples + delayBufferSize) % delayBufferSize;
			
			// Read delayed sample (with linear interpolation for smooth changes)
			const delayReadIndex1 = Math.floor(delayReadIndex);
			const delayReadIndex2 = (delayReadIndex1 + 1) % delayBufferSize;
			const delayFrac = delayReadIndex - delayReadIndex1;
			const delayedSample1 = delayState.buffer[delayReadIndex1];
			const delayedSample2 = delayState.buffer[delayReadIndex2];
			const delayedSample = delayedSample1 * (1 - delayFrac) + delayedSample2 * delayFrac;
			
			// Write current sample + feedback (can create many repeats at high feedback)
			delayState.buffer[delayState.writeIndex] = sample + (delayedSample * delayFeedback);
			delayState.writeIndex = (delayState.writeIndex + 1) % delayBufferSize;
			
			// Mix dry and wet - at max wet/dry extremes, can be completely wet or dry
			return sample * delayDry + delayedSample * delayWet;

		case 'filter':
			// Proper filter implementation that can go from subtle to extreme
			const filterFreq = settings.frequency !== undefined ? Math.max(0, Math.min(1, settings.frequency)) : 0.5;
			const filterResonance = settings.resonance !== undefined ? Math.max(0, Math.min(1, settings.resonance)) : 0.5;
			const filterType = settings.type || 'lowpass';
			
			// Initialize filter state if needed
			if (!this._filterStates) {
				this._filterStates = new Map();
			}
			// Use timeline effect ID for buffer isolation (each effect instance gets its own buffers)
			const filterKey = effect.timelineEffectId || 'global';
			
			if (!this._filterStates.has(filterKey)) {
				this._filterStates.set(filterKey, { 
					x1: 0, x2: 0, y1: 0, y2: 0,
					cachedCutoff: -1,
					cachedQ: -1,
					cachedType: '',
					cachedSampleRate: 0,
					coeffs: null
				});
			}
			const filterState = this._filterStates.get(filterKey);
			if (!filterState) {
				return sample; // Safety check
			}
			
			// Map frequency (0-1) to actual cutoff frequency
			// 0 = very low (20Hz), 1 = very high (20kHz)
			const minFreq = 20;
			const maxFreq = 20000;
			const cutoff = minFreq + (filterFreq * (maxFreq - minFreq));
			
			// Map resonance (0-1) to Q factor (0.5 to 10 for extreme resonance)
			const q = 0.5 + (filterResonance * 9.5);
			
			// Cache filter coefficients - only recalculate when settings change
			if (filterState.cachedCutoff !== cutoff || filterState.cachedQ !== q || 
			    filterState.cachedType !== filterType || filterState.cachedSampleRate !== sampleRate) {
				filterState.cachedCutoff = cutoff;
				filterState.cachedQ = q;
				filterState.cachedType = filterType;
				filterState.cachedSampleRate = sampleRate;
				filterState.coeffs = this._calculateFilterCoeffs(cutoff, q, filterType, sampleRate);
			}
			
			// Apply proper biquad filter based on type (using cached coefficients)
			let filtered = sample;
			if (filterType === 'lowpass') {
				filtered = this.applyLowpassFilterWithCoeffs(sample, filterState, filterState.coeffs);
			} else if (filterType === 'highpass') {
				filtered = this.applyHighpassFilterWithCoeffs(sample, filterState, filterState.coeffs);
			} else if (filterType === 'bandpass') {
				filtered = this.applyBandpassFilterWithCoeffs(sample, filterState, filterState.coeffs);
			}
			
			return filtered;

		case 'distortion':
			// Distortion/saturation that can go from subtle to extreme
			const distortionDrive = settings.drive !== undefined ? Math.max(0, Math.min(1, settings.drive)) : 0.5;
			const distortionAmount = settings.amount !== undefined ? Math.max(0, Math.min(1, settings.amount)) : 0.3;
			
			// Drive can go from 1x (no drive) to 20x (extreme drive) for maximum distortion
			const driveMultiplier = 1 + (distortionDrive * 19);
			const driven = sample * driveMultiplier;
			
			// Apply tanh saturation for soft clipping, then add hard clipping for extreme settings
			let distorted = Math.tanh(driven);
			// At high drive, add hard clipping for more aggressive distortion
			if (distortionDrive > 0.7) {
				const hardClipAmount = (distortionDrive - 0.7) / 0.3; // 0 to 1 when drive > 0.7
				distorted = distorted * (1 - hardClipAmount) + Math.max(-1, Math.min(1, driven)) * hardClipAmount;
			}
			
			// Mix between dry and distorted - at max amount, completely distorted
			return sample * (1 - distortionAmount) + distorted * distortionAmount;

		case 'compressor':
			// Compressor that can go from subtle to extreme (limiter at max ratio)
			const compThreshold = settings.threshold !== undefined ? Math.max(0, Math.min(1, settings.threshold)) : 0.7;
			const compRatio = settings.ratio !== undefined ? Math.max(1, Math.min(20, settings.ratio)) : 4;
			const compAttack = settings.attack !== undefined ? Math.max(0, Math.min(1, settings.attack)) : 0.01;
			const compRelease = settings.release !== undefined ? Math.max(0, Math.min(1, settings.release)) : 0.1;
			
			// Initialize compressor state if needed
			if (!this._compressorStates) {
				this._compressorStates = new Map();
			}
			// Use timeline effect ID for buffer isolation (each effect instance gets its own buffers)
			const compKey = effect.timelineEffectId || 'global';
			
			if (!this._compressorStates.has(compKey)) {
				this._compressorStates.set(compKey, { 
					envelope: 0,
					attackCoeff: 0,
					releaseCoeff: 0,
					cachedAttack: -1,
					cachedRelease: -1,
					cachedSampleRate: 0
				});
			}
			const compState = this._compressorStates.get(compKey);
			
			// Cache attack/release coefficients - only recalculate when settings or sample rate change
			if (compState.cachedAttack !== compAttack || compState.cachedRelease !== compRelease || compState.cachedSampleRate !== sampleRate) {
				compState.attackCoeff = Math.exp(-1.0 / (compAttack * sampleRate * 0.001 + 0.0001));
				compState.releaseCoeff = Math.exp(-1.0 / (compRelease * sampleRate * 0.001 + 0.0001));
				compState.cachedAttack = compAttack;
				compState.cachedRelease = compRelease;
				compState.cachedSampleRate = sampleRate;
			}
			
			const absSample = Math.abs(sample);
			
			// Calculate target gain reduction
			let targetGain = 1.0;
			if (absSample > compThreshold) {
				const excess = absSample - compThreshold;
				const compressed = compThreshold + excess / compRatio;
				targetGain = compressed / absSample; // Gain reduction factor
			}
			
			// Apply attack and release envelope (using cached coefficients)
			if (targetGain < compState.envelope) {
				// Attack phase
				compState.envelope = targetGain + (compState.envelope - targetGain) * compState.attackCoeff;
			} else {
				// Release phase
				compState.envelope = targetGain + (compState.envelope - targetGain) * compState.releaseCoeff;
			}
			
			// Apply gain reduction
			return sample * compState.envelope;

		case 'chorus':
			// Chorus with delay buffers - can be pushed to extreme for flanger-like effects
			const chorusWet = settings.wet !== undefined ? Math.max(0, Math.min(1, settings.wet)) : 0.5;
			// Rate: 0 = very slow (0.1 Hz), 1 = very fast (10 Hz) for extreme modulation
			const chorusRate = settings.rate !== undefined ? Math.max(0, Math.min(1, settings.rate)) : 0.5;
			// Depth: 0 = no modulation, 1 = extreme modulation (100% of delay time)
			const chorusDepth = settings.depth !== undefined ? Math.max(0, Math.min(1, settings.depth)) : 0.6;
			// Delay: 0 = no delay, 0.1 = 100ms max delay
			const chorusDelay = settings.delay !== undefined ? Math.max(0, Math.min(0.1, settings.delay)) : 0.02;
			
			if (!this._chorusBuffers) {
				this._chorusBuffers = new Map();
				this._chorusPhases = new Map();
				this._chorusCache = new Map();
			}
			// Use timeline effect ID for buffer isolation (each effect instance gets its own buffers)
			const chorusKey = effect.timelineEffectId || 'global';
			const maxDelay = 0.1; // Maximum delay time
			const chorusBufferSize = Math.floor(sampleRate * maxDelay * 1.5);
			
			if (!this._chorusBuffers.has(chorusKey)) {
				this._chorusBuffers.set(chorusKey, {
					buffer: new Float32Array(chorusBufferSize),
					writeIndex: 0
				});
				this._chorusPhases.set(chorusKey, 0);
				this._chorusCache.set(chorusKey, {
					lfoFreq: 0,
					delaySamples: 0,
					cachedRate: -1,
					cachedDelay: -1,
					cachedDepth: -1,
					cachedSampleRate: 0
				});
			}
			const chorusState = this._chorusBuffers.get(chorusKey);
			const chorusPhase = this._chorusPhases.get(chorusKey);
			const chorusCache = this._chorusCache.get(chorusKey);
			
			// Cache LFO frequency and delay calculations - only recalculate when settings change
			if (chorusCache.cachedRate !== chorusRate || chorusCache.cachedDelay !== chorusDelay || 
			    chorusCache.cachedDepth !== chorusDepth || chorusCache.cachedSampleRate !== sampleRate) {
				// Map rate from 0-1 to 0.1-10 Hz for wide range
				chorusCache.lfoFreq = 0.1 + (chorusRate * 9.9);
				chorusCache.delaySamples = chorusDelay * sampleRate;
				chorusCache.cachedRate = chorusRate;
				chorusCache.cachedDelay = chorusDelay;
				chorusCache.cachedDepth = chorusDepth;
				chorusCache.cachedSampleRate = sampleRate;
			}
			
			// Write current sample
			chorusState.buffer[chorusState.writeIndex] = sample;
			chorusState.writeIndex = (chorusState.writeIndex + 1) % chorusState.buffer.length;
			
			// Calculate modulated delay (LFO) - Math.sin is necessary for smooth LFO
			const lfo = Math.sin(chorusPhase * 2 * Math.PI * chorusCache.lfoFreq);
			// Depth controls how much the delay modulates (0 to 100% of delay time)
			const modulatedDelay = chorusDelay * (1 + lfo * chorusDepth);
			
			// Read from modulated position with interpolation
			const readPos = chorusState.writeIndex - (modulatedDelay * sampleRate);
			const readIndex1 = Math.floor(readPos);
			const readIndex2 = readIndex1 + 1;
			const frac = readPos - readIndex1;
			
			// Wrap indices (optimized: avoid double modulo)
			let idx1 = readIndex1 % chorusBufferSize;
			if (idx1 < 0) idx1 += chorusBufferSize;
			let idx2 = readIndex2 % chorusBufferSize;
			if (idx2 < 0) idx2 += chorusBufferSize;
			
			const sample1 = chorusState.buffer[idx1];
			const sample2 = chorusState.buffer[idx2];
			const chorusedSample = sample1 * (1 - frac) + sample2 * frac;
			
			// Update phase
			this._chorusPhases.set(chorusKey, (chorusPhase + chorusCache.lfoFreq / sampleRate) % 1.0);
			
			// Mix dry and wet - at max wet, completely chorused
			return sample * (1 - chorusWet) + chorusedSample * chorusWet;

		default:
			return sample;
		}
	}
	
	/**
	 * Apply a lowpass filter (biquad)
	 */
	applyLowpassFilter(input, cutoff, q, state) {
		const sampleRate = (this.processor && this.processor.sampleRate) ? this.processor.sampleRate : 44100;
		const c = 1.0 / Math.tan(Math.PI * Math.max(20, Math.min(20000, cutoff)) / sampleRate);
		const a1 = 1.0 / (1.0 + q * c + c * c);
		const a2 = 2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (1.0 - c * c) * a1;
		const b2 = (1.0 - q * c + c * c) * a1;

		const output = this._flushDenormals(
			a1 * input + a2 * state.x1 + a3 * state.x2
			- b1 * state.y1 - b2 * state.y2
		);

		state.x2 = this._flushDenormals(state.x1);
		state.x1 = this._flushDenormals(input);
		state.y2 = this._flushDenormals(state.y1);
		state.y1 = output;

		return output;
	}
	
	/**
	 * Apply a highpass filter (biquad)
	 */
	applyHighpassFilter(input, cutoff, q, state) {
		const sampleRate = (this.processor && this.processor.sampleRate) ? this.processor.sampleRate : 44100;
		const c = 1.0 / Math.tan(Math.PI * Math.max(20, Math.min(20000, cutoff)) / sampleRate);
		const a1 = 1.0 / (1.0 + q * c + c * c);
		const a2 = -2 * a1;
		const a3 = a1;
		const b1 = 2.0 * (c * c - 1.0) * a1;
		const b2 = (1.0 - q * c + c * c) * a1;

		const output = this._flushDenormals(
			a1 * input + a2 * state.x1 + a3 * state.x2
			- b1 * state.y1 - b2 * state.y2
		);

		state.x2 = this._flushDenormals(state.x1);
		state.x1 = this._flushDenormals(input);
		state.y2 = this._flushDenormals(state.y1);
		state.y1 = output;

		return output;
	}
	
	/**
	 * Apply a bandpass filter (biquad)
	 */
	applyBandpassFilter(input, cutoff, q, state) {
		const sampleRate = (this.processor && this.processor.sampleRate) ? this.processor.sampleRate : 44100;
		const w = 2.0 * Math.PI * Math.max(20, Math.min(20000, cutoff)) / sampleRate;
		const cosw = Math.cos(w);
		const sinw = Math.sin(w);
		const alpha = sinw / (2.0 * q);
		
		const b0 = alpha;
		const b1 = 0;
		const b2 = -alpha;
		const a0 = 1 + alpha;
		const a1 = -2 * cosw;
		const a2 = 1 - alpha;

		const output = this._flushDenormals(
			(b0 / a0) * input + (b1 / a0) * state.x1 + (b2 / a0) * state.x2
			- (a1 / a0) * state.y1 - (a2 / a0) * state.y2
		);

		state.x2 = this._flushDenormals(state.x1);
		state.x1 = this._flushDenormals(input);
		state.y2 = this._flushDenormals(state.y1);
		state.y1 = output;

		return output;
	}
	
	/**
	 * Calculate filter coefficients (cached to avoid recalculating every sample)
	 * @param {number} cutoff - Cutoff frequency
	 * @param {number} q - Q factor
	 * @param {string} type - Filter type ('lowpass', 'highpass', 'bandpass')
	 * @param {number} sampleRate - Sample rate
	 * @returns {Object} Filter coefficients
	 */
	_calculateFilterCoeffs(cutoff, q, type, sampleRate) {
		const clampedCutoff = Math.max(20, Math.min(20000, cutoff));
		
		if (type === 'lowpass' || type === 'highpass') {
			const c = 1.0 / Math.tan(Math.PI * clampedCutoff / sampleRate);
			const a1 = 1.0 / (1.0 + q * c + c * c);
			
			if (type === 'lowpass') {
				return {
					a1: a1,
					a2: 2 * a1,
					a3: a1,
					b1: 2.0 * (1.0 - c * c) * a1,
					b2: (1.0 - q * c + c * c) * a1
				};
			} else { // highpass
				return {
					a1: a1,
					a2: -2 * a1,
					a3: a1,
					b1: 2.0 * (c * c - 1.0) * a1,
					b2: (1.0 - q * c + c * c) * a1
				};
			}
		} else { // bandpass
			const w = 2.0 * Math.PI * clampedCutoff / sampleRate;
			const cosw = Math.cos(w);
			const sinw = Math.sin(w);
			const alpha = sinw / (2.0 * q);
			
			return {
				b0: alpha,
				b1: 0,
				b2: -alpha,
				a0: 1 + alpha,
				a1: -2 * cosw,
				a2: 1 - alpha
			};
		}
	}
	
	/**
	 * Apply lowpass filter with pre-calculated coefficients
	 */
	applyLowpassFilterWithCoeffs(input, state, coeffs) {
		const output = this._flushDenormals(
			coeffs.a1 * input + coeffs.a2 * state.x1 + coeffs.a3 * state.x2
			- coeffs.b1 * state.y1 - coeffs.b2 * state.y2
		);

		state.x2 = this._flushDenormals(state.x1);
		state.x1 = this._flushDenormals(input);
		state.y2 = this._flushDenormals(state.y1);
		state.y1 = output;

		return output;
	}
	
	/**
	 * Apply highpass filter with pre-calculated coefficients
	 */
	applyHighpassFilterWithCoeffs(input, state, coeffs) {
		const output = this._flushDenormals(
			coeffs.a1 * input + coeffs.a2 * state.x1 + coeffs.a3 * state.x2
			- coeffs.b1 * state.y1 - coeffs.b2 * state.y2
		);

		state.x2 = this._flushDenormals(state.x1);
		state.x1 = this._flushDenormals(input);
		state.y2 = this._flushDenormals(state.y1);
		state.y1 = output;

		return output;
	}
	
	/**
	 * Apply bandpass filter with pre-calculated coefficients
	 */
	applyBandpassFilterWithCoeffs(input, state, coeffs) {
		const output = this._flushDenormals(
			(coeffs.b0 / coeffs.a0) * input + (coeffs.b1 / coeffs.a0) * state.x1 + (coeffs.b2 / coeffs.a0) * state.x2
			- (coeffs.a1 / coeffs.a0) * state.y1 - (coeffs.a2 / coeffs.a0) * state.y2
		);

		state.x2 = this._flushDenormals(state.x1);
		state.x1 = this._flushDenormals(input);
		state.y2 = this._flushDenormals(state.y1);
		state.y1 = output;

		return output;
	}
}

