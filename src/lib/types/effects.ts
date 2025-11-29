export interface Effect {
	id: string;
	projectId: string;
	name: string;
	type: 'reverb' | 'delay' | 'filter' | 'distortion' | 'compressor' | 'chorus';
	settings: Record<string, any>;
	color: string;
	createdAt: number;
	updatedAt: number;
}

export interface Envelope {
	id: string;
	projectId: string;
	name: string;
	type: 'volume' | 'filter' | 'pitch' | 'pan';
	settings: Record<string, any>;
	color: string;
	createdAt: number;
	updatedAt: number;
}

export interface TimelineEffect {
	id: string;
	effectId: string;
	trackId: string; // Which timeline track this effect clip lives on (effect track or envelope track row)
	startBeat: number;
	duration: number;
	// If specified, apply only to this specific timeline track's audio (per-track insert).
	// When omitted, the effect is global (applies to all tracks) if placed on an effect track or with no target.
	targetTrackId?: string;
}

export interface TimelineEnvelope {
	id: string;
	envelopeId: string;
	trackId: string; // Which timeline track this envelope clip lives on (envelope track row)
	startBeat: number;
	duration: number;
	// If specified, apply only to this specific timeline track's audio (per-track insert).
	// When omitted, the envelope is global if placed on an envelope track or with no target.
	targetTrackId?: string;
}

/**
 * Parameter automation point - a single keyframe in an automation curve
 */
export interface AutomationPoint {
	beat: number; // Beat position in timeline
	value: number; // Parameter value at this point (normalized 0-1 or actual value)
}

/**
 * Parameter automation curve for a specific parameter
 */
export interface ParameterAutomation {
	parameterKey: string; // The parameter name (e.g., 'roomSize', 'wet', etc.)
	targetType: 'effect' | 'envelope'; // Whether this is for an effect or envelope
	targetId: string; // The effect/envelope ID
	timelineInstanceId?: string; // Optional: timeline effect/envelope instance ID if on timeline
	points: AutomationPoint[]; // Automation keyframes
	min: number; // Minimum value for this parameter
	max: number; // Maximum value for this parameter
}

/**
 * Automation data for the entire project
 */
export interface ProjectAutomation {
	[automationId: string]: ParameterAutomation;
}

