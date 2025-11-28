# Deployment Guide for DAWDUCTION

This guide will help you prepare and deploy your DAWDUCTION project to Vercel with Supabase integration.

## Prerequisites

1. **Supabase Account**: Sign up at [supabase.com](https://supabase.com)
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
3. **Git Repository**: Your code should be in a Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Set Up Supabase

### 1.1 Create a New Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Fill in:
   - **Name**: `dawduction` (or your preferred name)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to your users
4. Wait for the project to be created (takes ~2 minutes)

### 1.2 Get Your Supabase Credentials

1. In your Supabase project, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

### 1.3 Set Up Database Schema

Run these SQL commands in your Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  bpm INTEGER DEFAULT 120,
  is_public BOOLEAN DEFAULT false,
  allow_forking BOOLEAN DEFAULT false,
  forked_from UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(owner_id, slug)
);

-- Create tracks table
CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  instrument_type TEXT NOT NULL,
  pattern_tree JSONB NOT NULL,
  settings JSONB NOT NULL,
  volume FLOAT DEFAULT 1.0,
  pan FLOAT DEFAULT 0.0,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_public ON projects(is_public) WHERE is_public = true;
CREATE INDEX idx_tracks_project ON tracks(project_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tracks_updated_at
  BEFORE UPDATE ON tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

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

-- Tracks: Users can read tracks from projects they own or that are public
CREATE POLICY "Tracks are viewable by project owner or if project is public"
  ON tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = tracks.project_id
      AND (projects.owner_id = auth.uid() OR projects.is_public = true)
    )
  );

CREATE POLICY "Users can create tracks in their own projects"
  ON tracks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = tracks.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tracks in their own projects"
  ON tracks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = tracks.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tracks in their own projects"
  ON tracks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = tracks.project_id
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
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

### 1.4 Configure Authentication

1. Go to **Authentication** → **Providers** in Supabase
2. Enable **Email** provider (should be enabled by default)
3. (Optional) Enable OAuth providers (GitHub, Google, etc.) if you want social login
4. Configure email templates if desired

## Step 2: Configure Environment Variables

### 2.1 Local Development

1. Create a `.env` file in your project root (copy from `.env.example`):
   ```bash
   PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. Replace the values with your actual Supabase credentials from Step 1.2

### 2.2 Vercel Deployment

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add these variables:
   - `PUBLIC_SUPABASE_URL` = Your Supabase project URL
   - `PUBLIC_SUPABASE_ANON_KEY` = Your Supabase anon key
4. Make sure to add them for all environments (Production, Preview, Development)

## Step 3: Install Dependencies

Make sure you have the Vercel adapter installed:

```bash
npm install
```

This will install `@sveltejs/adapter-vercel` which was added to your `package.json`.

## Step 4: Deploy to Vercel

### 4.1 Connect Your Repository

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your Git repository
4. Vercel will auto-detect SvelteKit

### 4.2 Configure Build Settings

Vercel should auto-detect these settings, but verify:
- **Framework Preset**: SvelteKit
- **Build Command**: `npm run build`
- **Output Directory**: `.svelte-kit` (auto-detected)
- **Install Command**: `npm install`

### 4.3 Deploy

1. Click "Deploy"
2. Wait for the build to complete
3. Your app will be live at `https://your-project.vercel.app`

## Step 5: Post-Deployment Checklist

- [ ] Verify environment variables are set in Vercel
- [ ] Test user registration/login
- [ ] Test creating a new project
- [ ] Test saving a project to Supabase
- [ ] Test loading a project from Supabase
- [ ] Verify RLS policies are working (users can only access their own projects)
- [ ] Test public project sharing (if implemented)
- [ ] Check browser console for any errors
- [ ] Test on mobile devices (responsive design)

## Step 6: Domain Configuration (Optional)

1. In Vercel, go to **Settings** → **Domains**
2. Add your custom domain
3. Follow DNS configuration instructions
4. Update Supabase **Authentication** → **URL Configuration**:
   - Add your custom domain to **Site URL**
   - Add your custom domain to **Redirect URLs**

## Troubleshooting

### Build Errors

- **Missing environment variables**: Make sure all `PUBLIC_*` variables are set in Vercel
- **Adapter errors**: Ensure `@sveltejs/adapter-vercel` is installed
- **TypeScript errors**: Run `npm run check` locally before deploying

### Runtime Errors

- **Supabase connection errors**: Verify your environment variables are correct
- **Authentication not working**: Check Supabase URL configuration matches your Vercel domain
- **RLS policy errors**: Verify your database policies are set up correctly

### Audio Worklet Issues

- **Worklet not loading**: Check that `EngineWorkletProcessor.js` is in the `static/` folder
- **CORS errors**: Vercel should handle this automatically, but check if you're loading external resources

## Security Notes

1. **Never commit `.env` files** - They're already in `.gitignore`
2. **Never expose service role keys** - Only use anon keys in client-side code
3. **RLS is critical** - Always test that users can't access other users' data
4. **Validate user input** - Especially for project/track data before saving to Supabase

## Next Steps

After deployment:
1. Set up monitoring (Vercel Analytics, Sentry, etc.)
2. Configure error tracking
3. Set up automated backups for Supabase
4. Consider adding rate limiting for API calls
5. Set up CI/CD for automated deployments

## Support

- [SvelteKit Docs](https://kit.svelte.dev)
- [Vercel Docs](https://vercel.com/docs)
- [Supabase Docs](https://supabase.com/docs)

