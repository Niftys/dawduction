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
	trackId: string; // Which timeline track this effect belongs to
	startBeat: number;
	duration: number;
	patternId?: string; // If specified, applies to this specific pattern (via its trackId)
}

export interface TimelineEnvelope {
	id: string;
	envelopeId: string;
	trackId: string; // Which timeline track this envelope belongs to
	startBeat: number;
	duration: number;
	patternId?: string; // If specified, applies to this specific pattern (via its trackId)
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

