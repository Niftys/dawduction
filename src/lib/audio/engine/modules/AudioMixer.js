/**
 * Handles audio mixing with per-track volume, pan, mute, solo, effects, and envelopes
 * Applies constant power panning for smooth stereo imaging
 */

class AudioMixer {
	constructor(trackStateManager, effectsProcessor, envelopesProcessor, processor) {
		this.trackStateManager = trackStateManager;
		this.effectsProcessor = effectsProcessor;
		this.envelopesProcessor = envelopesProcessor;
		this.processor = processor; // Store reference to processor for pattern lookup
	}

	mixSynths(synths, masterGain = 0.3, currentBeat = 0, isArrangementView = false) {
		let leftSample = 0;
		let rightSample = 0;
		
		const hasSoloedTrack = this.trackStateManager.hasAnySoloedTrack();
		
		for (const [trackId, synth] of synths.entries()) {
			if (synth.process) {
				const isMuted = this.trackStateManager.isMuted(trackId);
				const isSoloed = this.trackStateManager.isSoloed(trackId);
				
				// Skip if muted
				if (isMuted) continue;
				
				// If any track is soloed, only process soloed tracks
				if (hasSoloedTrack && !isSoloed) continue;
				
				// Get base track volume and pan
				let trackVolume = this.trackStateManager.getVolume(trackId);
				let trackPan = this.trackStateManager.getPan(trackId);
				
				// Apply timeline track volume if this audio track belongs to a timeline track
				if (this.processor && this.processor.projectManager && this.processor.projectManager.timelineTrackToAudioTracks) {
					for (const [timelineTrackId, audioTrackIds] of this.processor.projectManager.timelineTrackToAudioTracks.entries()) {
						if (audioTrackIds.includes(trackId)) {
							// This audio track belongs to a timeline track, apply timeline track volume
							const timelineTrack = this.processor.projectManager.timeline?.tracks?.find((t) => t.id === timelineTrackId);
							if (timelineTrack && timelineTrack.volume !== undefined) {
								trackVolume *= timelineTrack.volume;
							}
							break;
						}
					}
				}
				
				// Get pattern ID from track ID (if it's a pattern track)
				// Also check processor's patternToTrackId map for reverse lookup
				// And check if synth has a stored patternId
				let patternId = null;
				if (trackId && trackId.startsWith('__pattern_')) {
					patternId = trackId.replace('__pattern_', '');
				} else if (this.processor && this.processor.projectManager && this.processor.projectManager.patternToTrackId) {
					// Reverse lookup: find pattern ID for this track ID
					for (const [pid, tid] of this.processor.projectManager.patternToTrackId.entries()) {
						if (tid === trackId) {
							patternId = pid;
							break;
						}
					}
				}
				// Also check if synth has a stored patternId (from event)
				if (!patternId && synth._patternId) {
					patternId = synth._patternId;
				}
				
				// Get envelope values for this track at current position
				if (this.envelopesProcessor) {
					const envelopeValues = this.envelopesProcessor.getActiveEnvelopeValues(
						trackId,
						currentBeat,
						isArrangementView,
						patternId
					);
					
					// Apply envelope values
					trackVolume *= envelopeValues.volume;
					trackPan += envelopeValues.pan;
					trackPan = Math.max(-1, Math.min(1, trackPan)); // Clamp pan
					
					// Note: filter and pitch envelopes would need to be applied to the synth itself
					// For now, we only apply volume and pan envelopes here
				}
				
				// Get synth sample
				let synthSample = synth.process();
				
				// Apply effects to this track's audio
				if (this.effectsProcessor) {
					const activeEffects = this.effectsProcessor.getActiveEffects(
						trackId,
						currentBeat,
						isArrangementView,
						patternId
					);
					synthSample = this.effectsProcessor.processSample(synthSample, activeEffects);
				}
				
				// Apply track volume
				synthSample *= trackVolume;
				
				// Pan calculation using constant power panning
				// -1 = full left, 0 = center, 1 = full right
				// This maintains constant perceived volume across the pan range
				const panRadians = (trackPan + 1) * (Math.PI / 4); // Map -1..1 to 0..π/2
				const leftGain = Math.cos(panRadians);
				const rightGain = Math.sin(panRadians);
				
				leftSample += synthSample * leftGain;
				rightSample += synthSample * rightGain;
			}
		}

		return {
			left: leftSample * masterGain,
			right: rightSample * masterGain,
			mono: (leftSample + rightSample) * 0.5 * masterGain
		};
	}
}

