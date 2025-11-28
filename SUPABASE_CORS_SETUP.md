# Supabase CORS Configuration

## Issue
You're seeing CORS errors when trying to sign up/sign in on your deployed Vercel site:
```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at https://appbvwpzffwrqgqlpkuu.supabase.co/auth/v1/signup.
```

## Solution Steps

### 1. Set Site URL (Already Done ✅)
- Go to **Authentication** → **URL Configuration**
- Set **Site URL** to: `https://dawduction.vercel.app`
- Click **Save changes**

### 2. Add Redirect URLs
- In the same **URL Configuration** page
- Click **Add URL** button
- Add: `https://dawduction.vercel.app`
- (Optional) Add wildcard: `https://*.vercel.app` for preview deployments
- Save

### 3. Wait for Propagation
- Changes can take **5-10 minutes** to propagate
- Clear your browser cache or try incognito mode
- Test again after waiting

### 4. Verify Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Make sure these are set (case-sensitive):
   - `PUBLIC_SUPABASE_URL` = `https://appbvwpzffwrqgqlpkuu.supabase.co`
   - `PUBLIC_SUPABASE_ANON_KEY` = Your Supabase anon/public key (starts with `sb_publishable_` or `eyJ...`)

### 5. If Still Not Working

**Check Supabase Project Status:**
- Make sure your Supabase project is not paused
- Go to **Settings** → **General** and verify project is active

**Try These:**
1. **Hard refresh** your browser (Ctrl+Shift+R or Cmd+Shift+R)
2. **Clear browser cache** for your Vercel domain
3. **Test in incognito/private mode**
4. **Check browser console** for any other errors

**Contact Supabase Support:**
- If CORS errors persist after 10+ minutes
- Supabase support can check server-side CORS configuration
- Some projects may need manual CORS whitelisting on Supabase's end

### 6. Alternative: Check Network Tab

In browser DevTools → Network tab:
- Look for the failed request to Supabase
- Check the **Response Headers** for `Access-Control-Allow-Origin`
- If it's missing or doesn't include your domain, Supabase hasn't updated yet

