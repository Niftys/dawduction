# Troubleshooting 500 Error on Vercel

## Most Common Cause: Missing Environment Variables

The 500 error is most likely because your Supabase environment variables are not set in Vercel.

## Quick Fix

1. **Go to Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

2. **Add these two variables:**
   - `PUBLIC_SUPABASE_URL` = `https://appbvwpzffwrqgqlpkuu.supabase.co` (your actual URL)
   - `PUBLIC_SUPABASE_ANON_KEY` = Your anon key from Supabase

3. **Make sure to:**
   - Add them for **Production**, **Preview**, and **Development** environments
   - Click **Save** after adding each variable

4. **Redeploy:**
   - Go to **Deployments** tab
   - Click the three dots on the latest deployment
   - Click **Redeploy**

## How to Get Your Supabase Credentials

1. Go to [app.supabase.com](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → Use for `PUBLIC_SUPABASE_URL`
   - **anon public** key → Use for `PUBLIC_SUPABASE_ANON_KEY`

## Verify Environment Variables Are Set

After adding them, you can verify by:
1. Going to **Settings** → **Environment Variables**
2. You should see both `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` listed

## Other Possible Causes

### 1. Build Output Directory Wrong
- Should be `.svelte-kit` (not `public`)
- Check **Settings** → **General** → **Framework Settings**

### 2. Build Command Wrong
- Should be `npm run build` (not `vite build`)
- Check **Settings** → **General** → **Framework Settings**

### 3. Check Build Logs
1. Go to **Deployments** tab
2. Click on the failed deployment
3. Check the **Build Logs** for specific errors
4. Look for:
   - Missing dependencies
   - TypeScript errors
   - Import errors

### 4. Check Function Logs
1. Go to **Deployments** tab
2. Click on the failed deployment
3. Click **Functions** tab
4. Check for runtime errors

## Testing Locally

Before deploying, test locally:

1. Create `.env` file:
   ```
   PUBLIC_SUPABASE_URL=https://appbvwpzffwrqgqlpkuu.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. Build and preview:
   ```bash
   npm run build
   npm run preview
   ```

3. If it works locally but not on Vercel, it's definitely the environment variables.

## Still Not Working?

1. **Check Vercel Function Logs:**
   - Go to **Deployments** → Failed deployment → **Functions** tab
   - Look for error messages

2. **Check Supabase Dashboard:**
   - Make sure your Supabase project is active
   - Check if there are any errors in the Supabase logs

3. **Verify Runtime:**
   - The adapter is set to `nodejs20.x` in `svelte.config.js`
   - This should be correct, but verify in Vercel settings

4. **Try a fresh deployment:**
   - Sometimes Vercel caches can cause issues
   - Try redeploying from a new commit

## Code Update

I've updated `src/lib/utils/supabase.ts` to handle missing environment variables more gracefully. This will prevent crashes, but you still need to set the environment variables for the app to work correctly.

