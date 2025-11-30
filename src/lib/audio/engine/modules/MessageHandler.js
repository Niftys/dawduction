/**
 * Handles incoming messages from the main thread
 * Routes messages to appropriate handlers
 */

class MessageHandler {
	constructor(processor) {
		this.processor = processor;
	}

	handle(message) {
		switch (message.type) {
		case 'loadProject':
			this.processor.loadProject(message.tracks, message.bpm, message.events, message.baseMeterTrackId, message.timeline, message.effects, message.envelopes, message.viewMode, message.patternToTrackId, message.timelineTrackToAudioTracks, message.automation, message.patterns);
			break;
			case 'setTransport':
				this.processor.setTransport(message.state, message.position);
				break;
			case 'setTempo':
				this.processor.setTempo(message.bpm);
				break;
		case 'updatePatternTree':
			this.processor.updatePatternTree(message.trackId, message.patternTree, message.baseMeter);
			break;
			case 'updateTrackSettings':
				this.processor.updateTrackSettings(message.trackId, message.settings);
				break;
			case 'updateTrack':
				this.processor.updateTrack(message.trackId, message.track);
				break;
			case 'updateTrackVolume':
				this.processor.updateTrackVolume(message.trackId, message.volume);
				break;
			case 'updateTrackPan':
				this.processor.updateTrackPan(message.trackId, message.pan);
				break;
			case 'updateTrackMute':
				this.processor.updateTrackMute(message.trackId, message.mute);
				break;
		case 'updateTrackSolo':
			this.processor.updateTrackSolo(message.trackId, message.solo);
			break;
		case 'updateTrackEvents':
			this.processor.updateTrackEvents(message.trackId, message.events);
			break;
		case 'removeTrack':
			this.processor.removeTrack(message.trackId);
			break;
		case 'updateTimelineTrackVolume':
			this.processor.updateTimelineTrackVolume(message.trackId, message.volume);
			break;
		case 'updateTimelineTrackMute':
			this.processor.updateTimelineTrackMute(message.trackId, message.mute);
			break;
		case 'updateTimelineTrackSolo':
			this.processor.updateTimelineTrackSolo(message.trackId, message.solo);
			break;
		case 'updateEffect':
			this.processor.updateEffect(message.effectId, message.settings);
			break;
		case 'updateEnvelope':
			this.processor.updateEnvelope(message.envelopeId, message.settings);
			break;
		}
	}
}

