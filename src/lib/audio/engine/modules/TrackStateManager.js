/**
 * Manages track state (volume, pan, mute, solo)
 * This module handles all per-track audio state
 */

class TrackStateManager {
	constructor() {
		this.trackVolumes = new Map();
		this.trackPans = new Map();
		this.trackMutes = new Map();
		this.trackSolos = new Map();
	}

	initializeTracks(tracks) {
		if (!tracks) return;
		
		for (const track of tracks) {
			this.trackVolumes.set(track.id, track.volume ?? 1.0);
			this.trackPans.set(track.id, track.pan ?? 0.0);
			this.trackMutes.set(track.id, track.mute ?? false);
			this.trackSolos.set(track.id, track.solo ?? false);
		}
	}

	updateTrack(trackId, updatedTrack) {
		if (updatedTrack.volume !== undefined) {
			this.trackVolumes.set(trackId, updatedTrack.volume);
		}
		if (updatedTrack.pan !== undefined) {
			this.trackPans.set(trackId, updatedTrack.pan);
		}
		if (updatedTrack.mute !== undefined) {
			this.trackMutes.set(trackId, updatedTrack.mute);
		}
		if (updatedTrack.solo !== undefined) {
			this.trackSolos.set(trackId, updatedTrack.solo);
		}
	}

	setVolume(trackId, volume) {
		this.trackVolumes.set(trackId, volume);
	}

	setPan(trackId, pan) {
		this.trackPans.set(trackId, pan);
	}

	setMute(trackId, mute) {
		this.trackMutes.set(trackId, mute);
	}

	setSolo(trackId, solo) {
		this.trackSolos.set(trackId, solo);
	}

	getVolume(trackId) {
		return this.trackVolumes.get(trackId) ?? 1.0;
	}

	getPan(trackId) {
		return this.trackPans.get(trackId) ?? 0.0;
	}

	isMuted(trackId) {
		return this.trackMutes.get(trackId) ?? false;
	}

	isSoloed(trackId) {
		return this.trackSolos.get(trackId) ?? false;
	}

	hasAnySoloedTrack() {
		for (const solo of this.trackSolos.values()) {
			if (solo) return true;
		}
		return false;
	}

	removeTrack(trackId) {
		this.trackVolumes.delete(trackId);
		this.trackPans.delete(trackId);
		this.trackMutes.delete(trackId);
		this.trackSolos.delete(trackId);
	}

	clear() {
		this.trackVolumes.clear();
		this.trackPans.clear();
		this.trackMutes.clear();
		this.trackSolos.clear();
	}
}

