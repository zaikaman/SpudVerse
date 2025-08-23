# 🥔 SpudVerse Bot - Telegram Farming Game

A Telegram bot with a potato theme that allows users to farm SPUD coins, complete airdrop missions, and compete on leaderboards.

## ✨ Main Features

### 🌱 Farm Page
- Tap potatoes to harvest SPUD coins
- Each tap = +1 SPUD 
- Cooldown system to prevent spam
- Real-time balance display

### 🎁 Airdrops Page
- List of missions to earn rewards
- Social missions: Join Telegram, Follow Twitter
- Referral missions: Invite friends
- Rewards from 100-500 SPUD

### 🏆 Leaderboard
- Top 10 farmers with most SPUD
- Real-time ranking
- Display username and balance

### 👤 Profile Page
- Account information and balance
- Personal referral link
- Referral statistics and achievements

## 🚀 Installation and Setup

### 1. Clone repository
\`\`\`bash
git clone <repository-url>
cd spudverse
\`\`\`

### 2. Install dependencies
\`\`\`bash
npm install
\`\`\`

### 3. Setup environment variables
\`\`\`bash
cp .env.example .env
\`\`\`

Edit the `.env` file:
\`\`\`env
BOT_TOKEN=your_telegram_bot_token_here
DATABASE_URL=./database/spudverse.db
SPUD_PER_TAP=1
TAP_COOLDOWN_MS=1000
REFERRAL_BONUS=100
\`\`\`

### 4. Setup database
\`\`\`bash
npm run setup
\`\`\`

### 5. Run the bot
\`\`\`bash
# Development mode
npm run dev

# Production mode
npm start
\`\`\`

## 🗄️ Database Structure

### users
- `user_id`: Telegram user ID (Primary Key)
- `username`: Telegram username  
- `first_name`, `last_name`: User names
- `balance`: SPUD coins balance
- `last_tap_time`: Last tap timestamp
- `referrer_id`: Referrer user ID
- `created_at`, `updated_at`: Timestamps

### referrals
- `referrer_id`: Referrer user ID
- `referred_id`: Referred user ID
- `bonus_claimed`: Bonus claimed status
- `created_at`: Creation timestamp

### missions
- `id`: Mission ID
- `title`: Mission title
- `description`: Description
- `reward`: SPUD reward amount
- `type`: Mission type (social, referral, etc.)
- `requirements`: Requirements (JSON)
- `is_active`: Active status

### user_missions
- `user_id`: User ID
- `mission_id`: Mission ID
- `completed`: Completion status
- `claimed`: Reward claimed status
- `completed_at`: Completion timestamp

## 🌐 Deployment

### Railway
1. Push code to GitHub
2. Connect with Railway
3. Set environment variables
4. Auto deploy

### Render
1. Connect repository with Render
2. Use the included `render.yaml` file
3. Set BOT_TOKEN in dashboard
4. Deploy

### Docker
\`\`\`bash
# Build image
docker build -t spudverse-bot .

# Run container
docker run -d \\
  --name spudverse \\
  -p 3000:3000 \\
  -e BOT_TOKEN=your_bot_token \\
  spudverse-bot
\`\`\`

## 🎮 How to Use

### For Users
1. Start bot: `/start`
2. Farm coins: Tap "🥔 TAP TO FARM" button
3. View missions: "🎁 Airdrops"
4. Invite friends: "👤 Profile" → "🔗 Generate Referral Link"
5. Check ranking: "🏆 Leaderboard"

### For Admin
- Add new missions in database
- Adjust rewards and cooldown via .env
- Monitor logs and stats

## 🔧 Configuration

### Environment Variables
- `BOT_TOKEN`: Telegram bot token (required)
- `DATABASE_URL`: SQLite database path
- `SPUD_PER_TAP`: SPUD earned per tap (default: 1)
- `TAP_COOLDOWN_MS`: Cooldown between taps (default: 1000ms)
- `REFERRAL_BONUS`: Friend referral bonus (default: 100)
- `NODE_ENV`: Environment (development/production)
- `PORT`: Webhook port (default: 3000)
- `WEBHOOK_URL`: Webhook URL for production

## 📱 Bot Commands

- `/start` - Start the bot
- `/help` - Show user guide
- `/farm` - Go to farming page
- `/profile` - View your profile
- `/leaderboard` - Check leaderboard

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push and create Pull Request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

If you encounter issues, please:
1. Check logs
2. Ensure BOT_TOKEN is correct
3. Verify database setup
4. Create issue on GitHub

---

🥔 **Happy Farming!** 🌱

Built with ❤️ using Node.js + Telegraf