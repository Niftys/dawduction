-- Add missing fields to projects table
-- Run this if your projects table doesn't have timeline, automation, or base_meter_track_id

-- Add timeline JSONB field (stores Timeline structure)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS timeline JSONB;

-- Add automation JSONB field (stores ProjectAutomation curves)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS automation JSONB;

-- Add base_meter_track_id field (references instrument ID)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS base_meter_track_id TEXT;

-- Optional: Add comment to document what these fields store
COMMENT ON COLUMN projects.timeline IS 'Stores Timeline structure (tracks, clips, effects, envelopes)';
COMMENT ON COLUMN projects.automation IS 'Stores ProjectAutomation curves for parameter automation';
COMMENT ON COLUMN projects.base_meter_track_id IS 'Instrument ID whose root division determines the pattern loop length';

