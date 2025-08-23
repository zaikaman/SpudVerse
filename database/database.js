const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        // Tạo thư mục database nếu chưa có
        const dbDir = path.dirname(__filename);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'spudverse.db');
        this.db = new sqlite3.Database(dbPath);
        this.init();
    }

    init() {
        // Tạo bảng users
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                balance INTEGER DEFAULT 0,
                last_tap_time INTEGER DEFAULT 0,
                referrer_id INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // Tạo bảng referrals
        this.db.run(`
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER,
                referred_id INTEGER,
                bonus_claimed INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (referrer_id) REFERENCES users (user_id),
                FOREIGN KEY (referred_id) REFERENCES users (user_id)
            )
        `);

        // Tạo bảng missions (airdrops)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS missions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                reward INTEGER DEFAULT 0,
                type TEXT DEFAULT 'social', -- social, referral, daily
                requirements TEXT, -- JSON string
                is_active INTEGER DEFAULT 1,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `, () => {
            // Thêm dữ liệu mẫu cho missions sau khi bảng đã được tạo
            this.addDefaultMissions();
        });

        // Tạo bảng user_missions (tiến độ nhiệm vụ)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS user_missions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                mission_id INTEGER,
                completed INTEGER DEFAULT 0,
                claimed INTEGER DEFAULT 0,
                completed_at INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (user_id) REFERENCES users (user_id),
                FOREIGN KEY (mission_id) REFERENCES missions (id)
            )
        `);
    }

    addDefaultMissions() {
        const defaultMissions = [
            {
                title: "🎉 Welcome to SpudVerse",
                description: "Complete account registration",
                reward: 100,
                type: "welcome",
                requirements: JSON.stringify({ action: "register" })
            },
            {
                title: "📢 Join Telegram Channel",
                description: "Join our official channel @spudverse_channel",
                reward: 250,
                type: "social",
                requirements: JSON.stringify({ action: "join_channel", channel: "@spudverse_channel" })
            },
            {
                title: "🐦 Follow Twitter",
                description: "Follow @SpudVerse on Twitter",
                reward: 200,
                type: "social",
                requirements: JSON.stringify({ action: "follow_twitter", username: "@SpudVerse" })
            },
            {
                title: "👥 Invite 5 Friends",
                description: "Invite 5 friends to join SpudVerse",
                reward: 500,
                type: "referral",
                requirements: JSON.stringify({ action: "invite_friends", count: 5 })
            }
        ];

        defaultMissions.forEach(mission => {
            this.db.run(`
                INSERT OR IGNORE INTO missions (title, description, reward, type, requirements)
                VALUES (?, ?, ?, ?, ?)
            `, [mission.title, mission.description, mission.reward, mission.type, mission.requirements]);
        });
    }

    // User methods
    async getUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async createUser(userId, username, firstName, lastName, referrerId = null) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT OR REPLACE INTO users (user_id, username, first_name, last_name, referrer_id)
                VALUES (?, ?, ?, ?, ?)
            `, [userId, username, firstName, lastName, referrerId], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    async updateUserBalance(userId, amount) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET balance = balance + ?, updated_at = strftime('%s', 'now')
                WHERE user_id = ?
            `, [amount, userId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    async updateLastTapTime(userId, timestamp) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET last_tap_time = ?, updated_at = strftime('%s', 'now')
                WHERE user_id = ?
            `, [timestamp, userId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // Leaderboard
    async getLeaderboard(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT user_id, username, first_name, balance,
                       ROW_NUMBER() OVER (ORDER BY balance DESC) as rank
                FROM users 
                ORDER BY balance DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Referral methods
    async addReferral(referrerId, referredId) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO referrals (referrer_id, referred_id)
                VALUES (?, ?)
            `, [referrerId, referredId], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    async getReferralCount(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT COUNT(*) as count 
                FROM referrals 
                WHERE referrer_id = ?
            `, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.count : 0);
            });
        });
    }

    // Mission methods
    async getMissions() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM missions WHERE is_active = 1', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getUserMissionProgress(userId, missionId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT * FROM user_missions 
                WHERE user_id = ? AND mission_id = ?
            `, [userId, missionId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async updateUserMission(userId, missionId, completed = false, claimed = false) {
        return new Promise((resolve, reject) => {
            const completedAt = completed ? Math.floor(Date.now() / 1000) : null;
            
            this.db.run(`
                INSERT OR REPLACE INTO user_missions 
                (user_id, mission_id, completed, claimed, completed_at)
                VALUES (?, ?, ?, ?, ?)
            `, [userId, missionId, completed ? 1 : 0, claimed ? 1 : 0, completedAt], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = Database;
