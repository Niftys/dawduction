# Pre-Deployment Checklist

Use this checklist before deploying to ensure everything is ready.

## ✅ Configuration Files

- [x] **SvelteKit Adapter**: Updated to `@sveltejs/adapter-vercel`
- [x] **Supabase Client**: Created at `src/lib/utils/supabase.ts`
- [x] **TypeScript Types**: Added Supabase types to `src/app.d.ts`
- [x] **Environment Variables**: `.env.example` template created (you need to create `.env` locally)

## ⚠️ Required Actions Before Deployment

### 1. Install New Dependencies
```bash
npm install
```
This will install `@sveltejs/adapter-vercel` that was added to `package.json`.

### 2. Create Environment Variables File

**Locally:**
1. Create a `.env` file in the project root
2. Copy the template from `.env.example` (if it exists) or add:
   ```
   PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
3. Replace with your actual Supabase credentials

**In Vercel:**
1. Go to your Vercel project → Settings → Environment Variables
2. Add:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
3. Add for all environments (Production, Preview, Development)

### 3. Set Up Supabase Database

Follow the SQL schema in `DEPLOYMENT.md` to:
- [ ] Create the database tables (profiles, projects, tracks)
- [ ] Set up Row Level Security (RLS) policies
- [ ] Create the profile trigger function
- [ ] Test authentication flow

### 4. Test Build Locally

```bash
npm run build
npm run preview
```

Verify:
- [ ] Build completes without errors
- [ ] No TypeScript errors
- [ ] Preview works correctly
- [ ] Audio worklet loads properly

### 5. Security Check

- [ ] No hardcoded API keys or secrets in code
- [ ] `.env` is in `.gitignore` (already done)
- [ ] Environment variables use `PUBLIC_` prefix for client-side access
- [ ] RLS policies are properly configured in Supabase

### 6. Vercel Configuration

- [ ] Repository is connected to Vercel
- [ ] Build command: `npm run build` (auto-detected)
- [ ] Output directory: `.svelte-kit` (auto-detected)
- [ ] Node.js version: 18.x or higher (Vercel default)

### 7. Supabase Configuration

- [ ] Authentication providers configured
- [ ] Email templates set up (optional)
- [ ] URL configuration updated with your Vercel domain
- [ ] Redirect URLs include your production domain

## 📝 Files Created/Modified

### New Files:
- `src/lib/utils/supabase.ts` - Supabase client initialization
- `DEPLOYMENT.md` - Complete deployment guide
- `PRE_DEPLOYMENT_CHECKLIST.md` - This file

### Modified Files:
- `package.json` - Added `@sveltejs/adapter-vercel` dependency
- `svelte.config.js` - Changed adapter to `adapter-vercel`
- `src/app.d.ts` - Added Supabase types

### Files You Need to Create:
- `.env` - Your local environment variables (not committed to git)

## 🚀 Ready to Deploy?

Once all items above are checked:

1. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Prepare for deployment: Add Supabase integration and Vercel adapter"
   git push
   ```

2. **Deploy to Vercel:**
   - If connected via Git: Push triggers automatic deployment
   - Or use Vercel CLI: `vercel --prod`

3. **Verify deployment:**
   - Check build logs in Vercel dashboard
   - Test the live site
   - Verify Supabase connection works
   - Test authentication flow

## 🐛 Common Issues

**Build fails:**
- Check that `@sveltejs/adapter-vercel` is installed
- Verify environment variables are set in Vercel
- Check build logs for specific errors

**Supabase connection errors:**
- Verify environment variables match your Supabase project
- Check that your Supabase project is active
- Verify RLS policies allow the operations you're trying

**Authentication not working:**
- Check Supabase URL configuration includes your Vercel domain
- Verify redirect URLs are configured correctly
- Check browser console for errors

## 📚 Next Steps After Deployment

1. Set up monitoring (Vercel Analytics, error tracking)
2. Configure custom domain (if desired)
3. Set up automated backups for Supabase
4. Test all features in production
5. Monitor performance and errors

## Need Help?

- See `DEPLOYMENT.md` for detailed instructions
- Check [Vercel Docs](https://vercel.com/docs)
- Check [Supabase Docs](https://supabase.com/docs)
- Check [SvelteKit Docs](https://kit.svelte.dev)

