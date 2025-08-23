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
        
        // Auto-complete welcome mission if not already completed
        const welcomeMission = await db.getUserMissionProgress(userId, 1);
        if (!welcomeMission || !welcomeMission.completed) {
            console.log('🎉 Auto-completing welcome mission for user');
            await db.updateUserMission(userId, 1, true, false); // Mission ID 1 = Welcome to SpudVerse
        }
        
        // Auto-complete daily login mission if not already completed
        const dailyLoginMission = await db.getUserMissionProgress(userId, 5);
        if (!dailyLoginMission || !dailyLoginMission.completed) {
            console.log('📅 Auto-completing daily login mission');
            await db.updateUserMission(userId, 5, true, false); // Mission ID 5 = Daily Login
        }
        
        // Check balance missions on user load
        await checkBalanceMissions(userId, user?.balance || 0);
        
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
        console.log('🎯 Tap request - User ID:', userId);
        
        if (!userId) {
            console.log('❌ Tap rejected - No user ID');
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { amount } = req.body;
        const tapAmount = amount || 1;
        console.log('⚡ Tap amount:', tapAmount);
        
        // Get current energy before consumption
        const currentEnergyData = await db.getUserEnergy(userId);
        console.log('🔋 Current energy before tap:', currentEnergyData);
        
        // Check energy before processing tap
        const energyResult = await db.consumeEnergy(userId, tapAmount);
        console.log('🔋 Energy consumption result:', energyResult);
        
        if (!energyResult.success) {
            console.log('❌ Tap rejected - Insufficient energy:', energyResult.error);
            return res.status(400).json({ 
                success: false, 
                error: energyResult.error,
                energyData: energyResult
            });
        }
        
        // Get energy after consumption
        const newEnergyData = await db.getUserEnergy(userId);
        console.log('🔋 Energy after consumption:', newEnergyData);
        
        // Process the tap
        console.log('💰 Updating user balance by:', tapAmount);
        await db.updateUserBalance(userId, tapAmount);
        await db.updateLastTapTime(userId, Date.now());

        // Get updated user stats and check for achievements
        const userStats = await db.getUserStats(userId);
        const newAchievements = await db.checkAndUnlockAchievements(userId, userStats);
        
        // Auto-complete balance-based missions
        await checkBalanceMissions(userId, userStats.balance);

        const responseData = {
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
        };
        
        console.log('✅ Tap success - Response data:', responseData);
        
        res.json({
            success: true,
            data: responseData
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

// Check if user joined Telegram channel
app.post('/api/missions/verify-channel', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { missionId } = req.body;
        
        // For mission ID 2 (Join Telegram Channel)
        if (missionId === 2) {
            console.log(`🔍 Verifying channel membership for user ${userId}`);
            
            // Ensure user exists before creating mission record
            let user = await db.getUser(userId);
            if (!user) {
                console.log(`👤 Creating user ${userId} for channel verification`);
                user = await db.createUser({
                    user_id: userId,
                    username: 'unknown',
                    first_name: 'User',
                    last_name: '',
                    balance: 0
                });
            }
            
            try {
                // Only try API verification if bot is connected
                if (bot.telegram) {
                    // Check if user is member of @spudverseann channel
                    const chatMember = await bot.telegram.getChatMember('@spudverseann', userId);
                    
                    const isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
                    
                    if (isMember) {
                        // Mark mission as completed
                        await db.updateUserMission(userId, 2, true, false);
                        console.log(`✅ User ${userId} verified as channel member via API`);
                        
                        return res.json({ 
                            success: true, 
                            verified: true,
                            message: 'Channel membership verified!' 
                        });
                    } else {
                        console.log(`❌ User ${userId} not found in channel members`);
                        return res.json({ 
                            success: true, 
                            verified: false,
                            message: 'Please join the channel first!' 
                        });
                    }
                } else {
                    throw new Error('Bot not connected');
                }
            } catch (error) {
                console.error('Channel verification error:', error.message);
                console.log(`⚠️  Fallback: Auto-approving channel join for user ${userId}`);
                
                // Fallback: Auto-approve (temporary until API is stable)
                await db.updateUserMission(userId, 2, true, false);
                return res.json({ 
                    success: true, 
                    verified: true,
                    message: 'Channel membership verified!' 
                });
            }
        }
        
        return res.status(400).json({ success: false, error: 'Invalid mission ID' });
    } catch (error) {
        console.error('Verify channel error:', error);
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

// Helper function to check and complete balance-based missions
async function checkBalanceMissions(userId, currentBalance) {
    try {
        console.log(`💰 Checking balance missions for user ${userId}, balance: ${currentBalance}`);
        
        // Mission ID 6: Reach 1K SPUD (1000 SPUD)
        if (currentBalance >= 1000) {
            const mission6Progress = await db.getUserMissionProgress(userId, 6);
            if (!mission6Progress || !mission6Progress.completed) {
                console.log(`🎯 Auto-completing "Reach 1K SPUD" mission for user ${userId}`);
                await db.updateUserMission(userId, 6, true, false);
            }
        }
        
        // Add more balance milestones here if needed
        // Example: 5K SPUD, 10K SPUD missions
        
    } catch (error) {
        console.error('Error checking balance missions:', error);
    }
}

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
    
    // Fallback for development - use query param or reject if no real user
    const fallback = req.query.userId || req.body.userId;
    if (fallback) {
        console.log('🔄 Using fallback user_id from query/body:', fallback);
        return parseInt(fallback);
    }
    
    console.log('❌ No valid user ID found');
    return null;
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
            `🎮 **Tap "Play" to start farming SPUD coins!**\n\n` +
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
            `Ready to become a potato farming legend?\n\n` +
            `🎮 **Tap "Play" to start farming SPUD coins!**\n\n` +
            `🎁 **Features:**\n` +
            `• Interactive potato farming\n` +
            `• Epic airdrop missions\n` +
            `• Leaderboard competition\n` +
            `• Friend referral bonuses\n\n` +
            `🚀 **Start your farming empire now!**`,
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

// Start bot with better error handling
const startBot = async () => {
    try {
        if (process.env.NODE_ENV === 'production') {
            // Production mode - Try webhooks first, fallback to polling
            const webhookUrl = process.env.WEBHOOK_URL || process.env.WEB_APP_URL || `https://spudverse.vercel.app`;
            try {
                await bot.launch({
                    webhook: {
                        domain: webhookUrl,
                        port: PORT + 1 // Use different port for webhook
                    }
                });
                console.log('🔗 Bot started with webhooks');
            } catch (webhookError) {
                console.warn('⚠️  Webhook failed, falling back to polling:', webhookError.message);
                await bot.launch();
                console.log('📡 Bot started with polling');
            }
        } else {
            // Development mode - Use polling
            await bot.launch();
            console.log('📡 Bot started with polling (development)');
        }
    } catch (error) {
        console.error('❌ Bot launch failed:', error.message);
        console.log('⚠️  Continuing without bot (API-only mode)');
    }
};

// Don't block the server if bot fails
startBot().catch(err => {
    console.error('❌ Critical bot error:', err.message);
    console.log('🔄 Server will continue running for Mini App');
});

console.log(`🥔 SpudVerse Bot started! ${EMOJIS.potato}${EMOJIS.fire}`);
console.log(`⚙️  Mode: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 Port: ${PORT}`);
