# 🚀 Deploy SpudVerse Mini App - Quick Guide

## 📋 **Deploy Options**

### **Option 1: Vercel (Recommended) ⚡**

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "SpudVerse Mini App"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/spudverse.git
   git push -u origin main
   ```

2. **Deploy on Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Add Environment Variables:
     - `BOT_TOKEN` = 8481740628:AAGFb9-sMO3X4pOQvegd_mxOfFttwBQwia4
     - `NODE_ENV` = production
   - Deploy!

3. **Update Bot:**
   - Copy your Vercel URL (e.g., `https://spudverse.vercel.app`)
   - Update `.env`: `WEB_APP_URL=https://spudverse.vercel.app`
   - Restart bot: `node index.js`

### **Option 2: Netlify 🌐**

1. **Push to GitHub** (same as above)

2. **Deploy on Netlify:**
   - Go to [netlify.com](https://netlify.com)
   - "New site from Git"
   - Connect GitHub repo
   - Build settings: already configured in `netlify.toml`
   - Add Environment Variables in dashboard
   - Deploy!

3. **Add Netlify Functions dependency:**
   ```bash
   npm install serverless-http
   ```

### **Option 3: Railway 🚂**

1. **Push to GitHub** (same as above)

2. **Deploy on Railway:**
   - Go to [railway.app](https://railway.app)
   - "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Add Environment Variables
   - Deploy automatically!

## 🔧 **After Deployment**

### **Step 1: Update Environment Variables**
Update your `.env` file:
```env
# Replace with your actual deployed URL
WEB_APP_URL=https://your-app-name.vercel.app

# Keep other settings
BOT_TOKEN=8481740628:AAGFb9-sMO3X4pOQvegd_mxOfFttwBQwia4
NODE_ENV=production
```

### **Step 2: Restart Bot**
```bash
node index.js
```

### **Step 3: Test Mini App**
1. Send `/start` to your bot
2. Click "🎮 Play Game" button
3. Game should open inside Telegram!

## 🎮 **Mini App Features**

### **When deployed with HTTPS, your bot will have:**
✅ **Play Game button** - Opens game inside Telegram  
✅ **Quick Stats** - View balance without opening game  
✅ **Help** - Game instructions  
✅ **Full Mini App experience** - Works on mobile & desktop  

### **Telegram Integration:**
- **Haptic feedback** on taps
- **Native UI** integration
- **Seamless sharing** for referrals
- **Real-time** data sync

## 🆘 **Troubleshooting**

### **Bot shows development mode:**
- Check `WEB_APP_URL` starts with `https://`
- Restart bot after updating environment

### **Mini App won't load:**
- Verify deployed URL is accessible
- Check browser console for errors
- Ensure all API endpoints work

### **Database issues:**
- SQLite works for small scale
- For production, consider PostgreSQL
- Update `DATABASE_URL` in deployment

## 🔥 **Quick Deploy Commands**

```bash
# 1. Setup GitHub
git init && git add . && git commit -m "SpudVerse"

# 2. Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/spudverse.git
git push -u origin main

# 3. Deploy on Vercel (install CLI first)
npm i -g vercel
vercel --prod

# 4. Update bot
# Copy the Vercel URL to WEB_APP_URL in .env
node index.js
```

## 🎉 **Success!**

Your SpudVerse Mini App is now live! Users can:
- Play directly in Telegram
- Farm SPUD coins with animations
- Complete missions and compete
- Share with friends seamlessly

**Enjoy your potato farming empire! 🥔👑**
