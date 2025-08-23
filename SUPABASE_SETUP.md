# 🚀 Supabase Setup Guide for SpudVerse

## 📋 **Quick Setup (5 minutes)**

### **Step 1: Create Supabase Project**
1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign up with GitHub (recommended)
4. Click "New Project"
5. Choose organization and name: `spudverse`
6. Generate a strong password
7. Select region closest to your users
8. Click "Create new project"

### **Step 2: Setup Database Schema**
1. Wait for project to finish provisioning (~2 minutes)
2. Go to **SQL Editor** in left sidebar
3. Copy the entire content from `database/supabase.sql`
4. Paste into SQL Editor
5. Click **Run** to execute all commands

### **Step 3: Get API Credentials**
1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### **Step 4: Update Environment Variables**
Add to your `.env` file:
```env
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### **Step 5: Install Dependencies & Test**
```bash
npm install @supabase/supabase-js
node index.js
```

## 🎉 **You're Done!**

Your bot now uses Supabase! Benefits:
- ✅ **Real-time leaderboard** updates
- ✅ **Cloud database** - works everywhere
- ✅ **Better performance** and reliability
- ✅ **Visual dashboard** to monitor data
- ✅ **Automatic backups** and scaling

## 📊 **Supabase Dashboard Features**

### **Table Editor**
- View all users, balances, missions
- Edit data directly if needed
- Export data as CSV

### **Authentication** (Future)
- Can add real user auth later
- OAuth with Google, GitHub, etc.

### **Real-time** 
- Leaderboard updates instantly
- See users farming in real-time

### **API Logs**
- Monitor all database queries
- Debug performance issues

## 🔧 **Advanced Configuration**

### **Row Level Security (RLS)**
Already configured to allow all operations. Later you can:
- Restrict users to only update their own data
- Add admin-only access to missions
- Implement anti-cheat measures

### **Database Functions**
Included functions:
- `get_user_stats()` - Get comprehensive user stats
- `leaderboard` view - Optimized ranking query

### **Real-time Subscriptions**
```javascript
// Listen for leaderboard changes
const subscription = db.subscribeToLeaderboard((change) => {
    console.log('Leaderboard updated!', change);
    // Update UI in real-time
});
```

## 🆘 **Troubleshooting**

### **Bot still uses SQLite**
- Check environment variables are set correctly
- Restart bot: `node index.js`
- Should see "Database: Supabase" in logs

### **API errors in Supabase**
- Check **Logs** tab in Supabase dashboard
- Verify RLS policies allow operations
- Check API key permissions

### **Connection issues**
- Verify project URL and anon key
- Check if project is paused (free tier sleeps after inactivity)
- Ensure network connectivity

## 🚀 **Migration from SQLite**

### **Export existing data:**
```bash
# If you have existing SQLite data
node -e "
const Database = require('./database/database');
const db = new Database();
// Add migration script here
"
```

### **Import to Supabase:**
Use the Supabase dashboard Table Editor to import CSV data.

## 🔮 **Future Enhancements with Supabase**

### **Real-time Features**
- Live leaderboard updates
- Real-time mission completion notifications
- Multiplayer farming events

### **Advanced Analytics**
- User engagement tracking
- Revenue analytics (if you add purchases)
- A/B testing different game mechanics

### **Social Features**
- Friend systems
- Guild/team competitions
- Chat integration

### **Push Notifications**
- Daily farming reminders
- Special event notifications
- Achievement celebrations

---

**🎮 Ready to farm with cloud power! Your SpudVerse is now infinitely scalable! 🥔☁️**
