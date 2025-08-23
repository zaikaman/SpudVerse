require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const Database = require('./database/database');
const SupabaseDatabase = require('./database/supabase');
const {
    getMainKeyboard,
    getBackButton,
    getFarmKeyboard,
    getAirdropsKeyboard,
    getProfileKeyboard,
    checkTapCooldown,
    getWelcomeMessage,
    getFarmMessage,
    getLeaderboardMessage,
    getProfileMessage,
    getAirdropsMessage,
    generateReferralLink,
    parseReferralCode,
    formatNumber,
    EMOJIS
} = require('./utils/helpers');

// Initialize Express app, bot and database
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Choose database based on environment variables
console.log('🔍 Debug - SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('🔍 Debug - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');

const db = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY 
    ? new SupabaseDatabase() 
    : new Database();

console.log(`📊 Database: ${process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? 'Supabase' : 'SQLite'}`);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware for Mini App
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Middleware to ensure user is registered
bot.use(async (ctx, next) => {
    if (ctx.from) {
        let user = await db.getUser(ctx.from.id);
        
        if (!user) {
            // Create new user
            const referrerId = ctx.message && ctx.message.text && ctx.message.text.startsWith('/start ') 
                ? parseReferralCode(ctx.message.text.split(' ')[1])
                : null;
                
            await db.createUser(
                ctx.from.id,
                ctx.from.username,
                ctx.from.first_name,
                ctx.from.last_name,
                referrerId
            );
            
            // If there's a referrer, add to referrals table and give bonus
            if (referrerId && referrerId !== ctx.from.id) {
                await db.addReferral(referrerId, ctx.from.id);
                await db.updateUserBalance(referrerId, parseInt(process.env.REFERRAL_BONUS) || 100);
                await db.updateUserBalance(ctx.from.id, 50); // Bonus for invited user
                
                // Send notification to referrer
                try {
                    await ctx.telegram.sendMessage(referrerId, 
                        `${EMOJIS.tada} You just earned ${process.env.REFERRAL_BONUS || 100} SPUD from inviting a friend! ${EMOJIS.money}`
                    );
                } catch (err) {
                    console.log('Cannot send referral notification:', err.message);
                }
            }
            
            // Create welcome mission for new user
            await db.updateUserMission(ctx.from.id, 1, true, false); // Mission ID 1 = welcome
        }
        
        ctx.user = await db.getUser(ctx.from.id); // Refresh user data
    }
    
    return next();
});

// API Routes for Mini App
app.get('/api/user', async (req, res) => {
    try {
        // Extract user ID from Telegram Mini App data
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const user = await db.getUser(userId);
        const referralCount = await db.getReferralCount(userId);
        const energyData = await db.getUserEnergy(userId);
        
        // Auto-complete welcome mission for new users
        await db.updateUserMission(userId, 1, true, false); // Mission ID 1 = Welcome to SpudVerse
        
        // Auto-complete daily login mission (always mark as completed when user accesses app)
        console.log('📅 Auto-completing daily login mission');
        await db.updateUserMission(userId, 5, true, false); // Mission ID 5 = Daily Login
        
        res.json({
            success: true,
            data: {
                balance: user?.balance || 0,
                energy: energyData.current_energy,
                maxEnergy: energyData.max_energy,
                energyRegenRate: energyData.energy_regen_rate,
                timeToFull: energyData.time_to_full,
                perTap: 1,
                streak: 0,
                combo: 1,
                totalFarmed: user?.balance || 0,
                referrals: referralCount
            }
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/tap', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { amount } = req.body;
        const tapAmount = amount || 1;
        
        // Check energy before processing tap
        const energyResult = await db.consumeEnergy(userId, tapAmount);
        
        if (!energyResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: energyResult.error,
                energyData: energyResult
            });
        }
        
        // Process the tap
        await db.updateUserBalance(userId, tapAmount);
        await db.updateLastTapTime(userId, Date.now());

        // Get updated user stats and check for achievements
        const userStats = await db.getUserStats(userId);
        const newAchievements = await db.checkAndUnlockAchievements(userId, userStats);

        res.json({
            success: true,
            data: {
                balance: userStats.balance,
                earned: tapAmount,
                energy: energyResult.current_energy,
                maxEnergy: energyResult.max_energy,
                timeToFull: energyResult.time_to_full,
                newAchievements: newAchievements.map(ua => ({
                    id: ua.achievements.id,
                    title: ua.achievements.title,
                    description: ua.achievements.description,
                    icon: ua.achievements.icon,
                    reward: ua.achievements.reward
                }))
            }
        });
    } catch (error) {
        console.error('Tap API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/missions', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const missions = await db.getMissions();
        const userMissions = await Promise.all(
            missions.map(mission => db.getUserMissionProgress(userId, mission.id))
        );

        const missionsWithStatus = missions.map((mission, index) => {
            const userMission = userMissions[index];
            let status = 'pending';
            let claimed = false;

            if (userMission) {
                if (userMission.completed) status = 'completed';
                if (userMission.claimed) claimed = true;
            }

            return {
                ...mission,
                status,
                claimed
            };
        });

        res.json({
            success: true,
            data: missionsWithStatus
        });
    } catch (error) {
        console.error('Missions API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/missions/claim', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { missionId } = req.body;
        const missions = await db.getMissions();
        const mission = missions.find(m => m.id === missionId);

        if (!mission) {
            return res.status(404).json({ success: false, error: 'Mission not found' });
        }

        const userMission = await db.getUserMissionProgress(userId, missionId);
        if (!userMission || !userMission.completed || userMission.claimed) {
            console.log(`🚨 Claim attempt blocked - User ${userId}, Mission ${missionId}:`, {
                exists: !!userMission,
                completed: userMission?.completed,
                claimed: userMission?.claimed
            });
            return res.status(400).json({ success: false, error: 'Cannot claim this mission' });
        }

        console.log(`💰 Updating balance: +${mission.reward} SPUD for user ${userId}`);
        await db.updateUserBalance(userId, mission.reward);
        
        console.log(`📝 Marking mission ${missionId} as claimed for user ${userId}`);
        await db.updateUserMission(userId, missionId, true, true);
        
        // Verify the mission was actually updated
        const verifyMission = await db.getUserMissionProgress(userId, missionId);
        console.log(`🔍 Mission ${missionId} status after update:`, {
            completed: verifyMission?.completed,
            claimed: verifyMission?.claimed,
            exists: !!verifyMission
        });
        
        // Get updated user data
        const updatedUser = await db.getUser(userId);
        console.log(`💵 Updated user balance: ${updatedUser.balance}`);

        res.json({
            success: true,
            data: {
                reward: mission.reward,
                balance: updatedUser.balance,
                message: `You earned ${mission.reward} SPUD!`
            }
        });
    } catch (error) {
        console.error('Claim API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboard = await db.getLeaderboard(10);
        const formattedLeaderboard = leaderboard.map((user, index) => ({
            rank: index + 1,
            name: user.username ? `@${user.username}` : user.first_name || 'Anonymous',
            balance: user.balance,
            level: getLevelFromBalance(user.balance)
        }));

        res.json({
            success: true,
            data: formattedLeaderboard
        });
    } catch (error) {
        console.error('Leaderboard API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API endpoint to get achievements
app.get('/api/achievements', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const [achievements, userAchievements] = await Promise.all([
            db.getAchievements(),
            db.getUserAchievements(userId)
        ]);

        const unlockedIds = userAchievements.map(ua => ua.achievement_id);

        const achievementData = achievements.map(achievement => ({
            ...achievement,
            unlocked: unlockedIds.includes(achievement.id),
            unlocked_at: userAchievements.find(ua => ua.achievement_id === achievement.id)?.unlocked_at
        }));

        res.json({
            success: true,
            data: achievementData
        });
    } catch (error) {
        console.error('Achievements API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API endpoint to get current energy
app.get('/api/energy', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const energyData = await db.getUserEnergy(userId);
        
        res.json({
            success: true,
            data: energyData
        });
    } catch (error) {
        console.error('Energy API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API endpoint for energy upgrades
app.post('/api/energy/upgrade', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { upgradeType, cost } = req.body;
        
        if (!upgradeType || !cost) {
            return res.status(400).json({ success: false, error: 'Missing upgrade type or cost' });
        }

        const success = await db.upgradeUserEnergy(userId, upgradeType, cost);
        
        if (success) {
            const updatedUser = await db.getUser(userId);
            const energyData = await db.getUserEnergy(userId);
            
            res.json({
                success: true,
                data: {
                    balance: updatedUser.balance,
                    ...energyData
                }
            });
        } else {
            res.status(400).json({ success: false, error: 'Upgrade failed - insufficient balance' });
        }
    } catch (error) {
        console.error('Energy Upgrade API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Helper function to extract user ID from Telegram Mini App request
function getUserIdFromRequest(req) {
    // In a real implementation, you would validate the Telegram Mini App init data
    // For now, we'll use a simple approach
    const auth = req.headers.authorization;
    console.log('🔍 Auth header:', auth ? 'Present' : 'Missing');
    
    if (auth && auth.startsWith('tma ')) {
        // Parse Telegram Mini App data
        try {
            const initData = auth.slice(4);
            console.log('📊 Init data length:', initData.length);
            
            const params = new URLSearchParams(initData);
            const userStr = params.get('user');
            console.log('👤 User string:', userStr ? 'Found' : 'Missing');
            
            if (userStr) {
                const user = JSON.parse(userStr);
                console.log('✅ Parsed user ID:', user.id);
                return user.id;
            }
        } catch (error) {
            console.error('❌ Error parsing Telegram data:', error);
        }
    }
    
    // Fallback for development - use query param or default
    const fallback = req.query.userId || req.body.userId || 12345;
    console.log('🔄 Using fallback user_id:', fallback);
    return fallback;
}

// Helper function to get level from balance
function getLevelFromBalance(balance) {
    if (balance >= 50000) return '🌟 Legend';
    if (balance >= 25000) return '🔥 Pro';
    if (balance >= 15000) return '⭐ Expert';
    if (balance >= 8000) return '🌱 Advanced';
    if (balance >= 3000) return '🥔 Skilled';
    if (balance >= 1000) return '🌿 Regular';
    return '🌱 Beginner';
}

// Command /start - Launch Mini App
bot.start(async (ctx) => {
    const webAppUrl = process.env.WEB_APP_URL;
    
    if (webAppUrl && webAppUrl.startsWith('https://')) {
        // Production mode with HTTPS - Full Mini App experience
        await ctx.reply(
            `🥔 **Welcome to SpudVerse!** 🌱\n\n` +
            `Ready to become a potato farming legend?\n\n` +
            `🎮 **Tap "Play Game" to start farming SPUD coins!**\n\n` +
            `🎁 **Features:**\n` +
            `• Interactive potato farming\n` +
            `• Epic airdrop missions\n` +
            `• Leaderboard competition\n` +
            `• Friend referral bonuses\n\n` +
            `🚀 **Start your farming empire now!**`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: '🎮 Play Game',
                            web_app: { url: webAppUrl }
                        }],
                        [{
                            text: '📱 Open in Browser',
                            url: webAppUrl
                        }],
                        [{
                            text: '📊 Quick Stats',
                            callback_data: 'quick_stats'
                        }, {
                            text: '🆘 Help',
                            callback_data: 'help'
                        }]
                    ]
                },
                parse_mode: 'Markdown'
            }
        );
    } else {
        // Development mode - show link as text only
        const localUrl = `http://localhost:${process.env.PORT || 3000}`;
        await ctx.reply(
            `🥔 **Welcome to SpudVerse!** 🌱\n\n` +
            `🛠️ **Development Mode**\n\n` +
            `Copy and paste this link in your browser:\n` +
            `\`${localUrl}\`\n\n` +
            `🎮 **How to play:**\n` +
            `• Tap the mega potato to farm SPUD coins\n` +
            `• Complete airdrop missions for rewards\n` +
            `• Compete on leaderboards\n` +
            `• Invite friends for bonuses\n\n` +
            `🚀 **Deploy steps:**\n` +
            `1. Push code to GitHub\n` +
            `2. Deploy on Vercel/Netlify\n` +
            `3. Update WEB_APP_URL in .env\n` +
            `4. Restart bot for Mini App!`,
            {
                parse_mode: 'Markdown'
            }
        );
    }
});

// Command /help
bot.help(async (ctx) => {
    const webAppUrl = process.env.WEB_APP_URL;
    const localUrl = `http://localhost:${process.env.PORT || 3001}`;
    
    if (webAppUrl && webAppUrl.startsWith('https://')) {
        await ctx.reply(
            `🥔 **SPUDVERSE HELP** 🥔\n\n` +
            `🎮 **How to play**: Launch the Mini App and tap potatoes to farm SPUD coins!\n\n` +
            `🎁 **Features**:\n` +
            `• Interactive potato farming with animations\n` +
            `• Epic airdrop missions with big rewards\n` +
            `• Competitive leaderboards\n` +
            `• Invite friends for bonuses\n\n` +
            `🚀 Ready to play? Launch the game below!`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: '🎮 Launch Game',
                            web_app: { url: webAppUrl }
                        }]
                    ]
                },
                parse_mode: 'Markdown'
            }
        );
    } else {
        await ctx.reply(
            `🥔 **SPUDVERSE HELP** 🥔\n\n` +
            `🎮 **How to play**: Open the web app and tap potatoes to farm SPUD coins!\n\n` +
            `🎁 **Features**:\n` +
            `• Interactive potato farming with animations\n` +
            `• Epic airdrop missions with big rewards\n` +
            `• Competitive leaderboards\n` +
            `• Invite friends for bonuses\n\n` +
            `🌐 **Game URL**: \`${localUrl}\`\n\n` +
            `📋 Copy the link above and open in your browser!`,
            {
                parse_mode: 'Markdown'
            }
        );
    }
});

// Simple fallback commands that direct users to the Mini App
bot.command('game', async (ctx) => {
    const localUrl = `http://localhost:${process.env.PORT || 3001}`;
    await ctx.reply(
        `🎮 **SpudVerse Game** 🥔\n\n` +
        `Game URL: \`${localUrl}\`\n\n` +
        `📋 Copy and paste the link above in your browser to play!`,
        {
            parse_mode: 'Markdown'
        }
    );
});

// Handle callback queries
bot.action('quick_stats', async (ctx) => {
    try {
        const user = await db.getUser(ctx.from.id);
        const referralCount = await db.getReferralCount(ctx.from.id);
        
        const statsMsg = `📊 **Quick Stats** 🥔\n\n` +
            `💰 **Balance**: ${user?.balance || 0} SPUD\n` +
            `👥 **Referrals**: ${referralCount}\n` +
            `📅 **Joined**: ${new Date(user?.created_at * 1000 || Date.now()).toLocaleDateString()}\n\n` +
            `🎮 Launch the game for full experience!`;
            
        await ctx.editMessageText(statsMsg, {
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: '🎮 Play Game',
                        web_app: { url: process.env.WEB_APP_URL || 'https://your-app.vercel.app' }
                    }],
                    [{
                        text: '🔙 Back',
                        callback_data: 'back_to_start'
                    }]
                ]
            },
            parse_mode: 'Markdown'
        });
    } catch (error) {
        await ctx.answerCbQuery('Unable to load stats');
    }
});

bot.action('help', async (ctx) => {
    const helpMsg = `🆘 **SpudVerse Help** 🥔\n\n` +
        `🎮 **How to Play:**\n` +
        `• Tap potatoes to earn SPUD coins\n` +
        `• Complete missions for big rewards\n` +
        `• Compete on leaderboards\n` +
        `• Invite friends for bonuses\n\n` +
        `💡 **Tips:**\n` +
        `• Farm regularly to build streak\n` +
        `• Watch for combo multipliers\n` +
        `• Complete all airdrop missions\n\n` +
        `🚀 Launch the game to start!`;
        
    await ctx.editMessageText(helpMsg, {
        reply_markup: {
            inline_keyboard: [
                [{
                    text: '🎮 Play Game',
                    web_app: { url: process.env.WEB_APP_URL || 'https://your-app.vercel.app' }
                }],
                [{
                    text: '🔙 Back',
                    callback_data: 'back_to_start'
                }]
            ]
        },
        parse_mode: 'Markdown'
    });
});

bot.action('back_to_start', async (ctx) => {
    // Re-trigger the start command
    await ctx.deleteMessage();
    const startCtx = { ...ctx, message: { text: '/start' } };
    await bot.start(startCtx);
});

// Handle unknown callback queries
bot.on('callback_query', async (ctx) => {
    const localUrl = `http://localhost:${process.env.PORT || 3000}`;
    await ctx.answerCbQuery('🚀 Game available!');
    await ctx.reply(
        `🎮 **SpudVerse Game** 🥔\n\n` +
        `Game URL: \`${localUrl}\`\n\n` +
        `📋 Copy and open the link above in your browser!`,
        {
            parse_mode: 'Markdown'
        }
    );
});



// Error handling
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    if (ctx && ctx.reply) {
        ctx.reply('❌ An error occurred! Please try again later.');
    }
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Shutting down bot...');
    db.close();
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('🛑 Shutting down bot...');
    db.close();
    bot.stop('SIGTERM');
});

// Start Express server and Bot
const PORT = process.env.PORT || 3000;

// Start Express server
app.listen(PORT, () => {
    console.log(`🌐 SpudVerse server running on port ${PORT}`);
    console.log(`🥔 Mini App available at: http://localhost:${PORT}`);
});

if (process.env.NODE_ENV === 'production') {
    // Webhook mode for production
    const webhookUrl = process.env.WEBHOOK_URL || process.env.WEB_APP_URL || `https://spudverse.vercel.app`;
    bot.launch({
        webhook: {
            domain: webhookUrl,
            port: PORT + 1 // Use different port for webhook
        }
    });
} else {
    // Polling mode for development
    bot.launch();
}

console.log(`🥔 SpudVerse Bot started! ${EMOJIS.potato}${EMOJIS.fire}`);
console.log(`⚙️  Mode: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 Port: ${PORT}`);
