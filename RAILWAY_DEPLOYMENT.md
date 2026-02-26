# Railway Deployment Guide for Dungeon Lair

This guide walks you through deploying **Dungeon Lair** to Railway with your custom domain `dungeonlair.co.za`.

## Prerequisites

- Railway account (sign up at https://railway.app)
- GitHub account (recommended for automatic deployments)
- xneelo DNS access for `dungeonlair.co.za`

---

## Part 1: Deploy Backend to Railway

### Step 1: Create Railway Project

1. Go to https://railway.app/new
2. Click **"Deploy from GitHub repo"**
3. Authorize Railway to access your GitHub
4. Select your `DungeonsAndDragons` repository
5. Railway will create a new project

### Step 2: Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will provision a PostgreSQL database
4. The `DATABASE_URL` environment variable is automatically added to your backend service

### Step 3: Configure Backend Environment Variables

In Railway, go to your backend service → **Variables** tab and add:

```
NODE_ENV=production
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long
CORS_ORIGIN=https://dungeonlair.co.za,https://www.dungeonlair.co.za
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Important**: Railway automatically provides `DATABASE_URL` - don't set it manually!

### Step 4: Set Root Directory (if needed)

If Railway doesn't auto-detect the backend:

1. Go to **Settings** → **Service Settings**
2. Set **Root Directory** to `backend`
3. Set **Start Command** to `node server.js`

### Step 5: Get Your Backend URL

1. Once deployed, Railway gives you a URL like: `https://your-app-production.up.railway.app`
2. **Copy this URL** - you'll need it for the frontend

### Step 6: Add Custom Domain to Backend

1. In backend service → **Settings** → **Networking**
2. Click **"Generate Domain"** (if not already generated)
3. Under **Custom Domain**, click **"+ Custom Domain"**
4. Enter: `dungeonlair.co.za`
5. Railway will show you a CNAME target (e.g., `your-app.railway.app`)

**Keep this target handy for DNS configuration!**

---

## Part 2: Deploy Frontend to Railway

### Option A: Separate Frontend Service (Recommended)

1. In your Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the same repository
3. Set **Root Directory** to `frontend`
4. Set **Build Command** to `npm run build`
5. Set **Start Command** to `npx serve -s build -l $PORT`

### Option B: Serve Frontend from Backend (Simpler)

The backend `server.js` already serves the built frontend in production. You can:

1. Build frontend locally: `cd frontend && npm run build`
2. Commit the `frontend/build` folder to git
3. Push to GitHub - Railway will serve it automatically

**If using Option A, continue below:**

### Add Frontend Environment Variable

In frontend service → **Variables**:

```
REACT_APP_API_URL=https://dungeonlair.co.za/api
```

### Add Custom Domain to Frontend

1. In frontend service → **Settings** → **Networking**
2. Add custom domain: `www.dungeonlair.co.za`
3. Railway will give you another CNAME target

---

## Part 3: Configure xneelo DNS

Now configure DNS at xneelo to point to Railway.

### DNS Records to Update

Log in to xneelo → Domains → `dungeonlair.co.za` → DNS Management

#### Option 1: Backend Only (Frontend served from backend)

**Delete or modify these:**
- A record: `@` → `41.203.18.177`
- A record: `www` → `41.203.18.177`

**Add these:**
- **CNAME**: `@` → `your-backend.railway.app` (or use ALIAS if xneelo supports it)
- **CNAME**: `www` → `your-backend.railway.app`

#### Option 2: Separate Frontend & Backend

**For root domain (backend):**
- **CNAME or ALIAS**: `@` → `your-backend.railway.app`

**For www (frontend):**
- **CNAME**: `www` → `your-frontend.railway.app`

**Keep these email records:**
- A record: `mail` → `41.203.18.177`
- MX record: `@` → `mail`
- CNAME: `ftp`, `imap`, `pop`, `relay`, `smtp` → `mail`

### Important xneelo Notes

1. If xneelo doesn't support CNAME on root (`@`), use:
   - **ALIAS** record (if available)
   - Or use **ANAME** record
   - As last resort, ask Railway for an IP address (not recommended)

2. Set TTL to **300 seconds** while testing

3. After updating DNS, click **"Update name servers"** in xneelo warning dialog

---

## Part 4: Configure Railway Custom Domains

### Backend Domain Setup

1. Railway backend service → **Settings** → **Networking** → **Custom Domains**
2. Add: `dungeonlair.co.za`
3. Railway will verify DNS after you update xneelo

### Frontend Domain Setup (if separate)

1. Railway frontend service → **Settings** → **Networking** → **Custom Domains**
2. Add: `www.dungeonlair.co.za`

**Railway automatically provisions SSL certificates from Let's Encrypt!**

---

## Part 5: Verify Deployment

### Check Backend

Visit: `https://dungeonlair.co.za/api/health`

Expected response:
```json
{
  "status": "OK",
  "timestamp": "...",
  "environment": "production"
}
```

### Check Frontend

Visit: `https://dungeonlair.co.za` (or `https://www.dungeonlair.co.za`)

You should see the login/register page.

### Check Database

1. In Railway, go to PostgreSQL service
2. Click **"Data"** tab
3. You should see `users`, `campaigns`, `characters` tables

---

## Troubleshooting

### "Cannot connect to database"

- Check that `DATABASE_URL` is set in backend variables (Railway auto-sets this)
- Verify PostgreSQL service is running
- Check backend logs in Railway

### "CORS error" in browser console

- Verify `CORS_ORIGIN` includes your domain
- Check that frontend is using HTTPS
- Make sure custom domain is verified in Railway

### "DNS not resolving"

- Wait 5-30 minutes for DNS propagation
- Check DNS at: https://www.whatsmydns.net/
- Verify CNAME records in xneelo point to Railway domains

### Railway Build Fails

- Check that `package.json` has correct `start` script
- Verify Node.js version compatibility
- Check Railway build logs for specific errors

### SSL Certificate Issues

- Railway auto-provisions SSL - no action needed
- If seeing SSL errors, wait 10-15 minutes after DNS verification
- Check domain verification status in Railway

---

## Environment Variables Reference

### Backend (Railway)

```bash
NODE_ENV=production
DATABASE_URL=<auto-set by Railway PostgreSQL>
JWT_SECRET=<generate a strong random string>
CORS_ORIGIN=https://dungeonlair.co.za,https://www.dungeonlair.co.za
PORT=<auto-set by Railway>
```

### Frontend (Railway - if separate service)

```bash
REACT_APP_API_URL=https://dungeonlair.co.za/api
```

---

## Post-Deployment Checklist

- [ ] Backend deploys successfully
- [ ] PostgreSQL database is connected
- [ ] Migrations run automatically on startup
- [ ] `/api/health` endpoint responds
- [ ] Custom domain `dungeonlair.co.za` points to Railway
- [ ] DNS propagation complete (verify at whatsmydns.net)
- [ ] SSL certificate issued by Railway
- [ ] Frontend served correctly
- [ ] Login/register functionality works
- [ ] WebSocket connections work (check campaigns/battles)
- [ ] File uploads work (character portraits)
- [ ] xneelo nameservers updated (if warning shown)

---

## Maintenance

### View Logs

Railway → Select service → **Deployments** → Click on deployment → **View Logs**

### Database Backups

Railway → PostgreSQL service → **Data** → **Backups**

Railway automatically backs up your database.

### Update Code

1. Push changes to GitHub
2. Railway automatically redeploys
3. Monitor deployment in Railway dashboard

### Manual Redeploy

Railway → Service → **Deployments** → **⋮** → **Redeploy**

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **xneelo Support**: Contact xneelo for DNS issues

---

Good luck with your deployment! 🎲🏰
