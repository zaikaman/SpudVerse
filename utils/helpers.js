// Utility functions cho SpudVerse Bot

const EMOJIS = {
    potato: '🥔',
    farm: '🌱',
    gift: '🎁',
    trophy: '🏆',
    profile: '👤',
    coin: '🪙',
    fire: '🔥',
    star: '⭐',
    rocket: '🚀',
    crown: '👑',
    tada: '🎉',
    money: '💰',
    chart: '📈'
};

// Format số tiền với dấu phẩy
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Tạo inline keyboard cho menu chính
function getMainKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${EMOJIS.farm} Farm`, callback_data: 'farm' },
                    { text: `${EMOJIS.gift} Airdrops`, callback_data: 'airdrops' }
                ],
                [
                    { text: `${EMOJIS.trophy} Leaderboard`, callback_data: 'leaderboard' },
                    { text: `${EMOJIS.profile} Profile`, callback_data: 'profile' }
                ]
            ]
        }
    };
}

// Create Back to Menu button
function getBackButton() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
            ]
        }
    };
}

// Create keyboard for Farm page
function getFarmKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: `${EMOJIS.potato} TAP TO FARM ${EMOJIS.potato}`, callback_data: 'tap_potato' }],
                [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
            ]
        }
    };
}

// Create keyboard for Airdrops
function getAirdropsKeyboard(missions) {
    const keyboard = [];
    
    missions.forEach(mission => {
        keyboard.push([{
            text: `${mission.title}`,
            callback_data: `mission_${mission.id}`
        }]);
    });
    
    keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]);
    
    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

// Create keyboard for Profile
function getProfileKeyboard(userId) {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔗 Generate Referral Link', callback_data: 'generate_referral' }],
                [{ text: '📊 My Statistics', callback_data: 'my_stats' }],
                [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
            ]
        }
    };
}

// Check tap cooldown
function checkTapCooldown(lastTapTime, cooldownMs = 1000) {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;
    return timeSinceLastTap >= cooldownMs;
}

// Create welcome message
function getWelcomeMessage(firstName) {
    return `
${EMOJIS.tada} **Welcome to SpudVerse!** ${EMOJIS.potato}

Hello ${firstName}! You've joined the most amazing potato universe! 

${EMOJIS.farm} **Farm**: Tap potatoes to harvest SPUD coins
${EMOJIS.gift} **Airdrops**: Complete missions to earn rewards
${EMOJIS.trophy} **Leaderboard**: Check top farmers ranking
${EMOJIS.profile} **Profile**: View profile and invite friends

Let's start farming right now! ${EMOJIS.potato}${EMOJIS.fire}
`;
}

// Create farm message
function getFarmMessage(balance, lastTap = null) {
    let message = `
${EMOJIS.farm} **POTATO FARM** ${EMOJIS.potato}

${EMOJIS.coin} **Current Balance**: ${formatNumber(balance)} SPUD

${EMOJIS.potato} Tap the button below to farm!
Each tap = +1 SPUD ${EMOJIS.fire}
`;

    if (lastTap) {
        message += `\n${EMOJIS.star} You just earned +1 SPUD!`;
    }

    return message;
}

// Create leaderboard message
function getLeaderboardMessage(leaderboard, userRank = null, userBalance = 0) {
    let message = `
${EMOJIS.trophy} **TOP POTATO FARMERS** ${EMOJIS.crown}

`;

    leaderboard.forEach((user, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const username = user.username ? `@${user.username}` : user.first_name || 'Anonymous';
        message += `${medal} ${username}: ${formatNumber(user.balance)} SPUD\n`;
    });

    if (userRank && userRank > 10) {
        message += `\n...\n${userRank}. You: ${formatNumber(userBalance)} SPUD`;
    }

    return message;
}

// Create profile message
function getProfileMessage(user, referralCount) {
    return `
${EMOJIS.profile} **POTATO PROFILE** ${EMOJIS.potato}

👤 **Name**: ${user.first_name} ${user.last_name || ''}
${user.username ? `📧 **Username**: @${user.username}` : ''}
${EMOJIS.coin} **Balance**: ${formatNumber(user.balance)} SPUD
👥 **Invited**: ${referralCount} friends
📅 **Joined**: ${new Date(user.created_at * 1000).toLocaleDateString('en-US')}

${EMOJIS.rocket} Invite friends to earn more SPUD!
`;
}

// Create airdrops message
function getAirdropsMessage(missions, userMissions = []) {
    let message = `
${EMOJIS.gift} **POTATO AIRDROPS** ${EMOJIS.money}

Complete missions to earn SPUD rewards!

`;

    missions.forEach(mission => {
        const userMission = userMissions.find(um => um.mission_id === mission.id);
        let status = '⏳ Not completed';
        
        if (userMission) {
            if (userMission.claimed) {
                status = '✅ Reward claimed';
            } else if (userMission.completed) {
                status = '🎁 Ready to claim';
            }
        }

        message += `
🎯 **${mission.title}**
📝 ${mission.description}
💰 Reward: ${formatNumber(mission.reward)} SPUD
📊 Status: ${status}

`;
    });

    return message;
}

// Generate referral link
function generateReferralLink(botUsername, userId) {
    return `https://t.me/${botUsername}?start=${userId}`;
}

// Parse referral code from start parameter
function parseReferralCode(startParam) {
    if (!startParam) return null;
    const referrerId = parseInt(startParam);
    return isNaN(referrerId) ? null : referrerId;
}

// Parse user info from Telegram Mini App auth data
function getUserInfoFromRequest(req) {
    try {
        // Check for auth header
        const initData = req.headers['x-telegram-init-data'];
        if (!initData) {
            console.log('❌ No Telegram init data found in headers');
            return null;
        }

        // Parse the URL-encoded init data
        const searchParams = new URLSearchParams(initData);
        const dataString = searchParams.get('user') || '{}';
        const user = JSON.parse(dataString);

        if (!user.id) {
            console.log('❌ No user ID found in init data');
            return null;
        }

        return {
            userId: user.id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name
        };
    } catch (error) {
        console.error('Error parsing user info:', error);
        return null;
    }
}

module.exports = {
    EMOJIS,
    formatNumber,
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
    getUserInfoFromRequest
};
