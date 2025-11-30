/**
 * Waveform Generation Constants
 * Constants used for waveform visualization
 */

// Use a lower sample rate for visualization - we don't need full audio quality
// This significantly improves performance while maintaining good visual quality
export const VISUALIZATION_SAMPLE_RATE = 2205; // 1/20th of 44.1kHz - still plenty for visualization
export const SAMPLE_RATE = 44100; // Keep for reference calculations

// Maximum width for waveform visualization to prevent performance issues
export const MAX_WAVEFORM_WIDTH = 10000;

// Minimum peak threshold for normalization
export const MIN_PEAK_THRESHOLD = 0.001;

// Normalization headroom to prevent clipping
export const NORMALIZATION_HEADROOM = 0.9;

// Maximum duration for waveform generation (10 minutes)
export const MAX_WAVEFORM_DURATION_SECONDS = 60 * 10;

