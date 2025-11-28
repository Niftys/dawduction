# Schema Migration Guide

## Problem

Your current database schema only has a simple `tracks` table, but your code expects a much more complex structure:

**Current Schema Has:**
- `profiles` ✓
- `projects` ✓ (but missing timeline and automation fields)
- `tracks` (only stores individual instruments)

**Code Expects:**
- `profiles` ✓
- `projects` (with `timeline` JSONB and `automation` JSONB)
- `patterns` (stores Pattern objects with multiple instruments)
- `standalone_instruments` (for arrangement view)
- `effects` (stores Effect objects)
- `envelopes` (stores Envelope objects)

## Solution

Run the `UPDATED_SCHEMA.sql` file in your Supabase SQL Editor. This will:

1. **Add missing tables:**
   - `patterns` - Stores Pattern objects
   - `standalone_instruments` - Stores instruments for arrangement view
   - `effects` - Stores Effect objects
   - `envelopes` - Stores Envelope objects

2. **Enhance projects table:**
   - Add `timeline` JSONB field
   - Add `automation` JSONB field
   - Add `base_meter_track_id` field

3. **Set up RLS policies** for all new tables

4. **Create triggers** for updated_at timestamps

## Migration Steps

### Option 1: Fresh Start (Recommended for Development)

If you don't have important data yet:

1. Go to Supabase Dashboard → SQL Editor
2. Run `UPDATED_SCHEMA.sql` in full
3. This will create all tables with proper structure

### Option 2: Migrate Existing Data

If you have existing data in the `tracks` table:

1. **Backup your data first!**
   ```sql
   -- Export existing tracks
   SELECT * FROM tracks;
   ```

2. Run the schema update:
   ```sql
   -- Run UPDATED_SCHEMA.sql
   ```

3. **Migrate tracks data** to the new structure:
   ```sql
   -- Convert old tracks to standalone_instruments
   INSERT INTO standalone_instruments (
     id, project_id, instrument_type, pattern_tree, 
     settings, volume, pan, color, created_at, updated_at
   )
   SELECT 
     id, project_id, instrument_type, pattern_tree,
     settings, volume, pan, color, created_at, updated_at
   FROM tracks;
   ```

4. **Drop the old tracks table** (after verifying migration):
   ```sql
   DROP TABLE IF EXISTS tracks;
   ```

## Verification

After running the migration, verify:

1. **All tables exist:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

   Should show:
   - `effects`
   - `envelopes`
   - `patterns`
   - `profiles`
   - `projects`
   - `standalone_instruments`

2. **RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public';
   ```

   All should show `t` (true) for `rowsecurity`

3. **Test a query:**
   ```sql
   SELECT * FROM projects LIMIT 1;
   SELECT * FROM patterns LIMIT 1;
   SELECT * FROM standalone_instruments LIMIT 1;
   ```

## What Changed

### Projects Table
- Added `timeline JSONB` - Stores the entire timeline structure
- Added `automation JSONB` - Stores automation curves
- Added `base_meter_track_id TEXT` - Reference to base meter instrument

### New Tables

**patterns:**
- Stores Pattern objects (which contain arrays of instruments)
- `pattern_data JSONB` contains the full Pattern structure

**standalone_instruments:**
- Stores instruments that exist directly in arrangement view
- Similar to old `tracks` table but with more fields

**effects:**
- Stores Effect objects
- Type-checked: 'reverb', 'delay', 'filter', 'distortion', 'compressor', 'chorus'

**envelopes:**
- Stores Envelope objects
- Type-checked: 'volume', 'filter', 'pitch', 'pan'

## Next Steps

After migration, you'll need to update your save/load code to:

1. **Save projects:**
   - Save `standaloneInstruments` → `standalone_instruments` table
   - Save `patterns` → `patterns` table
   - Save `effects` → `effects` table
   - Save `envelopes` → `envelopes` table
   - Save `timeline` → `projects.timeline` JSONB
   - Save `automation` → `projects.automation` JSONB

2. **Load projects:**
   - Load all related data and reconstruct the Project object
   - Join tables to get full project structure

## Need Help?

If you encounter issues:
1. Check Supabase logs for errors
2. Verify RLS policies allow your operations
3. Test with a simple INSERT query first
4. Make sure you're authenticated when testing

