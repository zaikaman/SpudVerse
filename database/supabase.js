const { createClient } = require('@supabase/supabase-js');

class SupabaseDatabase {
    constructor() {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
            console.warn('⚠️  Supabase credentials not found, using mock data');
            this.client = null;
            return;
        }

        this.client = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );
        
        console.log('✅ Supabase client initialized');
    }

    // User methods
    async getUser(userId) {
        if (!this.client) return null;
        
        try {
            const { data, error } = await this.client
                .from('users')
                .select('*')
                .eq('user_id', userId)
                .single();
                
            if (error && error.code !== 'PGRST116') {
                console.error('Supabase getUser error:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('getUser error:', error);
            return null;
        }
    }

    async createUser(userId, username, firstName, lastName, referrerId = null) {
        if (!this.client) return null;
        
        try {
            const { data, error } = await this.client
                .from('users')
                .upsert({
                    user_id: userId,
                    username: username,
                    first_name: firstName,
                    last_name: lastName,
                    referrer_id: referrerId,
                    balance: 0
                })
                .select()
                .single();
                
            if (error) {
                console.error('Supabase createUser error:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('createUser error:', error);
            return null;
        }
    }

    async updateUserBalance(userId, amount) {
        if (!this.client) return false;
        
        try {
            // Use atomic increment to avoid race conditions
            const { data, error } = await this.client
                .rpc('increment_user_balance', {
                    p_user_id: userId,
                    p_amount: amount
                });
                
            if (error) {
                console.error('Supabase updateUserBalance error:', error);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('updateUserBalance error:', error);
            return false;
        }
    }

    async updateLastTapTime(userId, timestamp) {
        if (!this.client) return false;
        
        try {
            const { error } = await this.client
                .from('users')
                .update({ 
                    last_tap_time: timestamp,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);
                
            if (error) {
                console.error('Supabase updateLastTapTime error:', error);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('updateLastTapTime error:', error);
            return false;
        }
    }

    // Leaderboard
    async getLeaderboard(limit = 10) {
        if (!this.client) {
            // Return mock data
            return [
                { user_id: 1, username: 'PotatoKing', first_name: 'Potato', balance: 50000 },
                { user_id: 2, username: 'SpudMaster', first_name: 'Spud', balance: 35000 },
                { user_id: 3, username: 'FarmHero', first_name: 'Farm', balance: 28000 }
            ];
        }
        
        try {
            const { data, error } = await this.client
                .from('leaderboard')
                .select('*')
                .limit(limit);
                
            if (error) {
                console.error('Supabase getLeaderboard error:', error);
                return [];
            }
            
            return data || [];
        } catch (error) {
            console.error('getLeaderboard error:', error);
            return [];
        }
    }

    // Referral methods
    async addReferral(referrerId, referredId) {
        if (!this.client) return null;
        
        try {
            const { data, error } = await this.client
                .from('referrals')
                .insert({
                    referrer_id: referrerId,
                    referred_id: referredId
                })
                .select()
                .single();
                
            if (error) {
                console.error('Supabase addReferral error:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('addReferral error:', error);
            return null;
        }
    }

    async getReferralCount(userId) {
        if (!this.client) return 0;
        
        try {
            const { count, error } = await this.client
                .from('referrals')
                .select('*', { count: 'exact', head: true })
                .eq('referrer_id', userId);
                
            if (error) {
                console.error('Supabase getReferralCount error:', error);
                return 0;
            }
            
            return count || 0;
        } catch (error) {
            console.error('getReferralCount error:', error);
            return 0;
        }
    }

    // Mission methods
    async getMissions() {
        if (!this.client) {
            // Return mock missions
            return [
                {
                    id: 1,
                    title: "🎉 Welcome to SpudVerse",
                    description: "Complete account registration",
                    reward: 100,
                    type: "welcome"
                },
                {
                    id: 2,
                    title: "📢 Join Telegram Channel",
                    description: "Join our official channel @spudverse_channel",
                    reward: 250,
                    type: "social"
                },
                {
                    id: 3,
                    title: "🐦 Follow Twitter",
                    description: "Follow @SpudVerse on Twitter",
                    reward: 200,
                    type: "social"
                },
                {
                    id: 4,
                    title: "👥 Invite 5 Friends",
                    description: "Invite 5 friends to join SpudVerse",
                    reward: 500,
                    type: "referral"
                }
            ];
        }
        
        try {
            const { data, error } = await this.client
                .from('missions')
                .select('*')
                .eq('is_active', true)
                .order('id');
                
            if (error) {
                console.error('Supabase getMissions error:', error);
                return [];
            }
            
            return data || [];
        } catch (error) {
            console.error('getMissions error:', error);
            return [];
        }
    }

    async getUserMissionProgress(userId, missionId) {
        if (!this.client) return null;
        
        try {
            const { data, error } = await this.client
                .from('user_missions')
                .select('*')
                .eq('user_id', userId)
                .eq('mission_id', missionId)
                .single();
                
            if (error && error.code !== 'PGRST116') {
                console.error('Supabase getUserMissionProgress error:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('getUserMissionProgress error:', error);
            return null;
        }
    }

    async updateUserMission(userId, missionId, completed = false, claimed = false) {
        if (!this.client) return null;
        
        try {
            console.log(`🔄 Supabase updateUserMission:`, {
                userId,
                missionId,
                completed,
                claimed
            });
            
            const completedAt = completed ? new Date().toISOString() : null;
            
            const { data, error } = await this.client
                .from('user_missions')
                .upsert({
                    user_id: userId,
                    mission_id: missionId,
                    completed: completed,
                    claimed: claimed,
                    completed_at: completedAt
                }, {
                    onConflict: 'user_id,mission_id'
                })
                .select()
                .single();
                
            if (error) {
                console.error('❌ Supabase updateUserMission error:', error);
                return null;
            }
            
            console.log(`✅ Supabase updateUserMission success:`, data);
            return data;
        } catch (error) {
            console.error('❌ updateUserMission error:', error);
            return null;
        }
    }

    // Get comprehensive user stats
    async getUserStats(userId) {
        if (!this.client) {
            return {
                balance: 0,
                referral_count: 0,
                completed_missions: 0,
                rank: 0
            };
        }
        
        try {
            const { data, error } = await this.client
                .rpc('get_user_stats', { p_user_id: userId });
                
            if (error) {
                console.error('Supabase getUserStats error:', error);
                return {
                    balance: 0,
                    referral_count: 0,
                    completed_missions: 0,
                    rank: 0
                };
            }
            
            return data[0] || {
                balance: 0,
                referral_count: 0,
                completed_missions: 0,
                rank: 0
            };
        } catch (error) {
            console.error('getUserStats error:', error);
            return {
                balance: 0,
                referral_count: 0,
                completed_missions: 0,
                rank: 0
            };
        }
    }

    // Achievement methods
    async getAchievements() {
        if (!this.client) {
            // Return mock achievements
            return [
                { id: 1, title: "🏁 First Steps", description: "Earned your first SPUD!", threshold: 1, type: "balance", icon: "🏁", reward: 10 },
                { id: 2, title: "💯 Century Club", description: "Earned 100 SPUD coins!", threshold: 100, type: "balance", icon: "💯", reward: 50 },
                { id: 3, title: "🔥 Thousand Club", description: "Earned 1,000 SPUD coins!", threshold: 1000, type: "balance", icon: "🔥", reward: 100 }
            ];
        }
        
        try {
            const { data, error } = await this.client
                .from('achievements')
                .select('*')
                .eq('is_active', true)
                .order('threshold');
                
            if (error) {
                console.error('Supabase getAchievements error:', error);
                return [];
            }
            
            return data || [];
        } catch (error) {
            console.error('getAchievements error:', error);
            return [];
        }
    }

    async getUserAchievements(userId) {
        if (!this.client) return [];
        
        try {
            const { data, error } = await this.client
                .from('user_achievements')
                .select(`
                    *,
                    achievements (*)
                `)
                .eq('user_id', userId);
                
            if (error) {
                console.error('Supabase getUserAchievements error:', error);
                return [];
            }
            
            return data || [];
        } catch (error) {
            console.error('getUserAchievements error:', error);
            return [];
        }
    }

    async unlockAchievement(userId, achievementId) {
        if (!this.client) return null;
        
        try {
            const { data, error } = await this.client
                .from('user_achievements')
                .insert({
                    user_id: userId,
                    achievement_id: achievementId
                })
                .select(`
                    *,
                    achievements (*)
                `)
                .single();
                
            if (error) {
                console.error('Supabase unlockAchievement error:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('unlockAchievement error:', error);
            return null;
        }
    }

    async checkAndUnlockAchievements(userId, userStats) {
        if (!this.client) return [];
        
        try {
            // Get all achievements
            const achievements = await this.getAchievements();
            
            // Get user's current achievements
            const userAchievements = await this.getUserAchievements(userId);
            const unlockedIds = userAchievements.map(ua => ua.achievement_id);
            
            const newlyUnlocked = [];
            
            for (const achievement of achievements) {
                if (unlockedIds.includes(achievement.id)) continue;
                
                let shouldUnlock = false;
                
                switch (achievement.type) {
                    case 'balance':
                        shouldUnlock = userStats.balance >= achievement.threshold;
                        break;
                    case 'referrals':
                        shouldUnlock = userStats.referral_count >= achievement.threshold;
                        break;
                    case 'missions':
                        shouldUnlock = userStats.completed_missions >= achievement.threshold;
                        break;
                    case 'rank':
                        shouldUnlock = userStats.rank > 0 && userStats.rank <= achievement.threshold;
                        break;
                    case 'taps':
                        // This would need to be tracked separately
                        break;
                }
                
                if (shouldUnlock) {
                    const unlocked = await this.unlockAchievement(userId, achievement.id);
                    if (unlocked) {
                        newlyUnlocked.push(unlocked);
                    }
                }
            }
            
            return newlyUnlocked;
        } catch (error) {
            console.error('checkAndUnlockAchievements error:', error);
            return [];
        }
    }

    // Real-time subscription for leaderboard
    subscribeToLeaderboard(callback) {
        if (!this.client) return null;
        
        const subscription = this.client
            .channel('leaderboard-changes')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'users' 
                },
                callback
            )
            .subscribe();
            
        return subscription;
    }

    // Energy methods
    async getUserEnergy(userId) {
        if (!this.client) {
            return {
                current_energy: 100,
                max_energy: 100,
                energy_regen_rate: 1,
                time_to_full: 0
            };
        }
        
        try {
            const { data, error } = await this.client
                .rpc('get_user_energy', { p_user_id: userId });
                
            if (error) {
                console.error('Supabase getUserEnergy error:', error);
                return { current_energy: 100, max_energy: 100, energy_regen_rate: 1, time_to_full: 0 };
            }
            
            return data || { current_energy: 100, max_energy: 100, energy_regen_rate: 1, time_to_full: 0 };
        } catch (error) {
            console.error('getUserEnergy error:', error);
            return { current_energy: 100, max_energy: 100, energy_regen_rate: 1, time_to_full: 0 };
        }
    }

    async consumeEnergy(userId, energyCost = 1) {
        if (!this.client) {
            return { success: false, error: 'No database connection' };
        }
        
        try {
            const { data, error } = await this.client
                .rpc('update_user_energy', { 
                    p_user_id: userId, 
                    p_energy_cost: energyCost 
                });
                
            if (error) {
                console.error('Supabase consumeEnergy error:', error);
                return { success: false, error: error.message };
            }
            
            return data || { success: false, error: 'Unknown error' };
        } catch (error) {
            console.error('consumeEnergy error:', error);
            return { success: false, error: error.message };
        }
    }

    async upgradeUserEnergy(userId, upgradeType, cost) {
        if (!this.client) return false;
        
        try {
            let updateFields = {};
            
            switch (upgradeType) {
                case 'max_energy':
                    updateFields.max_energy = 'max_energy + 25';
                    break;
                case 'regen_rate':
                    updateFields.energy_regen_rate = 'energy_regen_rate + 1';
                    break;
                default:
                    return false;
            }
            
            // First deduct cost and upgrade
            const { error } = await this.client
                .from('users')
                .update({
                    balance: `balance - ${cost}`,
                    ...updateFields,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .gte('balance', cost);
                
            if (error) {
                console.error('Supabase upgradeUserEnergy error:', error);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('upgradeUserEnergy error:', error);
            return false;
        }
    }

    close() {
        // Supabase client doesn't need explicit closing
        console.log('📡 Supabase connection closed');
    }
}

module.exports = SupabaseDatabase;
