-- SpudVerse Database Schema for Supabase
-- Run these commands in Supabase SQL Editor

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    balance INTEGER DEFAULT 0,
    last_tap_time BIGINT DEFAULT 0,
    referrer_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer_id BIGINT REFERENCES users(user_id),
    referred_id BIGINT REFERENCES users(user_id),
    bonus_claimed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create missions table
CREATE TABLE IF NOT EXISTS missions (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    reward INTEGER DEFAULT 0,
    type TEXT DEFAULT 'social',
    requirements JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_missions table
CREATE TABLE IF NOT EXISTS user_missions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(user_id),
    mission_id INTEGER REFERENCES missions(id),
    completed BOOLEAN DEFAULT false,
    claimed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, mission_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance DESC);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_user_missions_user ON user_missions(user_id);

-- Insert default missions
INSERT INTO missions (title, description, reward, type, requirements) VALUES
('🎉 Welcome to SpudVerse', 'Complete account registration', 100, 'welcome', '{"action": "register"}'),
('📢 Join Telegram Channel', 'Join our official channel @spudverse_channel', 250, 'social', '{"action": "join_channel", "channel": "@spudverse_channel"}'),
('🐦 Follow Twitter', 'Follow @SpudVerse on Twitter', 200, 'social', '{"action": "follow_twitter", "username": "@SpudVerse"}'),
('👥 Invite 5 Friends', 'Invite 5 friends to join SpudVerse', 500, 'referral', '{"action": "invite_friends", "count": 5}'),
('🔥 Daily Login', 'Login daily for 7 days straight', 300, 'daily', '{"action": "daily_login", "days": 7}'),
('💎 Reach 1K SPUD', 'Accumulate 1000 SPUD coins', 150, 'achievement', '{"action": "reach_balance", "amount": 1000}')
ON CONFLICT DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_missions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now, can be restricted later)
CREATE POLICY "Allow all operations on users" ON users FOR ALL USING (true);
CREATE POLICY "Allow all operations on referrals" ON referrals FOR ALL USING (true);
CREATE POLICY "Allow all operations on user_missions" ON user_missions FOR ALL USING (true);
CREATE POLICY "Allow read on missions" ON missions FOR SELECT USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create a view for leaderboard
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    user_id,
    username,
    first_name,
    last_name,
    balance,
    ROW_NUMBER() OVER (ORDER BY balance DESC) as rank
FROM users
WHERE balance > 0
ORDER BY balance DESC;

-- Create a function to get user stats
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id BIGINT)
RETURNS TABLE(
    balance INTEGER,
    referral_count BIGINT,
    completed_missions BIGINT,
    rank INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.balance,
        COALESCE(r.referral_count, 0) as referral_count,
        COALESCE(m.completed_missions, 0) as completed_missions,
        COALESCE(l.rank::INTEGER, 0) as rank
    FROM users u
    LEFT JOIN (
        SELECT referrer_id, COUNT(*) as referral_count 
        FROM referrals 
        GROUP BY referrer_id
    ) r ON u.user_id = r.referrer_id
    LEFT JOIN (
        SELECT user_id, COUNT(*) as completed_missions 
        FROM user_missions 
        WHERE completed = true 
        GROUP BY user_id
    ) m ON u.user_id = m.user_id
    LEFT JOIN leaderboard l ON u.user_id = l.user_id
    WHERE u.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
