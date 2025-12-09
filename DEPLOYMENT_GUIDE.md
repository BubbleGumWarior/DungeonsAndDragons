# Deployment Guide - Internet Access

## Prerequisites
✅ No-IP DDNS configured: `dungeonlair.ddns.net`
✅ Static local IP for your PC (recommended)
✅ Router port forwarding configured

---

## Router Port Forwarding Setup

Configure your router to forward these ports to your PC's local IP address:

| Port | Protocol | Purpose |
|------|----------|---------|
| 5000 | TCP | Backend API |
| 3000 | TCP | Frontend (Dev Mode) |
| 443  | TCP | HTTPS (Future - when you get SSL cert) |

**How to find your local IP:**
```powershell
ipconfig | Select-String -Pattern "IPv4"
```

---

## Running Your Application for Internet Access

### **Option 1: Development Mode** (Easier for testing)

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
$env:HOST="0.0.0.0"; npm start
```

**Access your app:**
- Locally: `http://localhost:3000`
- Internet: `http://dungeonlair.ddns.net:3000`

---

### **Option 2: Production Mode** ⭐ (Recommended)

**Step 1: Build Frontend**
```powershell
cd frontend
npm run build
```

**Step 2: Run Backend (serves both API and frontend)**
```powershell
cd backend
$env:NODE_ENV="production"; npm start
```

**Access your app:**
- Locally: `http://localhost:5000`
- Internet: `http://dungeonlair.ddns.net:5000`

---

## Security Recommendations

### 1. **Get a Free SSL Certificate** (Recommended!)

Use Let's Encrypt for free HTTPS:

```powershell
# Install Certbot for Windows
# Visit: https://certbot.eff.org/instructions

# Then get certificate
certbot certonly --standalone -d dungeonlair.ddns.net
```

Place certificates in `Certs/` folder and update `.env`:
```
SSL_CERT_PATH=../Certs/cert.pem
SSL_KEY_PATH=../Certs/key.pem
NODE_ENV=production
```

### 2. **Firewall Rules**

Open Windows Firewall for Node.js:
```powershell
New-NetFirewallRule -DisplayName "Node.js Server" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5000
```

### 3. **Environment Variables**

Create `backend/.env` file:
```env
NODE_ENV=production
PORT=5000
CORS_ORIGIN=http://dungeonlair.ddns.net,http://dungeonlair.ddns.net:3000,https://dungeonlair.ddns.net
```

---

## Troubleshooting

### Can't access from internet?
1. Check port forwarding is enabled on router
2. Verify No-IP DDNS is updating correctly
3. Check Windows Firewall isn't blocking ports
4. Test: `http://your-public-ip:5000/api/health`

### CORS errors?
- Frontend must connect to same domain as you access it from
- Check browser console for specific error
- Backend CORS is configured for your domain

### SSL/HTTPS not working?
- Verify certificates exist in `Certs/` folder
- Check certificate paths in `.env`
- Ensure `NODE_ENV=production` is set

---

## Current Configuration Status

✅ Backend listens on `0.0.0.0:5000` (all interfaces)
✅ CORS configured for `dungeonlair.ddns.net`
✅ Production mode serves frontend from backend
✅ WebSocket support included

**Next Steps:**
1. Configure router port forwarding
2. Test local access first
3. Test internet access from phone (not on WiFi)
4. Get SSL certificate for HTTPS
