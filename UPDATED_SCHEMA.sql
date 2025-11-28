-- Updated Supabase Schema for DAWDUCTION
-- This schema matches the actual project structure in the code

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table (same as before)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create projects table (enhanced with JSONB fields for complex data)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  bpm INTEGER DEFAULT 120,
  is_public BOOLEAN DEFAULT false,
  allow_forking BOOLEAN DEFAULT false,
  forked_from UUID REFERENCES projects(id) ON DELETE SET NULL,
  -- Store complex structures as JSONB
  timeline JSONB, -- Timeline structure (tracks, clips, effects, envelopes)
  automation JSONB, -- Project automation curves
  base_meter_track_id TEXT, -- Instrument ID for base meter
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(owner_id, slug)
);

-- Create patterns table (stores Pattern objects)
CREATE TABLE IF NOT EXISTS patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_meter INTEGER DEFAULT 4,
  mute BOOLEAN DEFAULT false,
  solo BOOLEAN DEFAULT false,
  -- Store pattern data as JSONB (includes instruments array)
  pattern_data JSONB NOT NULL, -- Full Pattern object (instruments, settings, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create standalone_instruments table (for arrangement view instruments)
CREATE TABLE IF NOT EXISTS standalone_instruments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  instrument_type TEXT NOT NULL,
  pattern_tree JSONB NOT NULL,
  settings JSONB NOT NULL,
  instrument_settings JSONB, -- Per-instrument-type settings
  volume FLOAT DEFAULT 1.0,
  pan FLOAT DEFAULT 0.0,
  color TEXT,
  mute BOOLEAN DEFAULT false,
  solo BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create effects table (stores Effect objects)
CREATE TABLE IF NOT EXISTS effects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('reverb', 'delay', 'filter', 'distortion', 'compressor', 'chorus')),
  settings JSONB NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create envelopes table (stores Envelope objects)
CREATE TABLE IF NOT EXISTS envelopes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('volume', 'filter', 'pitch', 'pan')),
  settings JSONB NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_patterns_project ON patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_standalone_instruments_project ON standalone_instruments(project_id);
CREATE INDEX IF NOT EXISTS idx_effects_project ON effects(project_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_project ON envelopes(project_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patterns_updated_at ON patterns;
CREATE TRIGGER update_patterns_updated_at
  BEFORE UPDATE ON patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_standalone_instruments_updated_at ON standalone_instruments;
CREATE TRIGGER update_standalone_instruments_updated_at
  BEFORE UPDATE ON standalone_instruments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_effects_updated_at ON effects;
CREATE TRIGGER update_effects_updated_at
  BEFORE UPDATE ON effects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_envelopes_updated_at ON envelopes;
CREATE TRIGGER update_envelopes_updated_at
  BEFORE UPDATE ON envelopes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE standalone_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE envelopes ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Projects are viewable by owner or if public" ON projects;
DROP POLICY IF EXISTS "Users can create their own projects" ON projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;

-- Profiles: Users can read any profile, but only update their own
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Projects: Users can read public projects or their own
CREATE POLICY "Projects are viewable by owner or if public"
  ON projects FOR SELECT
  USING (owner_id = auth.uid() OR is_public = true);

CREATE POLICY "Users can create their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (auth.uid() = owner_id);

-- Patterns: Users can access patterns from projects they own or that are public
CREATE POLICY "Patterns are viewable by project owner or if project is public"
  ON patterns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = patterns.project_id
      AND (projects.owner_id = auth.uid() OR projects.is_public = true)
    )
  );

CREATE POLICY "Users can create patterns in their own projects"
  ON patterns FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = patterns.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update patterns in their own projects"
  ON patterns FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = patterns.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete patterns in their own projects"
  ON patterns FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = patterns.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Standalone Instruments: Same pattern as patterns
CREATE POLICY "Standalone instruments are viewable by project owner or if project is public"
  ON standalone_instruments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = standalone_instruments.project_id
      AND (projects.owner_id = auth.uid() OR projects.is_public = true)
    )
  );

CREATE POLICY "Users can create standalone instruments in their own projects"
  ON standalone_instruments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = standalone_instruments.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update standalone instruments in their own projects"
  ON standalone_instruments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = standalone_instruments.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete standalone instruments in their own projects"
  ON standalone_instruments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = standalone_instruments.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Effects: Same pattern
CREATE POLICY "Effects are viewable by project owner or if project is public"
  ON effects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = effects.project_id
      AND (projects.owner_id = auth.uid() OR projects.is_public = true)
    )
  );

CREATE POLICY "Users can create effects in their own projects"
  ON effects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = effects.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update effects in their own projects"
  ON effects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = effects.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete effects in their own projects"
  ON effects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = effects.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Envelopes: Same pattern
CREATE POLICY "Envelopes are viewable by project owner or if project is public"
  ON envelopes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = envelopes.project_id
      AND (projects.owner_id = auth.uid() OR projects.is_public = true)
    )
  );

CREATE POLICY "Users can create envelopes in their own projects"
  ON envelopes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = envelopes.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update envelopes in their own projects"
  ON envelopes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = envelopes.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete envelopes in their own projects"
  ON envelopes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = envelopes.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, slug)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(
      LOWER(REGEXP_REPLACE(NEW.raw_user_meta_data->>'username', '[^a-zA-Z0-9]+', '-', 'g')),
      'user-' || substr(NEW.id::text, 1, 8)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger to ensure it's set up correctly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

