# 🚀 SpudVerse Bot Setup Guide

## 📋 Prerequisites

1. **Node.js** version 16+ 
2. **Telegram Bot Token** from @BotFather
3. **Git** to clone repository

## ⚡ Quick Setup (5 minutes)

### Step 1: Create Telegram Bot
1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Set bot name: `SpudVerse Bot`
4. Set username: `spudverse_bot` (or any available name)
5. Save the BOT_TOKEN you receive

### Step 2: Clone and Install
\`\`\`bash
# Clone repository
git clone <your-repo-url>
cd spudverse

# Install dependencies  
npm install

# Create environment file
cp .env.example .env
\`\`\`

### Step 3: Configure Bot Token
Edit the `.env` file:
\`\`\`env
BOT_TOKEN=YOUR_BOT_TOKEN_HERE
DATABASE_URL=./database/spudverse.db
SPUD_PER_TAP=1
TAP_COOLDOWN_MS=1000
REFERRAL_BONUS=100
\`\`\`

### Step 4: Setup Database
\`\`\`bash
npm run setup
\`\`\`

### Step 5: Run Bot
\`\`\`bash
# Development mode (auto-restart on changes)
npm run dev

# Or production mode
npm start
\`\`\`

🎉 **Bot is ready!** Find your bot on Telegram and send `/start`

## 🌐 Deploy to Render (Free)

### Step 1: Sign up for Render
1. Go to [render.com](https://render.com)
2. Create new account
3. Connect with your GitHub repository

### Step 2: Create Web Service
1. Click "New" → "Web Service"
2. Connect SpudVerse repository
3. Configure:
   - **Name**: spudverse-bot
   - **Environment**: Node
   - **Build Command**: `npm install && npm run setup`
   - **Start Command**: `npm start`

### Step 3: Set Environment Variables
In Render dashboard, add:
\`\`\`
BOT_TOKEN = your_bot_token_here
NODE_ENV = production
WEBHOOK_URL = https://your-app-name.onrender.com
\`\`\`

### Step 4: Deploy
1. Click "Create Web Service"
2. Wait for deployment (3-5 minutes)
3. Bot will run 24/7 for free!

## 🚂 Deploy to Railway (Recommended)

### Step 1: Sign up for Railway
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Deploy from GitHub
1. Click "New Project"
2. "Deploy from GitHub repo"
3. Select SpudVerse repository
4. Railway will auto-detect and build

### Step 3: Set Environment Variables
\`\`\`
BOT_TOKEN = your_bot_token_here
NODE_ENV = production
\`\`\`

### Step 4: Setup Domain (optional)
1. Go to Settings → Networking
2. Generate Domain or add custom domain

## 🐳 Deploy with Docker

### Local Docker
\`\`\`bash
# Build image
docker build -t spudverse-bot .

# Run container
docker run -d \\
  --name spudverse \\
  -p 3000:3000 \\
  -e BOT_TOKEN=your_bot_token \\
  -v $(pwd)/database:/app/database \\
  spudverse-bot
\`\`\`

### Docker Compose
Create `docker-compose.yml` file:
\`\`\`yaml
version: '3.8'
services:
  spudverse-bot:
    build: .
    ports:
      - "3000:3000"
    environment:
      - BOT_TOKEN=your_bot_token_here
      - NODE_ENV=production
    volumes:
      - ./database:/app/database
    restart: unless-stopped
\`\`\`

Run:
\`\`\`bash
docker-compose up -d
\`\`\`

## 🔧 Customize Bot

### Change rewards and cooldown
Edit `.env`:
\`\`\`env
SPUD_PER_TAP=2          # Increase SPUD per tap
TAP_COOLDOWN_MS=500     # Reduce cooldown
REFERRAL_BONUS=200      # Increase referral bonus
\`\`\`

### Add new missions
1. Edit `database/database.js`
2. Add missions in `addDefaultMissions()`
3. Restart bot

### Change interface
1. Edit emojis in `utils/helpers.js`
2. Modify text in message functions
3. Restart bot

## ❗ Troubleshooting

### Bot not responding
1. Check if BOT_TOKEN is correct
2. Verify bot is enabled from @BotFather
3. Check logs: `docker logs spudverse` (if using Docker)

### Database errors
\`\`\`bash
# Reset database
rm database/spudverse.db
npm run setup
\`\`\`

### Deployment fails
1. Check Node.js version (>=16)
2. Verify environment variables
3. Check build logs

### Bot running slow
1. Increase server resources
2. Optimize database queries
3. Enable caching

## 📞 Support

- **GitHub Issues**: Report bugs
- **Documentation**: Read README.md
- **Telegram**: @your_telegram (replace with your contact)

## 🎯 Completion Checklist

- [ ] Bot token setup
- [ ] Database initialized
- [ ] Bot responds to `/start`
- [ ] Farm function works
- [ ] Airdrops display correctly
- [ ] Leaderboard has data
- [ ] Referral link generates
- [ ] Successfully deployed

🥔 **Congratulations! Your SpudVerse Bot is ready!** 🌟