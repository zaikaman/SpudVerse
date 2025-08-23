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
            // Get current balance first
            const user = await this.getUser(userId);
            if (!user) return false;
            
            const newBalance = user.balance + amount;
            
            const { error } = await this.client
                .from('users')
                .update({ 
                    balance: newBalance,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);
                
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
            const completedAt = completed ? new Date().toISOString() : null;
            
            const { data, error } = await this.client
                .from('user_missions')
                .upsert({
                    user_id: userId,
                    mission_id: missionId,
                    completed: completed,
                    claimed: claimed,
                    completed_at: completedAt
                })
                .select()
                .single();
                
            if (error) {
                console.error('Supabase updateUserMission error:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('updateUserMission error:', error);
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

    close() {
        // Supabase client doesn't need explicit closing
        console.log('📡 Supabase connection closed');
    }
}

module.exports = SupabaseDatabase;
