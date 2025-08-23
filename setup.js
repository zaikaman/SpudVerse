// Database setup script and initial data initialization
require('dotenv').config();
const Database = require('./database/database');

async function setupDatabase() {
    console.log('🔧 Setting up database...');
    
    try {
        const db = new Database();
        
        // Database will automatically create tables and sample data
        console.log('✅ Database setup completed successfully!');
        console.log('📝 Tables created:');
        console.log('   - users (user accounts)');
        console.log('   - referrals (referral system)');
        console.log('   - missions (airdrop missions)');
        console.log('   - user_missions (mission progress)');
        console.log('');
        console.log('🎯 Default missions added:');
        console.log('   - Welcome to SpudVerse (100 SPUD)');
        console.log('   - Join Telegram Channel (250 SPUD)');
        console.log('   - Follow Twitter (200 SPUD)');
        console.log('   - Invite 5 Friends (500 SPUD)');
        console.log('');
        console.log('🥔 SpudVerse database setup complete!');
        
        db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Database setup error:', error);
        process.exit(1);
    }
}

setupDatabase();
