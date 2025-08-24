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
app.get('/user', async (req, res) => {
    try {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const user = await db.getUser(userId);
        const referralCount = await db.getReferralCount(userId);
        
        res.json({
            success: true,
            data: {
                balance: user?.balance || 0,
                level: user?.level || 1,
                per_tap: user?.per_tap || 1,
                max_energy: user?.max_energy || 100,
                total_farmed: user?.total_farmed || 0,
                referrals: referralCount
            }
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/tap', async (req, res) => {
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

app.get('/missions', async (req, res) => {
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

app.post('/missions/claim', async (req, res) => {
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

app.post('/user/level-up', async (req, res) => {
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

app.get('/leaderboard', async (req, res) => {
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

module.exports.handler = serverless(app);
