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
    streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_played_at TIMESTAMP WITH TIME ZONE,
    sph BIGINT DEFAULT 0,
    last_sph_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
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
    level,
    ROW_NUMBER() OVER (ORDER BY balance DESC) as rank
FROM users
WHERE balance > 0
ORDER BY balance DESC;

-- Create upgrades table
CREATE TABLE IF NOT EXISTS upgrades (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    base_cost BIGINT DEFAULT 100,
    cost_multiplier REAL DEFAULT 1.5,
    base_value REAL DEFAULT 1,
    value_multiplier REAL DEFAULT 1.2,
    max_level INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_upgrades table
CREATE TABLE IF NOT EXISTS user_upgrades (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    upgrade_id INTEGER NOT NULL REFERENCES upgrades(id),
    level INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, upgrade_id)
);

-- Insert default upgrades
INSERT INTO upgrades (name, description, base_cost, cost_multiplier, base_value, value_multiplier, max_level) VALUES
('per_tap', 'Increase SPUD earned per tap', 100, 1.8, 1, 1, 20),
('max_energy', 'Increase maximum energy capacity', 150, 2.0, 100, 1.2, 15),
('energy_regen_rate', 'Increase energy regeneration speed', 200, 2.2, 1, 1, 10)
ON CONFLICT (name) DO NOTHING;

-- Create indexes for upgrades
CREATE INDEX IF NOT EXISTS idx_user_upgrades_user_upgrade ON user_upgrades(user_id, upgrade_id);

-- Function to calculate upgrade cost
CREATE OR REPLACE FUNCTION get_upgrade_cost(p_upgrade_name TEXT, p_level INTEGER)
RETURNS BIGINT AS $$
DECLARE
    upgrade_record RECORD;
BEGIN
    SELECT * INTO upgrade_record FROM upgrades WHERE name = p_upgrade_name;
    IF upgrade_record IS NULL THEN
        RETURN -1; -- Indicates error
    END IF;
    RETURN FLOOR(upgrade_record.base_cost * POWER(upgrade_record.cost_multiplier, p_level));
END;
$$ LANGUAGE plpgsql;

-- Function to purchase an upgrade
CREATE OR REPLACE FUNCTION purchase_upgrade(p_user_id BIGINT, p_upgrade_name TEXT)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    upgrade_record RECORD;
    user_upgrade_record RECORD;
    current_level INTEGER;
    cost BIGINT;
    new_level INTEGER;
    new_value REAL;
BEGIN
    -- Get user, upgrade, and user_upgrade info
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;
    SELECT * INTO upgrade_record FROM upgrades WHERE name = p_upgrade_name;
    SELECT * INTO user_upgrade_record FROM user_upgrades WHERE user_id = p_user_id AND upgrade_id = upgrade_record.id;

    IF user_record IS NULL OR upgrade_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'invalid_data');
    END IF;

    -- Determine current level
    IF user_upgrade_record IS NULL THEN
        current_level := 0;
    ELSE
        current_level := user_upgrade_record.level;
    END IF;

    -- Check max level
    IF current_level >= upgrade_record.max_level THEN
        RETURN json_build_object('success', false, 'error', 'max_level_reached');
    END IF;

    -- Calculate cost for next level
    new_level := current_level + 1;
    cost := get_upgrade_cost(p_upgrade_name, current_level);

    -- Check if user has enough balance
    IF user_record.balance < cost THEN
        RETURN json_build_object('success', false, 'error', 'insufficient_balance', 'required', cost);
    END IF;

    -- Deduct cost and update user_upgrades
    UPDATE users SET balance = balance - cost WHERE user_id = p_user_id;

    IF user_upgrade_record IS NULL THEN
        INSERT INTO user_upgrades (user_id, upgrade_id, level)
        VALUES (p_user_id, upgrade_record.id, new_level);
    ELSE
        UPDATE user_upgrades SET level = new_level, updated_at = NOW()
        WHERE id = user_upgrade_record.id;
    END IF;

    -- Update user stats based on upgrade type
    IF p_upgrade_name = 'per_tap' THEN
        -- Increment per_tap instead of replacing it
        UPDATE users SET per_tap = per_tap + upgrade_record.value_multiplier WHERE user_id = p_user_id;
    ELSIF p_upgrade_name = 'max_energy' THEN
        -- Increment max_energy by a fixed amount per upgrade level
        UPDATE users SET max_energy = max_energy + 25 WHERE user_id = p_user_id;
    ELSIF p_upgrade_name = 'energy_regen_rate' THEN
        -- Increment energy_regen_rate instead of replacing it
        UPDATE users SET energy_regen_rate = energy_regen_rate + upgrade_record.value_multiplier WHERE user_id = p_user_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'new_level', new_level,
        'cost', cost,
        'new_balance', user_record.balance - cost
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get all upgrades for a user with current level and next level cost
CREATE OR REPLACE FUNCTION get_user_upgrades_with_costs(p_user_id BIGINT)
RETURNS TABLE(
    id INTEGER,
    name TEXT,
    description TEXT,
    base_cost BIGINT,
    cost_multiplier REAL,
    max_level INTEGER,
    current_level INTEGER,
    next_level_cost BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.name,
        u.description,
        u.base_cost,
        u.cost_multiplier,
        u.max_level,
        COALESCE(uu.level, 0) as current_level,
        CASE
            WHEN COALESCE(uu.level, 0) >= u.max_level THEN -1 -- -1 indicates max level reached
            ELSE get_upgrade_cost(u.name, COALESCE(uu.level, 0))
        END as next_level_cost
    FROM
        upgrades u
    LEFT JOIN
        user_upgrades uu ON u.id = uu.upgrade_id AND uu.user_id = p_user_id
    ORDER BY
        u.id;
END;
$$ LANGUAGE plpgsql;

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

-- Custom type for level structure
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'level_requirements') THEN
        CREATE TYPE level_requirements AS (
            level INTEGER,
            requiredFarmed BIGINT,
            perTapBonus INTEGER,
            maxEnergyBonus INTEGER
        );
    END IF;
END$$;

-- Function to level up a user
CREATE OR REPLACE FUNCTION level_up_user(p_user_id BIGINT, p_new_level INTEGER)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    level_info level_requirements;
    levels level_requirements[] := ARRAY[
        (1, 0, 1, 100),
        (2, 1000, 2, 150),
        (3, 5000, 3, 200),
        (4, 15000, 5, 250),
        (5, 50000, 8, 350),
        (6, 150000, 12, 500),
        (7, 500000, 20, 750)
    ]::level_requirements[];
    i INTEGER;
BEGIN
    -- Get user data
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;

    -- Find the level info for the new level
    level_info := NULL;
    FOREACH level_info IN ARRAY levels LOOP
        IF level_info.level = p_new_level THEN
            EXIT;
        END IF;
        level_info := NULL;
    END LOOP;

    IF level_info IS NULL THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Invalid level',
            'details', json_build_object(
                'current_level', user_record.level,
                'attempted_level', p_new_level
            )
        );
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
                'per_tap', user_record.per_tap + (level_info.perTapBonus - (
                    SELECT l.perTapBonus 
                    FROM unnest(levels) l 
                    WHERE l.level = p_new_level - 1
                )),
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

-- Function to update user streak
CREATE OR REPLACE FUNCTION update_user_streak(p_user_id BIGINT)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    new_streak INTEGER;
    new_best_streak INTEGER;
    is_new_day BOOLEAN;
BEGIN
    -- Get current user data
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;
    
    IF user_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'user_not_found');
    END IF;

    -- Check if it's a new day since last play
    IF user_record.last_played_at IS NULL THEN
        is_new_day := true;
    ELSE
        -- Check if last_played_at was before today
        is_new_day := user_record.last_played_at < date_trunc('day', NOW());
    END IF;

    IF is_new_day THEN
        -- Nếu lần chơi cuối là hôm qua, tăng streak
        IF user_record.last_played_at IS NOT NULL AND user_record.last_played_at >= date_trunc('day', NOW() - interval '1 day') THEN
            new_streak := user_record.streak + 1;
        ELSE
            -- Nếu không, reset streak về 1
            new_streak := 1;
        END IF;
        
        -- Cập nhật best_streak nếu streak mới lớn hơn
        new_best_streak := GREATEST(new_streak, user_record.best_streak);
        
        UPDATE users
        SET 
            streak = new_streak,
            best_streak = new_best_streak,
            last_played_at = NOW(),
            updated_at = NOW()
        WHERE user_id = p_user_id;
        
        RETURN json_build_object(
            'success', true,
            'streak', new_streak,
            'best_streak', new_best_streak
        );
    ELSE
        -- Nếu chưa sang ngày mới, trả về streak hiện tại
        RETURN json_build_object(
            'success', true,
            'streak', user_record.streak,
            'best_streak', user_record.best_streak
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create shop_items table
CREATE TABLE IF NOT EXISTS shop_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    cost BIGINT NOT NULL,
    profit INTEGER NOT NULL,
    scaling REAL NOT NULL,
    icon TEXT,
    category TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_items table
CREATE TABLE IF NOT EXISTS user_items (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(user_id),
    item_id INTEGER REFERENCES shop_items(id),
    count INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, item_id)
);

-- Thêm 40 vật phẩm mới với cấu trúc cột chính xác
INSERT INTO shop_items (name, cost, profit, scaling, icon, category) VALUES
-- Tab 1: Potato Land (Farm Life)
('Old Shovel', 10, 5, 1.5, '🪣', 'Potato Land'),
('Farmer''s Hut', 20, 15, 1.5, '🏡', 'Potato Land'),
('Potato Cart', 50, 40, 1.5, '🛒', 'Potato Land'),
('Village Market', 100, 100, 1.5, '🥔', 'Potato Land'),
('Potato Mill', 250, 250, 1.5, '⚙️', 'Potato Land'),
('Tractor Ride', 500, 800, 1.5, '🚜', 'Potato Land'),
('Potato Festival', 1200, 2500, 1.5, '🎉', 'Potato Land'),
('Potato Statue', 2500, 10000, 1.5, '🗿', 'Potato Land'),

-- Tab 2: Potato City (Urban Growth)
('Potato Shop', 5000, 20, 1.5, '🛍', 'Potato City'),
('Street Food Corner', 10000, 60, 1.5, '🌭', 'Potato City'),
('Potato Restaurant', 25000, 200, 1.5, '🍴', 'Potato City'),
('Delivery Service', 50000, 700, 1.5, '🚚', 'Potato City'),
('Potato Factory', 120000, 3000, 1.5, '🏭', 'Potato City'),
('Potato Tower', 250000, 12000, 1.5, '🗼', 'Potato City'),
('Potato Subway', 500000, 40000, 1.5, '🚇', 'Potato City'),
('Potato Skyscraper', 1000000, 150000, 1.5, '🏢', 'Potato City'),

-- Tab 3: Potato Nation (Industrial & National Power)
('Potato University', 2500000, 500, 1.5, '🎓', 'Potato Nation'),
('Potato Bank', 5000000, 2000, 1.5, '🏦', 'Potato Nation'),
('Potato Parliament', 10000000, 8000, 1.5, '🏛', 'Potato Nation'),
('Potato TV Station', 25000000, 30000, 1.5, '📺', 'Potato Nation'),
('National Railway', 50000000, 120000, 1.5, '🚂', 'Potato Nation'),
('Potato Military Base', 100000000, 500000, 1.5, '🪖', 'Potato Nation'),
('Potato Airport', 250000000, 2000000, 1.5, '✈️', 'Potato Nation'),
('Potato Nuclear Plant', 500000000, 10000000, 1.5, '☢️', 'Potato Nation'),

-- Tab 4: Potato World (Global Expansion & Futuristic Tech)
('Potato Internet Café', 1000000000, 50000, 1.5, '💻', 'Potato World'),
('Potato Silicon Valley', 2500000000, 200000, 1.5, '🖥', 'Potato World'),
('Potato Stock Exchange', 5000000000, 1000000, 1.5, '📈', 'Potato World'),
('Potato Space Program', 10000000000, 5000000, 1.5, '🚀', 'Potato World'),
('Potato AI Lab', 25000000000, 25000000, 1.5, '🤖', 'Potato World'),
('Potato Crypto Farm', 50000000000, 100000000, 1.5, '⛏', 'Potato World'),
('Potato World Expo', 100000000000, 500000000, 1.5, '🌐', 'Potato World'),
('Potato Time Machine', 250000000000, 2500000000, 1.5, '⏳', 'Potato World'),

-- Tab 5: Potato Galaxy (Cosmic Empire)
('Potato Moonbase', 500000000000, 10000000, 1.5, '🌕', 'Potato Galaxy'),
('Potato Mars Colony', 1000000000000, 50000000, 1.5, '🪐', 'Potato Galaxy'),
('Potato Space Station', 2500000000000, 250000000, 1.5, '🛰', 'Potato Galaxy'),
('Potato Warp Drive', 5000000000000, 1200000000, 1.5, '⚡', 'Potato Galaxy'),
('Potato Black Hole Lab', 10000000000000, 6000000000, 1.5, '🌀', 'Potato Galaxy'),
('Potato Galactic Senate', 25000000000000, 30000000000, 1.5, '👑', 'Potato Galaxy'),
('Potato Dyson Sphere', 50000000000000, 150000000000, 1.5, '☀️', 'Potato Galaxy'),
('Potato Multiverse Portal', 100000000000000, 999999999999, 1.5, '🌌')
ON CONFLICT (id) DO NOTHING;

-- Create indexes for shop
CREATE INDEX IF NOT EXISTS idx_user_items_user_item ON user_items(user_id, item_id);

-- Enable RLS for shop tables
ALTER TABLE shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for shop tables
CREATE POLICY "Allow read on shop_items" ON shop_items FOR SELECT USING (true);
CREATE POLICY "Allow all operations on user_items" ON user_items FOR ALL USING (true);

-- Function to buy a shop item
CREATE OR REPLACE FUNCTION buy_shop_item(p_user_id BIGINT, p_item_id INTEGER)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    item_record RECORD;
    user_item_record RECORD;
    current_count INTEGER;
    cost BIGINT;
BEGIN
    -- Get records
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;
    SELECT * INTO item_record FROM shop_items WHERE id = p_item_id;
    SELECT * INTO user_item_record FROM user_items WHERE user_id = p_user_id AND item_id = p_item_id;

    IF user_record IS NULL OR item_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'invalid_data');
    END IF;

    -- Determine current count and cost
    current_count := COALESCE(user_item_record.count, 0);
    cost := FLOOR(item_record.cost * POWER(item_record.scaling, current_count));

    -- Check balance
    IF user_record.balance < cost THEN
        RETURN json_build_object('success', false, 'error', 'insufficient_balance', 'required', cost);
    END IF;

    -- Deduct cost, update SPH, and update user_items
    UPDATE users 
    SET 
        balance = balance - cost,
        sph = sph + item_record.profit
    WHERE user_id = p_user_id;

    IF user_item_record IS NULL THEN
        INSERT INTO user_items (user_id, item_id, count)
        VALUES (p_user_id, p_item_id, 1);
    ELSE
        UPDATE user_items SET count = count + 1, updated_at = NOW()
        WHERE id = user_item_record.id;
    END IF;

    -- Return success with updated data
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;
    SELECT * INTO user_item_record FROM user_items WHERE user_id = p_user_id AND item_id = p_item_id;

    RETURN json_build_object(
        'success', true,
        'new_balance', user_record.balance,
        'new_sph', user_record.sph,
        'item_id', p_item_id,
        'new_count', user_item_record.count
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get user data including items
CREATE OR REPLACE FUNCTION get_user_data(p_user_id BIGINT)
RETURNS JSON AS $$
DECLARE
    user_details RECORD;
    user_items_json JSON;
BEGIN
    -- Get user details
    SELECT * INTO user_details FROM users WHERE user_id = p_user_id;

    IF user_details IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get user items
    SELECT json_agg(json_build_object('id', ui.item_id, 'count', ui.count))
    INTO user_items_json
    FROM user_items ui
    WHERE ui.user_id = p_user_id;

    -- Combine into a single JSON object
    RETURN json_build_object(
        'user_id', user_details.user_id,
        'username', user_details.username,
        'first_name', user_details.first_name,
        'last_name', user_details.last_name,
        'balance', user_details.balance,
        'total_farmed', user_details.total_farmed,
        'level', user_details.level,
        'per_tap', user_details.per_tap,
        'energy', user_details.energy,
        'max_energy', user_details.max_energy,
        'energy_regen_rate', user_details.energy_regen_rate,
        'streak', user_details.streak,
        'best_streak', user_details.best_streak,
        'sph', user_details.sph,
        'items', COALESCE(user_items_json, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql;

-- Function to sync balance with SPH earnings
CREATE OR REPLACE FUNCTION sync_balance_with_sph(p_user_id BIGINT)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    time_diff_seconds BIGINT;
    sph_earnings BIGINT;
    new_balance BIGINT;
BEGIN
    -- Get user record
    SELECT * INTO user_record FROM users WHERE user_id = p_user_id;

    IF user_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'user_not_found');
    END IF;

    -- Calculate time difference in seconds
    time_diff_seconds := EXTRACT(EPOCH FROM (NOW() - user_record.last_sph_update));

    IF time_diff_seconds <= 0 THEN
        RETURN json_build_object('success', true, 'balance', user_record.balance, 'earnings', 0);
    END IF;

    -- Calculate earnings
    sph_earnings := FLOOR(user_record.sph * time_diff_seconds / 3600.0);

    IF sph_earnings > 0 THEN
        -- Update balance and last_sph_update
        UPDATE users
        SET 
            balance = balance + sph_earnings,
            last_sph_update = NOW()
        WHERE user_id = p_user_id
        RETURNING balance INTO new_balance;
    ELSE
        new_balance := user_record.balance;
    END IF;

    RETURN json_build_object('success', true, 'balance', new_balance, 'earnings', sph_earnings);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION process_tap(
    p_user_id bigint,
    p_tap_count integer,
    p_spud_amount integer
) RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_energy integer;
    v_max_energy integer;
    v_current_balance integer;
    v_result json;
BEGIN
    -- Lock the user's energy record for update
    SELECT current_energy, max_energy 
    INTO v_current_energy, v_max_energy
    FROM user_energy 
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Check if we have enough energy
    IF v_current_energy < p_tap_count THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Insufficient energy',
            'current_energy', v_current_energy,
            'max_energy', v_max_energy
        );
    END IF;

    -- Update energy in a single atomic operation
    UPDATE user_energy 
    SET current_energy = current_energy - p_tap_count,
        last_update = NOW()
    WHERE user_id = p_user_id;

    -- Update balance in a single atomic operation
    UPDATE users
    SET balance = balance + p_spud_amount,
        total_farmed = total_farmed + p_spud_amount
    WHERE user_id = p_user_id
    RETURNING balance INTO v_current_balance;

    -- Build success response
    RETURN json_build_object(
        'success', true,
        'current_energy', v_current_energy - p_tap_count,
        'max_energy', v_max_energy,
        'balance', v_current_balance,
        'earned', p_spud_amount
    );
END;
$$;
