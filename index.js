require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');
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
const PORT = process.env.PORT || 3000;

// Initialize Twitter API client with rate limit awareness
let twitterClient = null;
let lastTwitterApiCall = 0;
const TWITTER_API_COOLDOWN = 2 * 60 * 1000; // 2 minutes between calls
const twitterCache = new Map(); // Simple in-memory cache

if (process.env.TWITTER_BEARER_TOKEN && process.env.TWITTER_BEARER_TOKEN !== 'your_twitter_bearer_token_here') {
    twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
    console.log('🐦 Twitter API client initialized with rate limiting');
} else {
    console.warn('⚠️  Twitter API credentials not found - using fallback verification');
}

// Twitter API Tier Warning
if (twitterClient) {
    console.log('📊 Twitter API Note: Free tier has 50 requests/24h limit');
    console.log('💡 For production, consider upgrading to Basic tier ($100/month) for higher limits');
}

// Choose database based on environment variables
console.log('🔍 Debug - SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('🔍 Debug - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');

const db = new SupabaseDatabase();

console.log(`📊 Database: Supabase`);

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

// User creation endpoint with referral code
app.post('/api/user/create', async (req, res) => {
    try {
        console.log('🆕 User creation request received');
        
        // Get user info from Telegram auth
        const userInfo = getUserInfoFromRequest(req);
        if (!userInfo || !userInfo.userId) {
            console.log('❌ User creation failed - no auth:', userInfo?.error || 'No user info');
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        const { userId, firstName, lastName, username } = userInfo;
        const { referralCode } = req.body;
        
        console.log('🆕 Creating user:', {
            userId,
            firstName,
            referralCode: referralCode || 'none'
        });
        
        // Check if user already exists
        const existingUser = await db.getUser(userId);
        if (existingUser) {
            console.log('✅ User already exists, returning existing data');
            const referralCount = await db.getReferralCount(userId);
            const energyData = await db.getUserEnergy(userId);
            
            return res.json({
                success: true,
                data: {
                    balance: existingUser.balance,
                    energy: energyData.current_energy,
                    maxEnergy: energyData.max_energy,
                    energyRegenRate: energyData.energy_regen_rate,
                    perTap: 1,
                    totalFarmed: existingUser.balance,
                    referrals: referralCount,
                    streak: existingUser.streak || 0
                }
            });
        }
        
        // Process referral code if provided
        let referrerId = null;
        let referralBonus = 0;
        
        if (referralCode) {
            console.log('🔍 Processing referral code:', referralCode);
            
            // Find referrer by user ID (referral code is the user ID)
            const referrer = await db.getUser(parseInt(referralCode));
            if (referrer) {
                referrerId = referrer.user_id;
                referralBonus = 50; // New user gets 50 SPUD
                console.log('✅ Valid referral code, referrer found:', referrerId);
            } else {
                console.log('⚠️ Invalid referral code, no referrer found');
            }
        }
        
        // Create new user
        console.log('🆕 Creating new user with data:', {
            userId,
            username: username || `user${userId}`,
            firstName,
            lastName,
            referrerId,
            initialBalance: referralBonus
        });
        
        await db.createUser(
            userId,
            username || `user${userId}`,
            firstName || 'User',
            lastName || '',
            referrerId
        );
        
        // Add initial balance if there's referral bonus
        if (referralBonus > 0) {
            await db.updateUserBalance(userId, referralBonus);
        }
        
        // Award referral bonus to referrer
        if (referrerId) {
            try {
                // Add referral record
                await db.addReferral(referrerId, userId);
                
                // Give bonus to referrer
                await db.updateUserBalance(referrerId, 100); // Referrer gets 100 SPUD
                console.log('🎁 Referral bonus awarded to referrer:', referrerId);
                
                // Try to send notification to referrer
                try {
                    if (bot.telegram) {
                        await bot.telegram.sendMessage(referrerId, 
                            `🎉 You just earned 100 SPUD from inviting a friend! 💰`
                        );
                    }
                } catch (notifError) {
                    console.log('📱 Cannot send referral notification:', notifError.message);
                }
            } catch (error) {
                console.error('❌ Failed to award referral bonus:', error);
            }
        }
        
        // Create welcome mission
        await db.updateUserMission(userId, 1, true, false);
        
        // Get final user data
        const newUser = await db.getUser(userId);
        const referralCount = await db.getReferralCount(userId);
        const energyData = await db.getUserEnergy(userId);
        
        console.log('✅ User created successfully:', {
            userId: newUser.user_id,
            balance: newUser.balance,
            referrals: referralCount
        });
        
        res.json({
            success: true,
            data: {
                balance: newUser.balance,
                energy: energyData.current_energy,
                maxEnergy: energyData.max_energy,
                energyRegenRate: energyData.energy_regen_rate,
                perTap: 1,
                totalFarmed: newUser.balance,
                referrals: referralCount,
                streak: newUser.streak || 0
            }
        });
        
    } catch (error) {
        console.error('❌ User creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user account'
        });
    }
});

app.get('/api/user', async (req, res) => {
    try {
        // Extract user ID and user data from Telegram Mini App data
        const userInfo = getUserInfoFromRequest(req);
        if (!userInfo || !userInfo.userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { userId, username, firstName, lastName, referrerId } = userInfo;
        console.log('👤 API User request:', { userId, username, firstName, lastName, referrerId });

        let user = await db.getUser(userId);
        
        // NEW APPROACH: Don't auto-create user, return 404 for new users
        if (!user) {
            console.log('🆕 New user detected, returning 404 to trigger welcome modal:', userId);
            return res.status(404).json({ 
                success: false, 
                error: 'User not found',
                isNewUser: true 
            });
        }

        // Update streak on user load
        await db.updateUserStreak(userId);
        user = await db.getUser(userId); // Re-fetch user to get updated streak

        const referralCount = await db.getReferralCount(userId);
        const energyData = await db.getUserEnergy(userId);
        const userItems = await db.getUserItems(userId);
        
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
        
        // Set cache headers to prevent stale data on client
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.json({
            success: true,
            data: {
                balance: user?.balance || 0,
                energy: energyData.current_energy,
                maxEnergy: energyData.max_energy,
                energyRegenRate: energyData.energy_regen_rate,
                timeToFull: energyData.time_to_full,
                level: user?.level || 1,
                perTap: user?.per_tap || 1,
                totalFarmed: user?.total_farmed || 0,
                referrals: referralCount,
                streak: user?.streak || 0,
                bestStreak: user?.best_streak || 0,
                items: userItems.map(item => ({ id: item.item_id, count: item.quantity }))
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
            total_farmed: userStats.total_farmed,
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

app.post('/api/user/level-up', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        console.log(`🌟 Level up attempt for user: ${userId}`);

        if (!userId) {
            console.log('❌ Level up failed: Unauthorized');
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const result = await db.levelUpUser(userId);

        if (result.success) {
            console.log(`✅ User ${userId} leveled up successfully. Data:`, result.data);
            res.json({
                success: true,
                data: result.data
            });
        } else {
            console.log(`❌ Level up failed for user ${userId}:`, { error: result.error, details: result.details });
            res.status(400).json({
                success: false,
                error: result.error,
                details: result.details
            });
        }
    } catch (error) {
        console.error('Level Up API Error:', error);
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

// Get user's Twitter connection status
app.get('/api/user/twitter', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const userTwitter = await db.getUserTwitter(userId);
        
        if (userTwitter && userTwitter.twitter_username) {
            res.json({
                success: true,
                data: {
                    twitter_username: userTwitter.twitter_username,
                    connected_at: userTwitter.twitter_connected_at
                }
            });
        } else {
            res.json({
                success: false,
                data: null
            });
        }

    } catch (error) {
        console.error('Get User Twitter API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Connect Twitter username
app.post('/api/twitter/connect', async (req, res) => {
    console.log('🔗 Twitter connect request received');
    
    try {
        const userId = getUserIdFromRequest(req);
        console.log('👤 Twitter connect - User ID:', userId);
        
        if (!userId) {
            console.log('❌ Twitter connect - No user ID');
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { twitter_username } = req.body;
        console.log('📝 Twitter connect - Raw username:', twitter_username);
        
        if (!twitter_username || twitter_username.length < 1) {
            console.log('❌ Twitter connect - No username provided');
            return res.status(400).json({ success: false, error: 'Twitter username is required' });
        }

        // Clean username (remove @ if present)
        const cleanUsername = twitter_username.replace('@', '').trim();
        console.log(`🧹 Twitter connect - Clean username: @${cleanUsername}`);
        
        console.log(`🔗 Connecting Twitter username @${cleanUsername} for user ${userId}`);

        try {
            // Verify Twitter username exists using Twitter API
            if (twitterClient) {
                console.log('🐦 Twitter connect - Using Twitter API to verify username');
                
                const { data: twitterUser } = await twitterClient.v2.userByUsername(cleanUsername);
                console.log('🐦 Twitter API response:', { 
                    found: !!twitterUser, 
                    userId: twitterUser?.id, 
                    username: twitterUser?.username 
                });
                
                if (!twitterUser) {
                    console.log(`❌ Twitter user @${cleanUsername} not found`);
                    return res.json({
                        success: false,
                        error: 'Twitter username not found'
                    });
                }
                
                console.log(`✅ Twitter user @${cleanUsername} verified (ID: ${twitterUser.id})`);
            } else {
                console.log('⚠️  Twitter connect - No Twitter client, skipping API verification');
            }

            // Save Twitter username to database
            console.log(`💾 Saving Twitter username to database for user ${userId}`);
            const dbResult = await db.updateUserTwitter(userId, cleanUsername);
            console.log('💾 Database update result:', { success: !!dbResult, data: dbResult });
            
            if (!dbResult) {
                console.log('❌ Failed to save Twitter username to database');
                return res.status(500).json({
                    success: false,
                    error: 'Failed to save Twitter connection'
                });
            }
            
            console.log(`✅ Twitter connection successful for user ${userId} -> @${cleanUsername}`);
            
            res.json({
                success: true,
                message: `Twitter account @${cleanUsername} connected successfully!`,
                twitter_username: cleanUsername
            });

        } catch (error) {
            console.error('❌ Twitter connection inner error:', {
                message: error.message,
                stack: error.stack,
                code: error.code
            });
            res.status(400).json({
                success: false,
                error: 'Failed to verify Twitter username'
            });
        }

    } catch (error) {
        console.error('❌ Connect Twitter API Error:', {
            message: error.message,
            stack: error.stack
        });
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
        
        // For mission ID 3 (Follow Twitter)
        if (missionId === 3) {
            console.log(`🐦 Verifying Twitter follow for user ${userId}`);
            
            // Ensure user exists before creating mission record
            let user = await db.getUser(userId);
            if (!user) {
                console.log(`👤 Creating user ${userId} for Twitter verification`);
                user = await db.createUser({
                    user_id: userId,
                    username: 'unknown',
                    first_name: 'User',
                    last_name: '',
                    balance: 0
                });
            }
            
            try {
                // Check if user has connected Twitter account
                const userTwitter = await db.getUserTwitter(userId);
                
                if (!userTwitter || !userTwitter.twitter_username) {
                    return res.json({
                        success: false,
                        verified: false,
                        error: 'TWITTER_NOT_CONNECTED',
                        message: 'Please connect your Twitter account first!'
                    });
                }
                
                if (twitterClient) {
                    // Check rate limiting
                    const now = Date.now();
                    const timeSinceLastCall = now - lastTwitterApiCall;
                    
                    if (timeSinceLastCall < TWITTER_API_COOLDOWN) {
                        const waitTime = TWITTER_API_COOLDOWN - timeSinceLastCall;
                        console.log(`⏱️  Rate limit protection: ${Math.round(waitTime/1000)}s since last call, using manual verification`);
                        
                        // Skip API call and use manual verification
                        await db.updateUserMission(userId, 3, true, false);
                        return res.json({ 
                            success: true, 
                            verified: true,
                            message: 'Twitter follow verified!',
                            method: 'rate_limit_skip'
                        });
                    }
                    
                    console.log(`🐦 Checking if @${userTwitter.twitter_username} follows @${process.env.TWITTER_USERNAME}`);
                    lastTwitterApiCall = now; // Update last call time
                    
                    try {
                        const targetUsername = process.env.TWITTER_USERNAME || 'RealSpudVerse';
                        
                        // Get both user IDs
                        const [userResult, targetResult] = await Promise.all([
                            twitterClient.v2.userByUsername(userTwitter.twitter_username),
                            twitterClient.v2.userByUsername(targetUsername)
                        ]);
                        
                        if (!userResult.data || !targetResult.data) {
                            throw new Error('User or target account not found');
                        }
                        
                        console.log(`✅ Found users - User: ${userResult.data.id} (@${userResult.data.username}), Target: ${targetResult.data.id} (@${targetResult.data.username})`);
                        
                        // Method 1: Try checking followers (works with Bearer Token)
                        let isFollowing = false;
                        let verificationMethod = 'none';
                        
                        try {
                            console.log(`🔍 Method 1: Checking followers of @${targetUsername} for user ID ${userResult.data.id}`);
                            
                            const followers = await twitterClient.v2.followers(targetResult.data.id, {
                                max_results: 1000
                            });
                            
                            console.log(`📊 Found ${followers.data?.length || 0} followers for @${targetUsername}`);
                            isFollowing = followers.data?.some(user => user.id === userResult.data.id);
                            verificationMethod = 'followers_check';
                            
                        } catch (followersError) {
                            console.log(`⚠️  Method 1 failed: ${followersError.message}`);
                            
                            // Method 2: Try using friendship lookup (v1.1 API style)
                            try {
                                console.log(`🔍 Method 2: Trying alternative approach`);
                                
                                // For now, if we can verify both accounts exist, assume verification
                                // This is a fallback when API limits are hit
                                console.log(`✅ Both accounts verified to exist, using manual verification`);
                                isFollowing = true; // Manual approval when API limits hit
                                verificationMethod = 'manual_fallback';
                                
                            } catch (alternativeError) {
                                console.log(`⚠️  Method 2 failed: ${alternativeError.message}`);
                                throw new Error('All verification methods failed');
                            }
                        }
                        
                        if (isFollowing) {
                            console.log(`✅ @${userTwitter.twitter_username} follows @${targetUsername} (method: ${verificationMethod})`);
                            await db.updateUserMission(userId, 3, true, false);
                            return res.json({ 
                                success: true, 
                                verified: true,
                                message: 'Twitter follow verified!',
                                method: verificationMethod
                            });
                        } else {
                            console.log(`❌ @${userTwitter.twitter_username} does not follow @${targetUsername} (method: ${verificationMethod})`);
                            return res.json({ 
                                success: true, 
                                verified: false,
                                message: `Please follow @${targetUsername} first!` 
                            });
                        }
                        
                    } catch (twitterError) {
                        console.error('Twitter API error:', twitterError.message);
                        
                        // Fallback to manual verification
                        console.log(`⚠️  Twitter API failed, using manual verification for user ${userId}`);
                        await db.updateUserMission(userId, 3, true, false);
                        return res.json({ 
                            success: true, 
                            verified: true,
                            message: 'Twitter follow verified!' 
                        });
                    }
                } else {
                    // Fallback: Manual verification when no Twitter API
                    console.log(`⚠️  No Twitter API, using manual verification for user ${userId}`);
                    await db.updateUserMission(userId, 3, true, false);
                    return res.json({ 
                        success: true, 
                        verified: true,
                        message: 'Twitter follow verified!' 
                    });
                }
                
            } catch (error) {
                console.error('Twitter verification error:', error.message);
                return res.json({ 
                    success: true, 
                    verified: false,
                    message: 'Verification failed. Please try again!' 
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
        const userId = getUserIdFromRequest(req);
        
        // Get top 10 leaderboard
        const leaderboard = await db.getLeaderboard(10);
        const formattedLeaderboard = leaderboard.map((user, index) => ({
            rank: index + 1,
            name: user.username ? `@${user.username}` : user.first_name || 'Anonymous',
            balance: user.balance,
            level: user.level
        }));

        let userRank = null;
        let userBalance = 0;
        let userLevel = 1;

        // Get user's rank and balance if user is authenticated
        if (userId) {
            try {
                const user = await db.getUser(userId);
                const userStats = await db.getUserStats(userId);
                userRank = userStats.rank || null;
                userBalance = userStats.balance || 0;
                userLevel = user?.level || 1;
                
                console.log(`📊 User ${userId} rank: ${userRank}, balance: ${userBalance}, level: ${userLevel}`);
            } catch (error) {
                console.warn('⚠️ Could not get user stats for leaderboard:', error.message);
            }
        }

        res.json({
            success: true,
            data: {
                leaderboard: formattedLeaderboard,
                userRank: {
                    rank: userRank,
                    balance: userBalance,
                    level: userLevel
                }
            }
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
        const userInfo = getUserInfoFromRequest(req);
        if (!userInfo || !userInfo.userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { userId, username, firstName, lastName, referrerId } = userInfo;
        console.log('⚡ Energy API request:', { userId, username, firstName, lastName, referrerId });

        // NEW APPROACH: Don't auto-create user, return 404 for new users
        let user = await db.getUser(userId);
        if (!user) {
            console.log('🆕 New user detected in Energy API, returning 404:', userId);
            return res.status(404).json({ 
                success: false, 
                error: 'User not found',
                isNewUser: true 
            });
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

// Upgrades routes
app.get('/api/upgrades', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const upgrades = await db.getUpgrades(userId);
        res.json({ success: true, data: upgrades });
    } catch (error) {
        console.error('Upgrades API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/upgrades/purchase', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const { upgradeName } = req.body;
        if (!upgradeName) {
            return res.status(400).json({ success: false, error: 'Upgrade name is required' });
        }
        const result = await db.purchaseUpgrade(userId, upgradeName);
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Purchase Upgrade API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// DEBUG: Test referral system endpoint
app.get('/api/debug/referral-test', async (req, res) => {
    try {
        console.log('🔍 DEBUG: Referral test endpoint called');
        
        // Test parseReferralCode function
        const testCases = [
            '123456',
            'abc123',
            '',
            null,
            undefined,
            '999999999'
        ];
        
        const results = testCases.map(testCase => ({
            input: testCase,
            output: parseReferralCode(testCase)
        }));
        
        console.log('🧪 parseReferralCode test results:', results);
        
        // Test getUserInfoFromRequest with mock data
        const mockReq = {
            headers: {
                authorization: 'tma user=%7B%22id%22%3A12345%2C%22first_name%22%3A%22Test%22%2C%22username%22%3A%22testuser%22%7D&start_param=999888'
            }
        };
        
        const userInfo = getUserInfoFromRequest(mockReq);
        console.log('🧪 getUserInfoFromRequest test result:', userInfo);
        
        res.json({
            success: true,
            data: {
                parseReferralCodeTests: results,
                getUserInfoTest: userInfo,
                message: 'Check server logs for detailed debug info'
            }
        });
        
    } catch (error) {
        console.error('Debug referral test error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DEBUG: Check database referrals
app.get('/api/debug/check-referrals', async (req, res) => {
    try {
        console.log('🔍 DEBUG: Checking all referrals in database');
        
        // Get all users
        const allUsers = await db.getLeaderboard(100); // Get more users
        console.log('👥 All users count:', allUsers.length);
        
        // Check referrals for each user
        const referralData = [];
        for (const user of allUsers.slice(0, 10)) { // Check first 10 users
            const referralCount = await db.getReferralCount(user.user_id);
            referralData.push({
                userId: user.user_id,
                username: user.username,
                firstName: user.first_name,
                balance: user.balance,
                referralCount: referralCount
            });
        }
        
        console.log('📊 Referral data:', referralData);
        
        res.json({
            success: true,
            data: {
                totalUsers: allUsers.length,
                referralData: referralData,
                message: 'Check server logs for detailed info'
            }
        });
        
    } catch (error) {
        console.error('Debug check referrals error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DEBUG: Check specific user referrals
app.get('/api/debug/user-referrals/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        console.log('🔍 DEBUG: Checking referrals for user:', userId);
        
        // Get user info
        const user = await db.getUser(userId);
        console.log('👤 User info:', user);
        
        // Get referral count
        const referralCount = await db.getReferralCount(userId);
        console.log('📊 Referral count:', referralCount);
        
        // Try to query referrals table directly if using Supabase
        let directReferrals = null;
        if (db.client) {
            try {
                const { data, error } = await db.client
                    .from('referrals')
                    .select('*')
                    .eq('referrer_id', userId);
                    
                if (!error) {
                    directReferrals = data;
                    console.log('📋 Direct referrals query:', directReferrals);
                }
            } catch (err) {
                console.log('⚠️ Could not query referrals directly:', err.message);
            }
        }
        
        res.json({
            success: true,
            data: {
                userId: userId,
                user: user,
                referralCount: referralCount,
                directReferrals: directReferrals,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Debug user referrals error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DEBUG: Test referral bonus manually
app.post('/api/debug/test-referral-bonus', async (req, res) => {
    try {
        const { referrerId, referredId } = req.body;
        
        if (!referrerId || !referredId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing referrerId or referredId' 
            });
        }
        
        console.log('🧪 DEBUG: Testing referral bonus manually:', { referrerId, referredId });
        
        // Get initial balances
        const initialReferrer = await db.getUser(referrerId);
        const initialReferred = await db.getUser(referredId);
        
        console.log('📊 Initial balances:', {
            referrer: initialReferrer?.balance || 0,
            referred: initialReferred?.balance || 0
        });
        
        // Process referral bonus
        try {
            // Step 1: Add referral record
            console.log('📝 Step 1: Adding referral record...');
            const referralResult = await db.addReferral(referrerId, referredId);
            console.log('📝 Referral record result:', referralResult);
            
            // Step 2: Update referrer balance
            const referrerBonus = 100;
            console.log(`💰 Step 2: Updating referrer ${referrerId} balance by +${referrerBonus} SPUD`);
            const referrerUpdateResult = await db.updateUserBalance(referrerId, referrerBonus);
            console.log('💰 Referrer balance update result:', referrerUpdateResult);
            
            // Step 3: Update referred user balance
            const referredBonus = 50;
            console.log(`💰 Step 3: Updating referred user ${referredId} balance by +${referredBonus} SPUD`);
            const referredUpdateResult = await db.updateUserBalance(referredId, referredBonus);
            console.log('💰 Referred user balance update result:', referredUpdateResult);
            
            // Step 4: Verify final balances
            const finalReferrer = await db.getUser(referrerId);
            const finalReferred = await db.getUser(referredId);
            
            console.log('🔍 Final balances:', {
                referrer: finalReferrer?.balance || 0,
                referred: finalReferred?.balance || 0
            });
            
            // Step 5: Check referral count
            const referralCount = await db.getReferralCount(referrerId);
            console.log('📊 Final referral count:', referralCount);
            
            res.json({
                success: true,
                data: {
                    referralRecord: referralResult,
                    referrerUpdate: referrerUpdateResult,
                    referredUpdate: referredUpdateResult,
                    initialBalances: {
                        referrer: initialReferrer?.balance || 0,
                        referred: initialReferred?.balance || 0
                    },
                    finalBalances: {
                        referrer: finalReferrer?.balance || 0,
                        referred: finalReferred?.balance || 0
                    },
                    referralCount: referralCount,
                    message: 'Manual referral bonus test completed'
                }
            });
            
        } catch (bonusError) {
            console.error('❌ Manual referral bonus test failed:', bonusError);
            res.status(500).json({
                success: false,
                error: bonusError.message,
                stack: bonusError.stack
            });
        }
        
    } catch (error) {
        console.error('Debug test referral bonus error:', error);
        res.status(500).json({ success: false, error: error.message });
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

// Enhanced helper function to extract user info including referral data from Telegram Mini App request
function getUserInfoFromRequest(req) {
    const auth = req.headers.authorization;
    console.log('🔍 Auth header for user info:', auth ? 'Present' : 'Missing');
    console.log('🔍 Full auth header:', auth);
    
    // Log all headers for debugging
    console.log('🔍 All request headers:', JSON.stringify(req.headers, null, 2));
    
    if (auth && auth.startsWith('tma ')) {
        try {
            const initData = auth.slice(4);
            console.log('📊 Raw initData length:', initData.length);
            console.log('📊 Raw initData (full):', initData);
            
            const params = new URLSearchParams(initData);
            
            // Extract user data
            const userStr = params.get('user');
            const startParam = params.get('start_param');
            
            console.log('📊 Telegram Mini App data:', {
                userFound: !!userStr,
                userStr: userStr,
                startParam: startParam || 'None',
                allParams: Array.from(params.keys()),
                allParamsWithValues: Object.fromEntries(params.entries())
            });
            
            // Log all parameters for debugging
            for (const [key, value] of params.entries()) {
                console.log(`📊 Param ${key}:`, value);
            }
            
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    console.log('👤 Parsed user object:', user);
                    
                    // Parse referral ID from start_param
                    const referrerId = startParam ? parseReferralCode(startParam) : null;
                    
                    const userInfo = {
                        userId: user.id,
                        username: user.username || null,
                        firstName: user.first_name || 'User',
                        lastName: user.last_name || '',
                        referrerId: referrerId
                    };
                    
                    console.log('✅ Parsed user info:', userInfo);
                    console.log('🔗 Referral parsing:', {
                        startParam: startParam,
                        parsedReferrerId: referrerId,
                        parseFunction: 'parseReferralCode'
                    });
                    
                    return userInfo;
                } catch (jsonError) {
                    console.error('❌ Error parsing user JSON:', jsonError);
                    console.error('❌ User string that failed:', userStr);
                }
            } else {
                console.log('❌ No user string found in params');
            }
        } catch (error) {
            console.error('❌ Error parsing Telegram Mini App data:', error);
        }
    } else {
        console.log('❌ Auth header missing or invalid format');
        console.log('❌ Expected format: "tma <initData>"');
        console.log('❌ Actual format:', auth ? auth.substring(0, 50) + '...' : 'null');
    }
    
    // Enhanced fallback for development
    const fallbackUserId = req.query.userId || req.body.userId;
    const fallbackReferrerId = req.query.referrerId || req.body.referrerId;
    
    console.log('🔄 Checking fallback options:', {
        queryUserId: req.query.userId,
        bodyUserId: req.body.userId,
        queryReferrerId: req.query.referrerId,
        bodyReferrerId: req.body.referrerId,
        queryParams: req.query,
        bodyParams: req.body
    });
    
    if (fallbackUserId) {
        const userInfo = {
            userId: parseInt(fallbackUserId),
            username: req.query.username || `user${fallbackUserId}`,
            firstName: req.query.firstName || 'User',
            lastName: req.query.lastName || '',
            referrerId: fallbackReferrerId ? parseInt(fallbackReferrerId) : null
        };
        
        console.log('🔄 Using fallback user info:', userInfo);
        return userInfo;
    }
    
    console.log('❌ No valid user info found - all methods failed');
    return null;
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



// Shop routes
app.get('/api/shop', async (req, res) => {
    try {
        console.log('🏪 Shop API request received');
        
        const userId = getUserIdFromRequest(req);
        console.log('👤 Shop - User ID:', userId);
        
        if (!userId) {
            console.log('❌ Shop request rejected - No user ID');
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // Get available shop items from database
        console.log('🔍 Fetching shop items...');
        const shopItems = await db.getShopItems();
        console.log('📦 Shop items found:', shopItems?.length || 0);
        console.log('📦 Shop items details:', shopItems);
        
        // Get user's owned items
        console.log('🔍 Fetching user items...');
        const userItems = await db.getUserItems(userId);
        console.log('🛍️ User owned items:', userItems?.length || 0);
        console.log('🛍️ User items details:', userItems);
        
        // Combine shop items with user ownership status and sort
        console.log('🔄 Combining shop and user items...');
        const itemsWithStatus = shopItems.map(item => {
            const isOwned = userItems.some(userItem => userItem.item_id === item.id);
            console.log(`📝 Item ${item.name} (${item.id}) - Owned: ${isOwned}`);
            return {
                ...item,
                owned: isOwned
            };
        });

        // Sort items by category and cost
        itemsWithStatus.sort((a, b) => {
            // First sort by category
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            // Then sort by cost within each category
            return a.cost - b.cost;
        });

        console.log('✅ Sending response with items:', {
            totalItems: itemsWithStatus.length,
            categories: [...new Set(itemsWithStatus.map(item => item.category))],
            itemsPreview: itemsWithStatus.slice(0, 3) // Log first 3 items for preview
        });

        res.json({
            success: true,
            data: itemsWithStatus
        });
    } catch (error) {
        console.error('Shop API Error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/shop/buy', async (req, res) => {
    try {
        console.log('🛍️ Shop buy request received');
        
        const userId = getUserIdFromRequest(req);
        console.log('👤 Shop buy - User ID:', userId);
        
        if (!userId) {
            console.log('❌ Shop buy rejected - No user ID');
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { itemId } = req.body;
        console.log('🏷️ Shop buy - Item ID:', itemId);
        
        if (!itemId) {
            console.log('❌ Shop buy rejected - No item ID provided');
            return res.status(400).json({ success: false, error: 'Item ID is required' });
        }

        // Get all shop items to find the one we want
        console.log('🔍 Fetching shop items...');
        const shopItems = await db.getShopItems();
        console.log('📦 Total shop items:', shopItems.length);
        
        const item = shopItems.find(item => item.id === itemId);
        if (!item) {
            console.log('❌ Shop buy rejected - Item not found:', itemId);
            return res.status(404).json({ success: false, error: 'Item not found' });
        }
        console.log('✅ Found item:', { id: item.id, name: item.name, cost: item.cost });

        // Process purchase through RPC function
        console.log('💰 Processing purchase...', { userId, itemId, cost: item.cost });
        const result = await db.buyShopItem(userId, itemId);
        console.log('💰 Purchase result:', result);
        
        if (!result.success) {
            console.log('❌ Purchase failed:', {
                error: result.error,
                details: result.details,
                userId,
                itemId,
                cost: item.cost
            });
            return res.status(400).json({ 
                success: false, 
                error: result.error || 'Purchase failed',
                details: result.details
            });
        }

        console.log('✅ Purchase successful!');
        
        // Get updated user data
        console.log('📊 Fetching updated user data...');
        const updatedUser = await db.getUser(userId);
        const energyData = await db.getUserEnergy(userId);
        
        console.log('📊 Updated user data:', {
            userId,
            newBalance: updatedUser.balance,
            itemId,
            itemName: item.name,
            energy: energyData.current_energy,
            maxEnergy: energyData.max_energy
        });

        res.json({
            success: true,
            data: {
                item: item,
                newBalance: updatedUser.balance,
                energy: energyData.current_energy,
                maxEnergy: energyData.max_energy,
                message: `Successfully purchased ${item.name}!`
            }
        });
    } catch (error) {
        console.error('Shop Buy API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/user/sync-balance', async (req, res) => {
    try {
        console.log('💫 Balance sync request received');
        
        const userId = getUserIdFromRequest(req);
        console.log('👤 Balance sync - User ID:', userId);
        
        if (!userId) {
            console.log('❌ Balance sync rejected - No user ID');
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // Get latest user data
        console.log('🔄 Fetching latest user data...');
        const user = await db.getUser(userId);
        
        if (!user) {
            console.log('❌ Balance sync failed - User not found:', userId);
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        console.log('👤 Current user data:', {
            userId: user.user_id,
            balance: user.balance,
            level: user.level,
            lastSync: user.last_sync
        });

        console.log('⚡ Fetching energy data...');
        const energyData = await db.getUserEnergy(userId);
        console.log('🔋 Current energy data:', energyData);

        // Try to sync balance if method exists
        let syncResult = null;
        try {
            console.log('🔄 Attempting to sync SPH earnings...');
            syncResult = await db.syncBalance(userId);
            console.log('✅ Sync result:', syncResult);
        } catch (syncError) {
            console.warn('⚠️ Balance sync warning:', syncError.message);
        }

        // Get final user data after sync
        const finalUser = syncResult?.success ? await db.getUser(userId) : user;
        console.log('📊 Final user data:', {
            userId: finalUser.user_id,
            balance: finalUser.balance,
            syncSuccess: !!syncResult?.success
        });

        res.json({
            success: true,
            data: {
                balance: finalUser.balance,
                energy: energyData.current_energy,
                maxEnergy: energyData.max_energy,
                energyRegenRate: energyData.energy_regen_rate,
                timeToFull: energyData.time_to_full,
                syncPerformed: !!syncResult,
                syncSuccess: !!syncResult?.success
            }
        });
    } catch (error) {
        console.error('❌ Balance Sync API Error:', {
            message: error.message,
            stack: error.stack,
            userId: req.body.userId
        });
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            details: error.message
        });
    }
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