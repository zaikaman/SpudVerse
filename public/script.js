// SpudVerse Mini App JavaScript - Meme & Fun Gaming Experience

class SpudVerse {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.user = null;
        this.gameData = {
            balance: 0,
            energy: 100,
            maxEnergy: 100,
            perTap: 1,
            streak: 0,
            combo: 1,
            totalFarmed: 0,
            referrals: 0,
            missions: [],
            achievements: []
        };
        this.currentTab = 'farm';
        this.tapCount = 0;
        this.lastTapTime = 0;
        this.energyRegenInterval = null;
        
        this.init();
    }

    async init() {
        console.log('🥔 Initializing SpudVerse...');
        
        // Initialize Telegram WebApp
        this.initTelegram();
        
        // Show loading screen
        await this.showLoading();
        
        // Load user data
        await this.loadUserData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Start energy regeneration
        this.startEnergyRegen();
        
        // Hide loading and show game
        this.hideLoading();
        
        console.log('🚀 SpudVerse ready!');
    }

    initTelegram() {
        if (this.tg) {
            this.tg.ready();
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            // Set theme colors
            this.tg.setHeaderColor('#667eea');
            this.tg.setBackgroundColor('#667eea');
            
            // Get user data
            this.user = this.tg.initDataUnsafe?.user;
            console.log('👤 User:', this.user);
        } else {
            console.log('🔧 Running in development mode');
            // Mock user for development
            this.user = {
                id: 12345,
                first_name: 'Potato',
                last_name: 'Farmer',
                username: 'potato_master'
            };
        }
    }

    async showLoading() {
        return new Promise(resolve => {
            // Add some fun loading text variations
            const loadingTexts = [
                'Planting potatoes...',
                'Watering the farm...',
                'Summoning potato spirits...',
                'Calculating SPUD magic...',
                'Loading memes...',
                'Preparing epic rewards...'
            ];
            
            let index = 0;
            const interval = setInterval(() => {
                document.querySelector('.loading-subtitle').textContent = 
                    loadingTexts[index] + ' 🌱';
                index = (index + 1) % loadingTexts.length;
            }, 500);
            
            setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, 3000);
        });
    }

    hideLoading() {
        const loading = document.getElementById('loading');
        const game = document.getElementById('game');
        
        loading.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => {
            loading.style.display = 'none';
            game.style.display = 'block';
            game.style.animation = 'fadeIn 0.5s ease';
        }, 500);
    }

    async loadUserData() {
        try {
            // In a real app, this would fetch from your backend API
            const response = await this.apiCall('/api/user', 'GET');
            
            if (response.success) {
                this.gameData = { ...this.gameData, ...response.data };
            }
        } catch (error) {
            console.log('📡 Using local data');
            // Use local storage for development
            const savedData = localStorage.getItem('spudverse_data');
            if (savedData) {
                this.gameData = { ...this.gameData, ...JSON.parse(savedData) };
            }
        }
        
        this.updateUI();
    }

    setupEventListeners() {
        // Navigation tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Mega potato tap
        const megaPotato = document.getElementById('mega-potato');
        megaPotato.addEventListener('click', (e) => this.handlePotatoTap(e));
        
        // Add touch events for better mobile experience
        megaPotato.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handlePotatoTap(e);
        });

        // Profile actions
        document.getElementById('share-referral').addEventListener('click', () => {
            this.shareReferralLink();
        });

        document.getElementById('view-achievements').addEventListener('click', () => {
            this.showAchievements();
        });

        // Modal close
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModal();
            });
        });

        // Prevent context menu on potato
        megaPotato.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Show corresponding content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Load tab-specific data
        switch (tabName) {
            case 'airdrops':
                this.loadMissions();
                break;
            case 'leaderboard':
                this.loadLeaderboard();
                break;
            case 'profile':
                this.updateProfile();
                break;
        }

        // Add haptic feedback
        this.vibrate();
    }

    async handlePotatoTap(event) {
        if (this.gameData.energy <= 0) {
            this.showToast('⚡ No energy left! Wait for regeneration.', 'warning');
            this.shakeElement(document.getElementById('mega-potato'));
            return;
        }

        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastTapTime;

        // Combo system
        if (timeDiff < 500) {
            this.gameData.combo = Math.min(this.gameData.combo + 0.1, 3);
        } else if (timeDiff > 2000) {
            this.gameData.combo = 1;
        }

        // Calculate earned SPUD
        const earnedSpud = Math.floor(this.gameData.perTap * this.gameData.combo);
        this.gameData.balance += earnedSpud;
        this.gameData.totalFarmed += earnedSpud;
        this.gameData.energy = Math.max(0, this.gameData.energy - 1);
        this.tapCount++;
        this.lastTapTime = currentTime;

        // Visual effects
        this.createTapEffect(event, earnedSpud);
        this.animatePotato();
        this.createFloatingSpud(event, earnedSpud);

        // Update UI
        this.updateBalance();
        this.updateFarmStats();
        this.updateEnergyBar();

        // Check achievements
        this.checkAchievements();

        // Haptic feedback
        this.vibrate();

        // Save progress
        this.saveProgress();

        // Send tap to backend
        this.apiCall('/api/tap', 'POST', { amount: earnedSpud });
    }

    createTapEffect(event, amount) {
        const tapEffect = document.getElementById('tap-effect');
        const effectText = document.createElement('div');
        effectText.className = 'tap-effect-text';
        effectText.textContent = `+${amount} SPUD 🔥`;
        effectText.style.cssText = `
            position: absolute;
            font-weight: 700;
            font-size: 1.2rem;
            color: #ff6b35;
            pointer-events: none;
            z-index: 20;
            animation: tapEffect 1s ease-out forwards;
        `;

        // Add CSS animation if not exists
        if (!document.querySelector('#tap-effect-style')) {
            const style = document.createElement('style');
            style.id = 'tap-effect-style';
            style.textContent = `
                @keyframes tapEffect {
                    0% { transform: translateY(0) scale(1); opacity: 1; }
                    100% { transform: translateY(-50px) scale(1.2); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        tapEffect.appendChild(effectText);

        setTimeout(() => {
            effectText.remove();
        }, 1000);
    }

    animatePotato() {
        const potato = document.querySelector('.potato-main');
        potato.style.transform = 'scale(0.95)';
        potato.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.3)) brightness(1.2)';
        
        setTimeout(() => {
            potato.style.transform = 'scale(1)';
            potato.style.filter = 'drop-shadow(0 8px 16px rgba(0,0,0,0.3))';
        }, 100);
    }

    createFloatingSpud(event, amount) {
        const container = document.getElementById('floating-spuds');
        const spud = document.createElement('div');
        spud.className = 'floating-spud';
        spud.textContent = '🥔 +' + amount;
        
        // Position based on click/touch location
        const rect = event.target.getBoundingClientRect();
        spud.style.left = (rect.left + Math.random() * rect.width) + 'px';
        spud.style.top = rect.top + 'px';
        
        container.appendChild(spud);
        
        setTimeout(() => spud.remove(), 2000);
    }

    updateBalance() {
        document.getElementById('balance').textContent = this.formatNumber(this.gameData.balance);
    }

    updateFarmStats() {
        document.getElementById('per-tap').textContent = this.gameData.perTap;
        document.getElementById('total-farmed').textContent = this.formatNumber(this.gameData.totalFarmed);
        document.getElementById('combo').textContent = this.gameData.combo.toFixed(1);
        document.getElementById('streak').textContent = this.gameData.streak;
    }

    updateEnergyBar() {
        const percentage = (this.gameData.energy / this.gameData.maxEnergy) * 100;
        document.getElementById('energy-fill').style.width = percentage + '%';
        document.getElementById('energy').textContent = this.gameData.energy;
    }

    startEnergyRegen() {
        this.energyRegenInterval = setInterval(() => {
            if (this.gameData.energy < this.gameData.maxEnergy) {
                this.gameData.energy = Math.min(this.gameData.maxEnergy, this.gameData.energy + 1);
                this.updateEnergyBar();
            }
        }, 3000); // Regenerate 1 energy every 3 seconds
    }

    updateUI() {
        // Update header
        if (this.user) {
            document.getElementById('username').textContent = 
                this.user.first_name + (this.user.last_name ? ' ' + this.user.last_name : '');
        }

        // Update all stats
        this.updateBalance();
        this.updateFarmStats();
        this.updateEnergyBar();
    }

    async loadMissions() {
        try {
            const response = await this.apiCall('/api/missions', 'GET');
            if (response.success) {
                this.gameData.missions = response.data;
            }
        } catch (error) {
            // Mock missions for development
            this.gameData.missions = [
                {
                    id: 1,
                    title: '🎉 Welcome to SpudVerse',
                    description: 'Complete account registration',
                    reward: 100,
                    status: 'completed',
                    claimed: true
                },
                {
                    id: 2,
                    title: '📢 Join Telegram Channel',
                    description: 'Join our official channel @spudverse_channel',
                    reward: 250,
                    status: 'pending',
                    claimed: false
                },
                {
                    id: 3,
                    title: '🐦 Follow Twitter',
                    description: 'Follow @SpudVerse on Twitter',
                    reward: 200,
                    status: 'pending',
                    claimed: false
                },
                {
                    id: 4,
                    title: '👥 Invite 5 Friends',
                    description: 'Invite 5 friends to join SpudVerse',
                    reward: 500,
                    status: 'pending',
                    claimed: false
                }
            ];
        }

        this.renderMissions();
    }

    renderMissions() {
        const container = document.getElementById('missions-container');
        container.innerHTML = '';

        this.gameData.missions.forEach(mission => {
            const missionCard = document.createElement('div');
            missionCard.className = 'mission-card';
            
            let statusText, statusClass, buttonText, buttonClass, buttonAction;
            
            if (mission.claimed) {
                statusText = '✅ Reward claimed';
                statusClass = 'completed';
                buttonText = '✅ Completed';
                buttonClass = 'claimed';
                buttonAction = '';
            } else if (mission.status === 'completed') {
                statusText = '🎁 Ready to claim';
                statusClass = 'completed';
                buttonText = '🎁 Claim Reward';
                buttonClass = 'claim';
                buttonAction = `onclick="spudverse.claimMission(${mission.id})"`;
            } else {
                statusText = '⏳ Not completed';
                statusClass = 'pending';
                buttonText = '▶️ Start Mission';
                buttonClass = 'complete';
                buttonAction = `onclick="spudverse.startMission(${mission.id})"`;
            }

            missionCard.innerHTML = `
                <div class="mission-header">
                    <div>
                        <div class="mission-title">${mission.title}</div>
                        <div class="mission-desc">${mission.description}</div>
                    </div>
                    <div class="mission-reward">+${this.formatNumber(mission.reward)} SPUD</div>
                </div>
                <div class="mission-footer">
                    <div class="mission-status ${statusClass}">${statusText}</div>
                    <button class="mission-btn ${buttonClass}" ${buttonAction}>${buttonText}</button>
                </div>
            `;

            container.appendChild(missionCard);
        });
    }

    async startMission(missionId) {
        const mission = this.gameData.missions.find(m => m.id === missionId);
        if (!mission) return;

        // Handle different mission types
        switch (missionId) {
            case 2: // Join Telegram Channel
                if (this.tg) {
                    this.tg.openTelegramLink('https://t.me/spudverse_channel');
                } else {
                    window.open('https://t.me/spudverse_channel', '_blank');
                }
                break;
            case 3: // Follow Twitter
                window.open('https://twitter.com/SpudVerse', '_blank');
                break;
            case 4: // Invite Friends
                this.shareReferralLink();
                break;
        }

        // Mark as completed (in a real app, you'd verify this)
        setTimeout(() => {
            mission.status = 'completed';
            this.renderMissions();
            this.showToast('🎉 Mission completed! You can now claim your reward.', 'success');
        }, 2000);
    }

    async claimMission(missionId) {
        const mission = this.gameData.missions.find(m => m.id === missionId);
        if (!mission || mission.claimed || mission.status !== 'completed') return;

        try {
            const response = await this.apiCall('/api/missions/claim', 'POST', { missionId });
            
            mission.claimed = true;
            this.gameData.balance += mission.reward;
            
            this.updateBalance();
            this.renderMissions();
            
            this.showToast(`🎉 You earned ${this.formatNumber(mission.reward)} SPUD!`, 'success');
            this.confettiEffect();
            this.vibrate();
            
        } catch (error) {
            // Handle locally for development
            mission.claimed = true;
            this.gameData.balance += mission.reward;
            this.updateBalance();
            this.renderMissions();
            this.showToast(`🎉 You earned ${this.formatNumber(mission.reward)} SPUD!`, 'success');
            this.saveProgress();
        }
    }

    async loadLeaderboard() {
        try {
            const response = await this.apiCall('/api/leaderboard', 'GET');
            if (response.success) {
                this.renderLeaderboard(response.data);
            }
        } catch (error) {
            // Mock leaderboard for development
            const mockLeaderboard = [
                { rank: 1, name: 'Potato King 👑', balance: 50000, level: '🌟 Legend' },
                { rank: 2, name: 'Spud Master', balance: 35000, level: '🔥 Pro' },
                { rank: 3, name: 'Farm Hero', balance: 28000, level: '⭐ Expert' },
                { rank: 4, name: 'Crop Champion', balance: 22000, level: '🌱 Advanced' },
                { rank: 5, name: 'Tater Lover', balance: 18000, level: '🥔 Skilled' },
                { rank: 6, name: 'Potato Fan', balance: 15000, level: '🌿 Regular' },
                { rank: 7, name: 'Spud Newbie', balance: 12000, level: '🌱 Beginner' },
                { rank: 8, name: 'Farm Rookie', balance: 8000, level: '🌱 Starter' },
                { rank: 9, name: 'Crop Cadet', balance: 5000, level: '🌱 Novice' },
                { rank: 10, name: 'Potato Pal', balance: 3000, level: '🌱 Amateur' }
            ];
            this.renderLeaderboard(mockLeaderboard);
        }
    }

    renderLeaderboard(leaderboard) {
        const container = document.getElementById('leaderboard-container');
        container.innerHTML = '';

        leaderboard.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = `leaderboard-item ${index < 3 ? 'top-3' : ''}`;
            
            let rankClass = 'regular';
            if (index === 0) rankClass = 'gold';
            else if (index === 1) rankClass = 'silver';
            else if (index === 2) rankClass = 'bronze';

            item.innerHTML = `
                <div class="rank-info">
                    <div class="rank-number ${rankClass}">${player.rank}</div>
                    <div class="player-info">
                        <div class="player-name">${player.name}</div>
                        <div class="player-level">${player.level}</div>
                    </div>
                </div>
                <div class="player-score">${this.formatNumber(player.balance)} SPUD</div>
            `;

            container.appendChild(item);
        });

        // Update user's rank
        document.getElementById('user-rank').textContent = '42'; // Mock rank
        document.getElementById('user-balance-rank').textContent = this.formatNumber(this.gameData.balance);
    }

    updateProfile() {
        if (this.user) {
            document.getElementById('profile-name').textContent = 
                this.user.first_name + (this.user.last_name ? ' ' + this.user.last_name : '');
        }
        
        document.getElementById('profile-balance').textContent = this.formatNumber(this.gameData.balance);
        document.getElementById('profile-referrals').textContent = this.gameData.referrals;
        document.getElementById('profile-missions').textContent = 
            this.gameData.missions.filter(m => m.claimed).length;
        
        const joinDate = new Date().toLocaleDateString();
        document.getElementById('join-date').textContent = joinDate;
        document.getElementById('best-streak').textContent = Math.max(this.gameData.streak, 7); // Mock
    }

    shareReferralLink() {
        const userId = this.user?.id || 12345;
        const referralLink = `https://t.me/spudverse_bot?start=${userId}`;
        const shareText = `🥔 Join me in SpudVerse! 🌱\n\nTap potatoes, earn SPUD coins, and become a farming legend!\n\nYou'll get 50 SPUD just for joining: ${referralLink}`;

        if (this.tg) {
            this.tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`);
        } else if (navigator.share) {
            navigator.share({
                title: 'Join SpudVerse!',
                text: shareText,
                url: referralLink
            });
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(shareText + '\n' + referralLink).then(() => {
                this.showToast('📋 Referral link copied to clipboard!', 'success');
            });
        }
    }

    showAchievements() {
        // Show achievement modal with mock data
        const modal = document.getElementById('achievement-modal');
        modal.style.display = 'block';
        
        // Add click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    checkAchievements() {
        // Check for achievements based on current stats
        const achievements = [
            { threshold: 100, title: 'First Century!', desc: 'Earned 100 SPUD!' },
            { threshold: 1000, title: 'Thousand Club!', desc: 'Earned 1,000 SPUD!' },
            { threshold: 10000, title: 'Ten Thousand Legend!', desc: 'Earned 10,000 SPUD!' }
        ];

        achievements.forEach(achievement => {
            if (this.gameData.balance >= achievement.threshold && 
                !this.gameData.achievements.includes(achievement.threshold)) {
                
                this.gameData.achievements.push(achievement.threshold);
                this.showAchievementUnlocked(achievement);
            }
        });
    }

    showAchievementUnlocked(achievement) {
        // Update modal content
        document.querySelector('.achievement-title').textContent = achievement.title;
        document.querySelector('.achievement-desc').textContent = achievement.desc;
        
        // Show modal
        const modal = document.getElementById('achievement-modal');
        modal.style.display = 'block';
        
        // Confetti effect
        this.confettiEffect();
        this.vibrate();
    }

    confettiEffect() {
        // Create confetti particles
        const colors = ['🎉', '🎊', '✨', '🌟', '💫', '🎈'];
        const container = document.body;

        for (let i = 0; i < 20; i++) {
            const confetti = document.createElement('div');
            confetti.textContent = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.cssText = `
                position: fixed;
                top: -10px;
                left: ${Math.random() * 100}%;
                font-size: 1.5rem;
                z-index: 9999;
                pointer-events: none;
                animation: confettiFall ${2 + Math.random() * 2}s ease-out forwards;
            `;
            
            container.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 4000);
        }

        // Add confetti animation if not exists
        if (!document.querySelector('#confetti-style')) {
            const style = document.createElement('style');
            style.id = 'confetti-style';
            style.textContent = `
                @keyframes confettiFall {
                    0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);

        // Add slide out animation if not exists
        if (!document.querySelector('#toast-style')) {
            const style = document.createElement('style');
            style.id = 'toast-style';
            style.textContent = `
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    shakeElement(element) {
        element.classList.add('shake');
        setTimeout(() => element.classList.remove('shake'), 500);
    }

    vibrate() {
        if (this.tg && this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('medium');
        } else if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    formatNumber(num) {
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    saveProgress() {
        localStorage.setItem('spudverse_data', JSON.stringify(this.gameData));
    }

    async apiCall(endpoint, method = 'GET', data = null) {
        const baseUrl = window.location.origin;
        const url = baseUrl + endpoint;
        
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (this.tg && this.tg.initData) {
            options.headers['Authorization'] = `tma ${this.tg.initData}`;
        }

        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        return await response.json();
    }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.spudverse = new SpudVerse();
});
