const express = require('express');
const serverless = require('serverless-http');
const path = require('path');
const SupabaseDatabase = require('../../database/supabase');

const app = express();

// Initialize database
const db = new SupabaseDatabase();

// Middleware
app.use(express.json());

// CORS middleware
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

// Helper function to extract user ID
function getUserIdFromRequest(req) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('tma ')) {
        try {
            const initData = auth.slice(4);
            const params = new URLSearchParams(initData);
            const userStr = params.get('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                return user.id;
            }
        } catch (error) {
            console.error('Error parsing Telegram data:', error);
        }
    }
    return req.query.userId || req.body.userId || 12345;
}

// API Routes
app.get('/api/user', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        let userData = await db.getUser(userId);
        
        if (!userData) {
            // If user doesn't exist, let's try to create them.
            const auth = req.headers.authorization;
            if (auth && auth.startsWith('tma ')) {
                const initData = auth.slice(4);
                const params = new URLSearchParams(initData);
                const userStr = params.get('user');
                if (userStr) {
                    const user = JSON.parse(userStr);
                    const newUser = await db.createUser(user.id, user.username, user.first_name, user.last_name);
                    if (newUser) {
                        // Fetch the newly created user data
                        userData = await db.getUser(user.id);
                    }
                }
            }
        }

        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found and could not be created.' });
        }

        res.json({
            success: true,
            data: userData
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
        await db.updateUserBalance(userId, tapAmount);
        await db.updateTotalFarmed(userId, tapAmount);
        await db.updateLastTapTime(userId, Date.now());

        const user = await db.getUser(userId);
        res.json({
            success: true,
            data: {
                newBalance: user?.balance || 0,
                totalFarmed: user?.total_farmed || 0,
                earned: tapAmount
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
            return res.status(400).json({ success: false, error: 'Cannot claim this mission' });
        }

        await db.updateUserBalance(userId, mission.reward);
        await db.updateUserMission(userId, missionId, true, true);

        res.json({
            success: true,
            data: {
                reward: mission.reward,
                message: `You earned ${mission.reward} SPUD!`
            }
        });
    } catch (error) {
        console.error('Claim API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/user/level-up', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { newLevel } = req.body;

        const result = await db.levelUpUser(userId, newLevel);

        if (result.success) {
            res.json({
                success: true,
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Level Up API Error:', error);
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
            level: user.level
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

// Shop routes
app.get('/api/shop', async (req, res) => {
    try {
        const items = await db.getShopItems();
        res.json({ success: true, data: items });
    } catch (error) {
        console.error('Shop API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/shop/buy', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { itemId } = req.body;
        if (!itemId) {
            return res.status(400).json({ success: false, error: 'Item ID is required' });
        }

        const result = await db.buyShopItem(userId, itemId);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Buy Shop Item API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/user/sync-balance', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const result = await db.syncBalance(userId);
        res.json(result);
    } catch (error) {
        console.error('Sync Balance API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports.handler = serverless(app);