# User Authentication & Project Management Guide

## How Users Create Accounts

Users create accounts with email/password:

### Email/Password Registration
- Visit `/register`
- Enter username, email, and password
- Click "Sign Up"
- Profile is automatically created in Supabase

## How Users Load Their Projects

### Option 1: From Home Page (After Login)
- After logging in, the home page shows a list of their saved projects
- Click on any project to load it

### Option 2: Direct URL
- Users can bookmark project URLs: `/project/[project-id]`
- Projects automatically load from Supabase when accessed

## How Projects Are Saved

Projects are automatically saved to Supabase when:
- User makes changes to the project
- User clicks "Save" button in toolbar
- Project data is saved to multiple tables:
  - `projects` - Main project info
  - `standalone_instruments` - Arrangement view instruments
  - `patterns` - Pattern data
  - `effects` - Effect configurations
  - `envelopes` - Envelope configurations

## Implementation Details

### Files Created:
1. **`src/routes/login/+page.svelte`** - Login page with email/password and Google OAuth
2. **`src/routes/register/+page.svelte`** - Registration page
3. **`src/routes/auth/callback/+page.server.ts`** - OAuth callback handler
4. **`src/lib/utils/projectSaveLoad.ts`** - Functions to save/load projects from Supabase

### Next Steps:
1. Update home page to show login/register links and user's projects
2. Update project page to load from Supabase instead of localStorage
3. Add save button functionality in toolbar

