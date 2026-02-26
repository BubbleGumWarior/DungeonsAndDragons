# Quick Start Guide - Railway Deployment

## TL;DR - Deploy to Railway (Single Service)

### 1. Push your code to GitHub (if not already)

```bash
git add .
git commit -m "Configure for Railway deployment"
git push origin main
```

### 2. Deploy on Railway

1. Go to https://railway.app/new
2. Click **"Deploy from GitHub repo"**
3. Select your `DungeonsAndDragons` repo
4. Railway auto-detects configuration and builds both frontend + backend

### 3. Add PostgreSQL Database

1. In Railway project → **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway auto-connects it to your service (provides `DATABASE_URL`)

### 4. Set Environment Variables

In your service → **Variables** tab, add:

```
NODE_ENV=production
JWT_SECRET=your_random_secret_at_least_32_characters_long
CORS_ORIGIN=https://dungeonlair.co.za,https://www.dungeonlair.co.za
```

**Note:** `DATABASE_URL` and `PORT` are automatically set by Railway!

### 5. Wait for Build to Complete

Railway will:
1. Install backend dependencies
2. Install frontend dependencies
3. Build React app
4. Start backend server (which serves the built frontend)

Watch the deployment logs to confirm success.

### 6. Configure Custom Domain

1. Your service → **Settings** → **Networking** → **Custom Domains**
2. Click **"+ Custom Domain"**
3. Enter: `dungeonlair.co.za`
4. Railway shows you a CNAME target like: `your-app-production.up.railway.app`

**Copy this target for DNS setup!**

### 7. Update xneelo DNS

Log in to xneelo → Domains → `dungeonlair.co.za` → DNS

**Change these records:**

| Type | Host | Value |
|------|------|-------|
| CNAME or ALIAS | @ | `your-app-production.up.railway.app` (from Railway) |
| CNAME | www | `your-app-production.up.railway.app` (from Railway) |

**Keep email records** (mail, imap, pop, relay, smtp, etc.)

Set TTL to **300** while testing.

**Important:** After updating DNS, click **"Update name servers"** button in the xneelo warning if shown.

### 8. Wait for DNS Propagation

- Usually takes 5-30 minutes
- Check at: https://www.whatsmydns.net/
- Search for `dungeonlair.co.za` with record type "CNAME"

### 9. Verify Deployment

**Check backend health:**
Visit: `https://dungeonlair.co.za/api/health`

Should return:
```json
{"status": "OK", "environment": "production"}
```

**Check frontend:**
Visit: `https://dungeonlair.co.za`

You should see your login/register page! 🎉

---

## What Changed in Your Code

✅ **Backend**
- `database.js` now supports Railway's `DATABASE_URL`
- `server.js` removed SSL certificates (Railway handles SSL)
- CORS updated to include `dungeonlair.co.za`

✅ **Frontend**
- `api.ts` uses `REACT_APP_API_URL` or falls back to domain
- Frontend is built during deployment

✅ **Root Configuration**
- `package.json` - Build and start scripts
- `nixpacks.toml` - Railway build instructions
- `railway.json` - Deployment configuration
- `.gitignore` - Updated to ignore `frontend/build/`

✅ **New Files**
- `backend/.env.example` - Environment variable template
- `frontend/.env.example` - Frontend environment template
- `RAILWAY_DEPLOYMENT.md` - Full deployment guide

---

## How It Works

1. **Railway receives your code** from GitHub
2. **Runs `nixpacks.toml` config:**
   - Installs Node.js 20
   - Installs backend dependencies
   - Installs frontend dependencies
   - Builds React app to `frontend/build/`
3. **Starts backend** with `node server.js`
4. **Backend serves:**
   - API routes at `/api/*`
   - Static frontend files from `frontend/build/`
   - Uploaded files from `backend/uploads/`

✨ **Single service, full-stack app!**

---

## Troubleshooting

### Build Fails

Check Railway logs for:
- **"npm install failed"** → Check package.json syntax
- **"npm run build failed"** → Frontend build error, check React code
- **"Module not found"** → Missing dependency in package.json

### "Cannot connect to database"

- Verify PostgreSQL service is attached to your project
- Check that `DATABASE_URL` appears in environment variables
- Wait 1-2 minutes after database creation

### CORS Errors

- Verify `CORS_ORIGIN` includes your domain
- Check custom domain is verified in Railway
- Clear browser cache

### DNS Not Resolving

- Wait up to 30 minutes for propagation
- Verify CNAME records point to Railway domain
- Check nameservers are set to xneelo's

---

## Need Help?

See **RAILWAY_DEPLOYMENT.md** for detailed troubleshooting and configuration options.

---

## Post-Deployment

✅ **Auto-deployments enabled!**

Every time you push to GitHub, Railway automatically:
1. Pulls latest code
2. Rebuilds frontend
3. Restarts backend
4. Zero-downtime deployment

**View logs:** Railway → Your service → Deployments → Click deployment → View Logs

---

**Next Steps:**
1. Follow steps 1-9 above
2. Your app will be live at `https://dungeonlair.co.za`
3. Railway auto-provisions SSL certificates
4. Start managing your D&D campaigns! 🎲🏰
