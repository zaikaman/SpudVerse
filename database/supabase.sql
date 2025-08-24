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
    balance BIGINT DEFAULT 0,
    total_farmed BIGINT DEFAULT 0,
    level INTEGER DEFAULT 1,
    per_tap INTEGER DEFAULT 1,
    last_tap_time BIGINT DEFAULT 0,
    referrer_id BIGINT,
    energy INTEGER DEFAULT 100,
    max_energy INTEGER DEFAULT 100,
    energy_regen_rate INTEGER DEFAULT 1,
    last_energy_update BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    twitter_username TEXT,
    twitter_connected_at TIMESTAMP WITH TIME ZONE,
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

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    threshold INTEGER NOT NULL,
    type TEXT DEFAULT 'balance',
    icon TEXT DEFAULT '🏆',
    reward INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(user_id),
    achievement_id INTEGER REFERENCES achievements(id),
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    claimed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance DESC);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_user_missions_user ON user_missions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(type);

-- Insert default missions
INSERT INTO missions (title, description, reward, type, requirements) VALUES
('🎉 Welcome to SpudVerse', 'Complete account registration', 100, 'welcome', '{"action": "register"}'),
('📢 Join Telegram Channel', 'Join our official channel @spudverseann', 250, 'social', '{"action": "join_channel", "channel": "@spudverseann", "url": "https://t.me/spudverseann"}'),
('🐦 Follow Twitter', 'Follow @RealSpudVerse on X (Twitter)', 200, 'social', '{"action": "follow_twitter", "username": "@RealSpudVerse", "url": "https://x.com/RealSpudVerse"}'),
('👥 Invite 5 Friends', 'Invite 5 friends to join SpudVerse', 500, 'referral', '{"action": "invite_friends", "count": 5}'),
('🔥 Daily Login', 'Login daily for 7 days straight', 300, 'daily', '{"action": "daily_login", "days": 7}'),
('💎 Reach 1K SPUD', 'Accumulate 1000 SPUD coins', 150, 'achievement', '{"action": "reach_balance", "amount": 1000}')
ON CONFLICT DO NOTHING;

-- Insert default achievements
INSERT INTO achievements (title, description, threshold, type, icon, reward) VALUES
('🏁 First Steps', 'Earned your first SPUD!', 1, 'balance', '🏁', 10),
('💯 Century Club', 'Earned 100 SPUD coins!', 100, 'balance', '💯', 50),
('🔥 Thousand Club', 'Earned 1,000 SPUD coins!', 1000, 'balance', '🔥', 100),
('💎 Ten Thousand Legend', 'Earned 10,000 SPUD coins!', 10000, 'balance', '💎', 500),
('👥 Social Butterfly', 'Invited 5 friends', 5, 'referrals', '👥', 200),
('🏆 Mission Master', 'Completed 10 missions', 10, 'missions', '🏆', 300),
('⚡ Tap Master', 'Made 1000 taps', 1000, 'taps', '⚡', 150),
('🌟 Elite Farmer', 'Reached top 10 leaderboard', 10, 'rank', '🌟', 1000)
ON CONFLICT DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now, can be restricted later)
CREATE POLICY "Allow all operations on users" ON users FOR ALL USING (true);
CREATE POLICY "Allow all operations on referrals" ON referrals FOR ALL USING (true);
CREATE POLICY "Allow all operations on user_missions" ON user_missions FOR ALL USING (true);
CREATE POLICY "Allow all operations on user_achievements" ON user_achievements FOR ALL USING (true);
CREATE POLICY "Allow read on missions" ON missions FOR SELECT USING (true);
CREATE POLICY "Allow read on achievements" ON achievements FOR SELECT USING (true);

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
    balance BIGINT,
    total_farmed BIGINT,
    referral_count BIGINT,
    completed_missions BIGINT,
    rank INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.balance,
        u.total_farmed,
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

-- Create atomic balance increment function
CREATE OR REPLACE FUNCTION increment_user_balance(p_user_id BIGINT, p_amount INTEGER)
RETURNS INTEGER AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    -- Atomic update with returning the new balance
    UPDATE users 
    SET balance = balance + p_amount,
        total_farmed = total_farmed + p_amount,
        updated_at = NOW()
    WHERE users.user_id = p_user_id
    RETURNING balance INTO new_balance;
    
    -- If user doesn't exist, create them with the amount
    IF new_balance IS NULL THEN
        INSERT INTO users (user_id, balance, total_farmed, username, first_name, last_name)
        VALUES (p_user_id, p_amount, p_amount, 'User' || p_user_id, 'Unknown', 'User')
        ON CONFLICT (user_id) DO UPDATE SET 
            balance = users.balance + p_amount,
            total_farmed = users.total_farmed + p_amount
        RETURNING balance INTO new_balance;
    END IF;
    
    RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- Energy calculation and update function
CREATE OR REPLACE FUNCTION update_user_energy(p_user_id BIGINT, p_energy_cost INTEGER DEFAULT 1)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    current_time BIGINT;
    time_diff BIGINT;
    energy_gained INTEGER;
    new_energy INTEGER;
    result JSON;
BEGIN
    current_time := EXTRACT(EPOCH FROM NOW()) * 1000;
    
    -- Get current user data
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;
    
    IF user_record IS NULL THEN
        -- Create new user if doesn't exist
        INSERT INTO users (user_id, username, first_name, last_name, last_energy_update)
        VALUES (p_user_id, 'User' || p_user_id, 'Unknown', 'User', current_time)
        RETURNING * INTO user_record;
    END IF;
    
    -- Calculate energy regeneration
    time_diff := current_time - user_record.last_energy_update;
    energy_gained := FLOOR(time_diff / 10000) * user_record.energy_regen_rate; -- 10 seconds = 10000ms
    
    -- Calculate new energy (don't exceed max_energy)
    new_energy := LEAST(user_record.energy + energy_gained, user_record.max_energy);
    
    -- Check if user has enough energy for the action
    IF new_energy < p_energy_cost THEN
        -- Not enough energy
        result := json_build_object(
            'success', false,
            'error', 'insufficient_energy',
            'current_energy', new_energy,
            'max_energy', user_record.max_energy,
            'time_to_full', (user_record.max_energy - new_energy) * 10000 / user_record.energy_regen_rate
        );
    ELSE
        -- Consume energy and update
        new_energy := new_energy - p_energy_cost;
        
        UPDATE users 
        SET energy = new_energy,
            last_energy_update = current_time,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        
        result := json_build_object(
            'success', true,
            'current_energy', new_energy,
            'max_energy', user_record.max_energy,
            'energy_consumed', p_energy_cost,
            'time_to_full', (user_record.max_energy - new_energy) * 10000 / user_record.energy_regen_rate
        );
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get current energy without consuming
CREATE OR REPLACE FUNCTION get_user_energy(p_user_id BIGINT)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    current_time BIGINT;
    time_diff BIGINT;
    energy_gained INTEGER;
    current_energy INTEGER;
BEGIN
    current_time := EXTRACT(EPOCH FROM NOW()) * 1000;
    
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;
    
    IF user_record IS NULL THEN
        RETURN json_build_object('current_energy', 100, 'max_energy', 100);
    END IF;
    
    -- Calculate current energy
    time_diff := current_time - user_record.last_energy_update;
    energy_gained := FLOOR(time_diff / 10000) * user_record.energy_regen_rate;
    current_energy := LEAST(user_record.energy + energy_gained, user_record.max_energy);
    
    RETURN json_build_object(
        'current_energy', current_energy,
        'max_energy', user_record.max_energy,
        'energy_regen_rate', user_record.energy_regen_rate,
        'time_to_full', CASE 
            WHEN current_energy >= user_record.max_energy THEN 0
            ELSE (user_record.max_energy - current_energy) * 10000 / user_record.energy_regen_rate
        END
    );
END;
$$ LANGUAGE plpgsql;

-- Function to level up a user
CREATE OR REPLACE FUNCTION level_up_user(p_user_id BIGINT, p_new_level INTEGER)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    level_info RECORD;
    levels JSONB := '[
        {"level": 1, "requiredFarmed": 0, "perTapBonus": 1, "maxEnergyBonus": 100},
        {"level": 2, "requiredFarmed": 1000, "perTapBonus": 2, "maxEnergyBonus": 150},
        {"level": 3, "requiredFarmed": 5000, "perTapBonus": 3, "maxEnergyBonus": 200},
        {"level": 4, "requiredFarmed": 15000, "perTapBonus": 5, "maxEnergyBonus": 250},
        {"level": 5, "requiredFarmed": 50000, "perTapBonus": 8, "maxEnergyBonus": 350},
        {"level": 6, "requiredFarmed": 150000, "perTapBonus": 12, "maxEnergyBonus": 500},
        {"level": 7, "requiredFarmed": 500000, "perTapBonus": 20, "maxEnergyBonus": 750}
    ]';
BEGIN
    -- Get user data
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;

    -- Find the level info for the new level
    SELECT * INTO level_info FROM jsonb_to_recordset(levels) AS x(level INTEGER, requiredFarmed BIGINT, perTapBonus INTEGER, maxEnergyBonus INTEGER) WHERE level = p_new_level;

    IF level_info IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid level');
    END IF;

    -- Check if user has enough farmed total and is at the correct previous level
    IF user_record.total_farmed >= level_info.requiredFarmed AND user_record.level = p_new_level - 1 THEN
        -- Update user stats for the new level
        UPDATE users
        SET 
            level = p_new_level,
            per_tap = level_info.perTapBonus,
            max_energy = level_info.maxEnergyBonus,
            energy = level_info.maxEnergyBonus, -- Refill energy
            updated_at = NOW()
        WHERE user_id = p_user_id;

        RETURN json_build_object(
            'success', true,
            'data', json_build_object(
                'level', p_new_level,
                'per_tap', level_info.perTapBonus,
                'max_energy', level_info.maxEnergyBonus,
                'energy', level_info.maxEnergyBonus
            )
        );
    ELSE
        RETURN json_build_object(
            'success', false, 
            'error', 'Level up requirements not met',
            'details', json_build_object(
                'current_farmed', user_record.total_farmed, 
                'required_farmed', level_info.requiredFarmed, 
                'current_level', user_record.level, 
                'required_next_level', p_new_level
            )
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

