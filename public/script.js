// SpudVerse Mini App JavaScript - Meme & Fun Gaming Experience

class SpudVerse {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.user = null;
        this.gameData = {
            balance: null,
            energy: null,
            maxEnergy: null,
            energyRegenRate: null,
            timeToFull: 0,
            perTap: null,
            streak: null,
            combo: 1,
            level: null,
            totalFarmed: null,
            referrals: null,
            missions: [],
            achievements: [],
            sph: null,
            items: []
        };
        this.currentTab = 'farm';
        this.tapCount = 0;
        this.lastTapTime = 0;
        this.energyRegenInterval = null;
        
        // Batch tap processing
        this.pendingTaps = 0;
        this.lastSyncTime = Date.now();
        this.syncInterval = 2000; // Sync every 2 seconds
        
        // Achievement tracking
        this.userAchievements = []; // Store unlocked achievement IDs
        
        // Local energy regeneration tracking
        this.lastEnergyUpdate = Date.now();
        this.localRegenTimer = null;

        this.levels = [
            { level: 1, requiredFarmed: 0, perTapBonus: 1, maxEnergyBonus: 100, title: 'Spud Starter 🌱' },
            { level: 2, requiredFarmed: 1000, perTapBonus: 2, maxEnergyBonus: 150, title: 'Tater Tot 🥔' },
            { level: 3, requiredFarmed: 5000, perTapBonus: 3, maxEnergyBonus: 200, title: 'Farm Hand 🧑‍🌾' },
            { level: 4, requiredFarmed: 15000, perTapBonus: 5, maxEnergyBonus: 250, title: 'Crop Captain 🚀' },
            { level: 5, requiredFarmed: 50000, perTapBonus: 8, maxEnergyBonus: 350, title: 'Potato Baron 👑' },
            { level: 6, requiredFarmed: 150000, perTapBonus: 12, maxEnergyBonus: 500, title: 'Spud-nik Explorer 🧑‍🚀' },
            { level: 7, requiredFarmed: 500000, perTapBonus: 20, maxEnergyBonus: 750, title: 'Legendary Spud Master 🌟' }
        ];

        this.shopItems = []; // Will be loaded from API when Shop tab is opened
        
        this.init();
    }

    getCurrentLevelInfo() {
        return this.levels.find(l => l.level === this.gameData.level) || this.levels[0];
    }

    getNextLevelInfo() {
        return this.levels.find(l => l.level === this.gameData.level + 1);
    }

    getLevelTitle(level) {
        if (level === null || level === undefined) return 'Spud Follower';
        const levelInfo = this.levels.find(l => l.level === level);
        return levelInfo ? levelInfo.title : 'Spud Follower';
    }

    async checkForLevelUp() {
        const nextLevel = this.getNextLevelInfo();
        if (!nextLevel || this.gameData.totalFarmed < nextLevel.requiredFarmed) {
            return;
        }

        // Ensure we have a valid user ID
        if (!this.user?.id) {
            console.error('Cannot level up: No user ID available');
            return;
        }

        try {
            // Call backend to securely level up the user with necessary data
            const response = await this.apiCall('/api/user/level-up', 'POST', {
                userId: this.user.id,
                currentLevel: this.gameData.level,
                totalFarmed: this.gameData.totalFarmed
            });

            if (response && response.success) {
                // Log level up details
                console.log('🎉 Level up successful:', {
                    oldLevel: this.gameData.level,
                    newLevel: response.data.level,
                    oldPerTap: this.gameData.perTap,
                    newPerTap: response.data.per_tap
                });

                // Update game data with the new values from the server
                this.gameData.level = response.data.level;
                this.gameData.perTap = response.data.per_tap;
                this.gameData.maxEnergy = response.data.max_energy;
                this.gameData.energy = response.data.energy; // Energy is refilled on level up
                if (response.data.energy_regen_rate) {
                    this.gameData.energyRegenRate = response.data.energy_regen_rate;
                }

                // Update UI and show effects
                this.updateUI();
                this.showToast(`🎉 Level Up! You are now Level ${response.data.level}: ${this.getCurrentLevelInfo().title}`, 'success');
                this.confettiEffect();

                // Check again in case of multiple level ups
                await this.checkForLevelUp();
            } else {
                // Log error if level up failed on the backend
                console.error('Level up failed on server:', response?.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error calling level-up API:', error);
            // this.showToast('Could not sync level up. Please try again.', 'error');
        }
    }

    async init() {
        try {
            console.log('🥔 Initializing SpudVerse...');
            
            // Initialize Telegram WebApp
            this.initTelegram();

            // Add a check to ensure Telegram data is ready before proceeding
            if (this.tg && !this.tg.initData) {
                console.log('⏳ Waiting for Telegram initData to be available...');
                await new Promise((resolve) => {
                    let attempts = 0;
                    const maxAttempts = 50; // 5 seconds timeout
                    const interval = setInterval(() => {
                        if (this.tg.initData) {
                            clearInterval(interval);
                            console.log('✅ Telegram initData is now available.');
                            // Re-initialize user info now that we have data
                            this.user = this.tg.initDataUnsafe?.user;
                            this.referrerId = this.tg.initDataUnsafe?.start_param || null;
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            clearInterval(interval);
                            console.warn('⚠️ Timed out waiting for Telegram initData.');
                            resolve(); // Resolve anyway to not block the app
                        }
                        attempts++;
                    }, 100); // Check every 100ms
                });
            }
            
            // Show loading screen
            await this.showLoading();
            
            // Load user data
            await this.loadUserData();
            
            // Load user achievements 
            await this.loadUserAchievements();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Start energy regeneration
            this.startEnergyRegen();
            
            // Start SPH interval
            this.startSPHInterval();

            // Update the UI with all loaded data before showing the game
            this.updateUI();

            // Hide loading and show game
            this.hideLoading();
            
            // Set up global error handlers for debugging
            this.setupGlobalErrorHandlers();
            
            console.log('🚀 SpudVerse ready!');
        } catch (error) {
            console.error('💥 SpudVerse initialization failed:', error);
            
            // Show error to user
            const loading = document.getElementById('loading');
            if (loading) {
                loading.innerHTML = `
                    <div class="potato-loader">
                        <div class="potato-bounce">😵</div>
                        <div class="loading-text">Oops! Something went wrong</div>
                        <div class="loading-subtitle">Please refresh the page 🔄</div>
                        <button onclick="window.location.reload()" style="
                            margin-top: 20px;
                            padding: 10px 20px;
                            background: #ff6b35;
                            color: white;
                            border: none;
                            border-radius: 10px;
                            cursor: pointer;
                            font-family: 'Comic Neue', cursive;
                            font-weight: 600;
                        ">🔄 Reload Game</button>
                    </div>
                `;
            }
        }
    }

    initTelegram() {
        if (this.tg) {
            this.tg.ready();
            this.tg.expand();
            this.tg.enableClosingConfirmation();
            
            // Set theme colors
            this.tg.setHeaderColor('#E1F5FE');
            this.tg.setBackgroundColor('#E1F5FE');
            
            // Get user data
            this.user = this.tg.initDataUnsafe?.user;
            
            // Extract referral ID from start_param
            this.referrerId = this.tg.initDataUnsafe?.start_param || null;
            
            // Debug logging for referral
            console.log('🔍 Telegram WebApp Debug:', {
                initDataUnsafe: this.tg.initDataUnsafe,
                user: this.user,
                start_param: this.tg.initDataUnsafe?.start_param,
                referrerId: this.referrerId,
                initData: this.tg.initData
            });
            
            console.log('👤 User:', this.user);
            console.log('🔗 Referral ID:', this.referrerId);
        } else {
            console.log('🔧 Running in development mode');
            
            // Check URL for referral parameter (for development/testing)
            const urlParams = new URLSearchParams(window.location.search);
            this.referrerId = urlParams.get('ref') || urlParams.get('referrerId');
            
            // Mock user for development
            this.user = {
                id: 12345,
                first_name: 'Potato',
                last_name: 'Farmer',
                username: 'potato_master'
            };
            
            console.log('🔧 Development mode - Referral ID from URL:', this.referrerId);
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
                const subtitle = document.querySelector('.loading-subtitle');
                if (subtitle) {
                    subtitle.textContent = loadingTexts[index] + ' 🌱';
                }
                index = (index + 1) % loadingTexts.length;
            }, 500);
            
            // Reduced loading time to 2 seconds
            setTimeout(() => {
                clearInterval(interval);
                console.log('⏰ Loading completed');
                resolve();
            }, 2000);
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
        console.log('🔄 Loading user data from Supabase...');
        
        try {
            console.log('📤 Making API call to /api/user...');
            const response = await this.apiCall('/api/user', 'GET');
            console.log('📥 API Response:', response);
            
            // Add specific 404 check
            if (response?.status === 404 || response?.statusCode === 404) {
                console.log('🆕 New user detected (404 response), showing welcome modal');
                await this.showWelcomeModal();
                return;
            }
            
            if (response && response.success) {
                console.log('✅ Supabase data loaded successfully:', response.data);
                
                // Map Supabase data to gameData structure
                this.gameData.balance = response.data.balance ?? 0;
                this.gameData.energy = response.data.energy ?? 100;
                this.gameData.maxEnergy = response.data.maxEnergy ?? 100;
                this.gameData.energyRegenRate = response.data.energyRegenRate ?? 1;
                this.gameData.perTap = response.data.perTap ?? 1;
                this.gameData.level = response.data.level ?? 1;
                this.gameData.totalFarmed = response.data.totalFarmed ?? 0;
                this.gameData.sph = response.data.sph ?? 0;
                this.gameData.items = response.data.items ?? [];
                
                // Make sure to update UI with new perTap value
                this.updateFarmStats();
                this.gameData.streak = response.data.streak ?? 0;
                this.gameData.bestStreak = response.data.bestStreak ?? 0;

                this.lastEnergyUpdate = Date.now();
            } else {
                // Additional check for user not found in error message
                if (response?.error?.toLowerCase?.()?.includes('not found')) {
                    console.log('🆕 New user detected (error message), showing welcome modal');
                    await this.showWelcomeModal();
                    return;
                }
                
                console.warn('⚠️ Could not load user data from Supabase, falling back to mock data.', response?.error);
                this.useMockData();
            }
        } catch (error) {
        console.error('❌ API call to /api/user failed:', error);
        this.showToast('Could not connect to the server. Using offline mode.', 'error');
        this.useMockData();
    }
}    async loadUserAchievements() {
        try {
            console.log('🏆 Loading user achievements...');
            
            const response = await this.apiCall('/api/achievements', 'GET');
            
            if (response && response.success) {
                // Store unlocked achievement IDs
                this.userAchievements = response.data
                    .filter(ach => ach.unlocked)
                    .map(ach => ach.id);
                    
                console.log('✅ Loaded achievements:', this.userAchievements.length, 'unlocked');
            } else {
                console.warn('⚠️ Failed to load achievements from API');
                this.userAchievements = [];
            }
        } catch (error) {
            console.error('❌ Failed to load achievements:', error);
            this.userAchievements = [];
        }
    }

    useMockData() {
        // Use mock data when API fails or for development
        console.log('📦 Using default mock data as fallback.');
        this.gameData = {
            ...this.gameData,
            balance: 0,
            energy: 100,
            maxEnergy: 100,
            perTap: 1,
            streak: 0,
            combo: 1,
            totalFarmed: 0,
            referrals: 0,
            sph: 0,
            items: []
        };
        console.log('📦 Mock data loaded:', this.gameData);
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

        // Shop sub-tabs
        document.querySelectorAll('.shop-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.shop-nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const subtab = btn.dataset.subtab;
                document.querySelectorAll('.sub-tab-content').forEach(st => st.classList.remove('active'));
                document.getElementById(subtab + '-tab').classList.add('active');
            });
        });

        // Item shop category tabs
        document.querySelectorAll('.item-shop-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.item-shop-nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const category = btn.dataset.itemCategory;
                document.querySelectorAll('.item-category-content').forEach(cc => cc.classList.remove('active'));
                const categoryId = 'item-category-' + category.replace(/ /g, '-');
                document.getElementById(categoryId).classList.add('active');
                this.loadShopItems();
            });
        });
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
            case 'shop':
                this.loadUpgrades();
                this.loadShopItems();
                break;
            case 'upgrades':
                this.loadUpgrades();
                break;
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

        // Always consume 1 energy per tap, regardless of SPUD earned
        if (this.gameData.energy < 1) {
            this.showToast('⚡ No energy left! Wait for regeneration.', 'warning');
            return;
        }
        
        // Reduce 1 energy per tap
        this.gameData.energy = Math.max(0, this.gameData.energy - 1);

        // Calculate earned SPUD (this doesn't affect energy consumption)
        const earnedSpud = Math.floor(this.gameData.perTap * this.gameData.combo);
        this.gameData.balance += earnedSpud;
        this.gameData.totalFarmed += earnedSpud;
        
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

        // Check for level up
        this.checkForLevelUp();

        // Save progress
        this.saveProgress();

        // Add to pending taps for batch processing
        // Track actual tap count for energy consumption
        this.pendingTaps += 1; // Only count 1 tap regardless of SPUD earned
        this.scheduleTapSync();
    }

    createTapEffect(event, amount) {
        const tapEffect = document.getElementById('tap-effect');
        const effectText = document.createElement('div');
        effectText.className = 'tap-effect-text';
        effectText.textContent = `+${amount} SPUD Points 🔥`;
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
        potato.src = 'sad_potato_astronaut.png'; // Change to sad potato
        potato.style.transform = 'scale(0.95)';
        potato.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.3)) brightness(1.2)';
        
        setTimeout(() => {
            potato.src = 'potato_astronaut.png'; // Change back to normal
            potato.style.transform = 'scale(1)';
            potato.style.filter = 'drop-shadow(0 8px 16px rgba(0,0,0,0.3))';
        }, 150); // A slightly longer delay to see the sad potato
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
        const balanceEl = document.getElementById('balance');
        if (this.gameData.balance === null) {
            balanceEl.textContent = '...';
        } else {
            balanceEl.textContent = this.formatNumber(this.gameData.balance);
        }
    }

    updateFarmStats() {
        document.getElementById('per-tap').textContent = this.gameData.perTap === null ? '...' : this.gameData.perTap;
        document.getElementById('combo').textContent = this.gameData.combo.toFixed(1);
        document.getElementById('streak').textContent = this.gameData.streak === null ? '...' : this.gameData.streak;
        
        const sphEl = document.getElementById('sph');
        if (this.gameData.sph === null) {
            sphEl.textContent = '...';
        } else {
            sphEl.textContent = this.formatNumber(this.gameData.sph);
        }
    }

    updateEnergyBar() {
        const energy = this.gameData.energy;
        const maxEnergy = this.gameData.maxEnergy;
        const percentage = (energy === null || maxEnergy === null || maxEnergy === 0) ? 100 : (energy / maxEnergy) * 100;
        
        const energyFill = document.getElementById('energy-fill');
        const energyText = document.getElementById('energy');
        
        if (energyFill) {
            energyFill.style.width = percentage + '%';
            
            // Color coding based on energy level
            if (percentage <= 20) {
                energyFill.style.background = 'linear-gradient(90deg, #ff4444, #ff6666)';
            } else if (percentage <= 50) {
                energyFill.style.background = 'linear-gradient(90deg, #ff8844, #ffaa66)';
            } else {
                energyFill.style.background = 'linear-gradient(90deg, #00ff88, #44ffaa)';
            }
        }
        
        if (energyText) {
            if (energy === null || maxEnergy === null) {
                energyText.textContent = `.../...`;
            } else {
                energyText.textContent = `${energy}/${maxEnergy}`;
                // Add regeneration timer if energy is not full
                if (energy < maxEnergy && this.gameData.timeToFull > 0) {
                    const timeText = this.formatTime(this.gameData.timeToFull);
                    energyText.textContent += ` (${timeText})`;
                }
            }
        }
    }

    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    startEnergyRegen() {
        // Clear any existing timers first
        this.stopEnergyRegen();
        
        // Start local UI updates (100ms)
        this.startLocalEnergyTimer();
        
        // Start backend sync (10 seconds)
        this.startBackendEnergySync();
        
        console.log('🔋 Energy regeneration system started');
    }

    startLocalEnergyTimer() {
        // Only update UI and time to full locally
        this.localRegenTimer = setInterval(() => {
            if (this.gameData.energy < this.gameData.maxEnergy) {
                const now = Date.now();
                const timePassed = now - this.lastEnergyUpdate;
                
                // Calculate time to full
                if (this.gameData.energy < this.gameData.maxEnergy) {
                    const energyNeeded = this.gameData.maxEnergy - this.gameData.energy;
                    const timeToNextEnergy = 10000 - (timePassed % 10000);
                    this.gameData.timeToFull = (energyNeeded - 1) * 10000 + timeToNextEnergy;
                } else {
                    this.gameData.timeToFull = 0;
                }
                
                // Only update UI, let backend handle actual energy regeneration
                this.updateEnergyBar();
            }
        }, 100); // Update UI every 100ms for smooth countdown
        
        console.log('⚡ Local energy UI updates started');
    }

    startBackendEnergySync() {
        if (this.gameData.balance === undefined || this.gameData.balance < 0) {
            console.log('⏸️ Skipping backend energy sync - user not loaded yet');
            return;
        }

        console.log('🔄 Starting backend energy sync for existing user');
        
        // Clear any existing sync interval
        if (this.energyRegenInterval) {
            clearInterval(this.energyRegenInterval);
        }
        
        // Initial sync
        this.syncEnergyWithBackend();
        
        // Then sync every 10 seconds
        this.energyRegenInterval = setInterval(() => this.syncEnergyWithBackend(), 10000);
    }
    
    async syncEnergyWithBackend() {
        try {
            const response = await this.apiCall('/api/energy', 'GET');
            if (response && response.success) {
                // Log energy state before update
                console.log('🔄 Energy sync:', {
                    previous: this.gameData.energy,
                    new: response.data.current_energy,
                    diff: response.data.current_energy - this.gameData.energy,
                    timestamp: new Date().toISOString()
                });
                
                // Only update if there's a significant difference
                if (Math.abs(this.gameData.energy - response.data.current_energy) > 1) {
                    this.gameData.energy = response.data.current_energy;
                    this.gameData.maxEnergy = response.data.max_energy;
                    this.gameData.energyRegenRate = response.data.energy_regen_rate;
                    this.lastEnergyUpdate = Date.now();
                    this.updateEnergyBar();
                }
            }
        } catch (error) {
            console.warn('⚠️ Backend energy sync failed:', error);
        }
    }

    stopEnergyRegen() {
        if (this.localRegenTimer) {
            clearInterval(this.localRegenTimer);
            this.localRegenTimer = null;
        }
        if (this.energyRegenInterval) {
            clearInterval(this.energyRegenInterval);
            this.energyRegenInterval = null;
        }
    }

    updateUI() {
        // Update header
        if (this.user) {
            document.getElementById('username').textContent = 
                this.user.first_name + (this.user.last_name ? ' ' + this.user.last_name : '');
        }

        const levelEl = document.querySelector('.level');
        if (this.gameData.level === null) {
            levelEl.innerHTML = 'Loading...';
        } else {
            const levelInfo = this.getCurrentLevelInfo();
            levelEl.innerHTML = `Level ${levelInfo.level} ${levelInfo.title}`;
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
            } else if (mission.status === 'verify') {
                statusText = '🔍 Ready to verify';
                statusClass = 'verify';
                buttonText = '🔍 Verify';
                buttonClass = 'verify';
                buttonAction = `onclick="spudverse.verifyChannelMission(${mission.id})"`;
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
                    <div class="mission-reward">+${this.formatNumber(mission.reward)} SPUD Points</div>
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
                    this.tg.openTelegramLink('https://t.me/spudverseann');
                } else {
                    window.open('https://t.me/spudverseann', '_blank');
                }
                
                this.showToast('📢 Join the channel, then tap "Verify" to complete!', 'info');
                
                // Change mission status to verify mode
                mission.status = 'verify';
                this.renderMissions();
                return; // Don't auto-complete this mission
                
            case 3: // Follow Twitter
                window.open('https://x.com/RealSpudVerse', '_blank');
                
                this.showToast('🐦 Follow @RealSpudVerse, then tap "Verify" to complete!', 'info');
                
                // Change mission status to verify mode
                mission.status = 'verify';
                this.renderMissions();
                return; // Don't auto-complete this mission
            case 4: // Invite Friends
                this.shareReferralLink();
                break;
        }

        // Auto-complete for non-channel missions (in a real app, you'd verify this)
        setTimeout(() => {
            mission.status = 'completed';
            this.renderMissions();
            this.showToast('🎉 Mission completed! You can now claim your reward.', 'success');
        }, 2000);
    }

    async handleTwitterVerification() {
        console.log('🐦 Frontend: Starting Twitter verification flow');
        
        try {
            // Check if user already has connected Twitter
            console.log('🔍 Frontend: Checking existing Twitter connection');
            const userTwitter = await this.checkUserTwitterConnection();
            console.log('🔍 Frontend: Existing Twitter connection:', userTwitter);
            
            if (!userTwitter) {
                console.log('🆕 Frontend: No existing Twitter connection, showing input dialog');
                
                // Show Twitter username input dialog
                const twitterUsername = await this.showTwitterInputDialog();
                console.log('📝 Frontend: User entered username:', twitterUsername);
                
                if (!twitterUsername) {
                    console.log('❌ Frontend: User cancelled Twitter input');
                    return; // User cancelled
                }
                
                // Connect Twitter username first
                console.log('🔗 Frontend: Attempting to connect Twitter username');
                const connectResult = await this.connectTwitterUsername(twitterUsername);
                console.log('🔗 Frontend: Connect result:', connectResult);
                
                if (!connectResult.success) {
                    console.error('❌ Frontend: Twitter connection failed:', connectResult.error);
                    this.showToast(connectResult.error || 'Failed to connect Twitter account', 'error');
                    return;
                }
                
                console.log('✅ Frontend: Twitter connection successful');
                this.showToast(`✅ Twitter account @${twitterUsername} connected!`, 'success');
            } else {
                console.log('✅ Frontend: Twitter already connected:', userTwitter.twitter_username);
            }
            
            // Now verify the follow
            console.log('🔍 Frontend: Starting follow verification');
            await this.verifyTwitterFollow();
            
        } catch (error) {
            console.error('❌ Frontend: Twitter verification error:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            this.showDebugError(error, 'Twitter Verification');
        }
    }

    async showTwitterInputDialog() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal">
                    <div class="modal-header">
                        <h3>🐦 Connect Twitter Account</h3>
                    </div>
                    <div class="modal-body">
                        <p style="color: var(--text-color); font-size: 16px; margin-bottom: 20px; line-height: 1.5;">
                            Enter your Twitter/X username to verify your follow:
                        </p>
                        <input type="text" id="twitter-username-input" placeholder="@username or username" 
                               style="width: 100%; padding: 16px; border: 2px solid #ddd; border-radius: 12px; font-size: 18px; 
                                      margin: 15px 0; background: white; color: #333; box-sizing: border-box;
                                      transition: border-color 0.3s ease; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <p style="font-size: 14px; color: var(--text-secondary); margin-top: 15px; line-height: 1.4;">
                            We'll check if you follow <strong style="color: var(--primary-color);">@RealSpudVerse</strong>
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" id="twitter-cancel-btn">Cancel</button>
                        <button class="btn-primary" id="twitter-connect-btn">Connect</button>
                    </div>
                </div>
            `;
            
            // Add to page
            document.body.appendChild(overlay);
            
            // Set up event handlers
            const input = document.getElementById('twitter-username-input');
            const cancelBtn = document.getElementById('twitter-cancel-btn');
            const connectBtn = document.getElementById('twitter-connect-btn');
            
            // Cancel button
            cancelBtn.addEventListener('click', () => {
                overlay.remove();
                resolve(null);
            });
            
            // Connect button
            connectBtn.addEventListener('click', () => {
                const username = input.value.trim();
                if (username) {
                    overlay.remove();
                    resolve(username);
                } else {
                    input.style.borderColor = '#ff4444';
                    input.placeholder = 'Please enter your username';
                    input.focus();
                }
            });
            
            // Focus input and add focus effects
            setTimeout(() => {
                input.focus();
                
                // Add focus/blur effects
                input.addEventListener('focus', () => {
                    input.style.borderColor = '#667eea';
                    input.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                });
                
                input.addEventListener('blur', () => {
                    input.style.borderColor = '#ddd';
                    input.style.boxShadow = 'none';
                });
            }, 100);
            
            // Handle Enter key
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const username = e.target.value.trim();
                    if (username) {
                        overlay.remove();
                        resolve(username);
                    } else {
                        input.style.borderColor = '#ff4444';
                        input.placeholder = 'Please enter your username';
                    }
                }
            });
            
            // Handle overlay click to close
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve(null);
                }
            });
        });
    }

    async connectTwitterUsername(username) {
        console.log('🔗 Frontend: Connecting Twitter username:', username);
        
        try {
            const requestData = { twitter_username: username };
            const authHeader = `tma ${window.Telegram?.WebApp?.initData || ''}`;
            
            console.log('📤 Frontend: Sending Twitter connect request:', {
                url: '/api/twitter/connect',
                method: 'POST',
                hasAuth: !!window.Telegram?.WebApp?.initData,
                authLength: authHeader.length,
                username: username
            });

            const response = await fetch('/api/twitter/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify(requestData)
            });

            console.log('📥 Frontend: Twitter connect response status:', response.status, response.statusText);
            
            if (!response.ok) {
                console.error('❌ Frontend: Twitter connect HTTP error:', response.status, response.statusText);
                
                // Try to get error details
                let errorText;
                try {
                    errorText = await response.text();
                    console.error('❌ Frontend: Error response body:', errorText);
                } catch (e) {
                    console.error('❌ Frontend: Could not read error response:', e);
                }
                
                return { 
                    success: false, 
                    error: `HTTP ${response.status}: ${response.statusText}` 
                };
            }

            const result = await response.json();
            console.log('✅ Frontend: Twitter connect result:', result);
            
            return result;
            
        } catch (error) {
            console.error('❌ Frontend: Connect Twitter error:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            
            // Show debug error for detailed info
            this.showDebugError(error, 'Twitter Connect API');
            
            return { success: false, error: `Connection failed: ${error.message}` };
        }
    }

    async checkUserTwitterConnection() {
        try {
            const response = await fetch('/api/user/twitter', {
                method: 'GET',
                headers: {
                    'Authorization': `tma ${window.Telegram?.WebApp?.initData || ''}`
                }
            });

            const result = await response.json();
            return result.success ? result.data : null;
        } catch (error) {
            console.error('Check Twitter connection error:', error);
            return null;
        }
    }

    async verifyTwitterFollow() {
        this.showToast('🔍 Verifying Twitter follow...', 'info');
        
        try {
            const response = await fetch('/api/missions/verify-channel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `tma ${window.Telegram?.WebApp?.initData || ''}`
                },
                body: JSON.stringify({ missionId: 3 })
            });

            const result = await response.json();

            if (result.success && result.verified) {
                const mission = this.gameData.missions.find(m => m.id === 3);
                if (mission) {
                    mission.status = 'completed';
                    this.renderMissions();
                }
                this.showToast('✅ Twitter follow verified! You can now claim your reward.', 'success');
            } else {
                if (result.error === 'TWITTER_NOT_CONNECTED') {
                    this.showToast('❌ Please connect your Twitter account first!', 'error');
                } else {
                    this.showToast('❌ Please follow @RealSpudVerse first!', 'error');
                }
            }
        } catch (error) {
            console.error('Verify Twitter follow error:', error);
            this.showToast('❌ Verification failed. Please try again.', 'error');
        }
    }

    async verifyChannelMission(missionId) {
        const mission = this.gameData.missions.find(m => m.id === missionId);
        if (!mission) return;

        // Handle Twitter follow verification (requires username input)
        if (missionId === 3) {
            await this.handleTwitterVerification();
            return;
        }

        const verifyMessages = {
            2: '🔍 Verifying channel membership...',
            3: '🔍 Verifying Twitter follow...'
        };
        
        this.showToast(verifyMessages[missionId] || '🔍 Verifying...', 'info');

        try {
            const response = await fetch('/api/missions/verify-channel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `tma ${window.Telegram?.WebApp?.initData || ''}`
                },
                body: JSON.stringify({ missionId })
            });

            const result = await response.json();

            if (result.success && result.verified) {
                mission.status = 'completed';
                this.renderMissions();
                
                const successMessages = {
                    2: '✅ Channel membership verified! You can now claim your reward.',
                    3: '✅ Twitter follow verified! You can now claim your reward.'
                };
                
                this.showToast(successMessages[missionId] || '✅ Verification successful!', 'success');
            } else {
                const errorMessages = {
                    2: '❌ Please join the channel first!',
                    3: '❌ Please follow @RealSpudVerse first!'
                };
                
                this.showToast(errorMessages[missionId] || '❌ Verification failed!', 'error');
            }
        } catch (error) {
            console.error('Verify channel error:', error);
            this.showToast('❌ Verification failed. Please try again.', 'error');
        }
    }

    async claimMission(missionId) {
        const mission = this.gameData.missions.find(m => m.id === missionId);
        if (!mission || mission.claimed || mission.status !== 'completed') {
            console.warn('🚨 Claim blocked - Invalid mission state:', {
                missionId,
                found: !!mission,
                claimed: mission?.claimed,
                status: mission?.status
            });
            return;
        }
        
        // Additional check - prevent if already processing
        if (mission._claiming) {
            console.warn('🚨 Claim blocked - Already processing');
            return;
        }
        mission._claiming = true;

        // Prevent double-clicking by immediately marking as claimed
        mission.claimed = true;
        this.renderMissions(); // Update UI immediately
        
        // Disable the specific button
        const claimButton = document.querySelector(`[onclick="spudverse.claimMission(${missionId})"]`);
        if (claimButton) {
            claimButton.disabled = true;
            claimButton.textContent = '⏳ Claiming...';
            claimButton.style.opacity = '0.6';
        }

        try {
            const response = await this.apiCall('/api/missions/claim', 'POST', { missionId });
            
            if (response && response.success) {
                // Update balance from server response
                const newBalance = response.data.balance;
                const rewardAmount = newBalance - this.gameData.balance;
                this.gameData.balance = newBalance;
                if (rewardAmount > 0) {
                    this.gameData.totalFarmed += rewardAmount;
                }
                this.updateBalance();
                this.updateFarmStats();
                this.checkForLevelUp(); // Check for level up after claiming mission
                
                // Reload missions from API to get updated status
                console.log(`🔄 Reloading missions after claim for mission ${missionId}`);
                await this.loadMissions();
                console.log(`📋 Missions after reload:`, this.gameData.missions.find(m => m.id === missionId));
                this.renderMissions();
                
                this.showToast(`🎉 You earned ${this.formatNumber(mission.reward)} SPUD Points!`, 'success');
                this.confettiEffect();
            } else {
                // Revert if claim failed
                mission.claimed = false;
                this.renderMissions();
                this.showToast('❌ Failed to claim mission', 'error');
            }
            this.vibrate();
            
        } catch (error) {
            console.error('❌ Claim mission error:', error);
            
            // Revert changes if API call failed
            mission.claimed = false;
            this.renderMissions();
            
            // Re-enable button
            const claimButton = document.querySelector(`[onclick="spudverse.claimMission(${missionId})"]`);
            if (claimButton) {
                claimButton.disabled = false;
                claimButton.textContent = '🎁 Claim Reward';
                claimButton.style.opacity = '1';
            }
            
            this.showToast('❌ Network error. Please try again.', 'error');
        } finally {
            // Always clear the claiming flag
            mission._claiming = false;
        }
    }

    async loadShopItems() {
        const activeCategoryBtn = document.querySelector('.item-shop-nav-btn.active');
        if (!activeCategoryBtn) return;

        const category = activeCategoryBtn.dataset.itemCategory;
        const categoryId = 'item-category-' + category.replace(/ /g, '-');
        const container = document.getElementById(categoryId);
        if (!container) {
            console.error('Cannot find container for category:', category);
            console.log('Looking for ID:', categoryId);
            return;
        }
        
        // Show loading state
        container.innerHTML = `
            <div class="potato-loading">
                <div class="potato-spinner"></div>
                <div class="loading-text">Loading Shop Items</div>
                <div class="loading-subtext">Preparing your potato treasures... 🌟</div>
            </div>
        `;

        try {
            // Reset shop items first
            this.shopItems = [];
                    // Load shop items from API
                    const response = await this.apiCall('/api/shop', 'GET');
            
                    if (response && response.success) {
                        this.shopItems = response.data; // Store all items
                        
                        if (!Array.isArray(this.shopItems)) {
                            throw new Error(`Shop API returned invalid data for shopItems. Expected array, got: ${JSON.stringify(this.shopItems)}`);
                        }

                        console.log('Loaded shop items:', this.shopItems);
                        container.innerHTML = '';
                
                        const itemsInCategory = this.shopItems.filter(item => item.category === category);
                
                        if (itemsInCategory.length === 0) {
                            container.innerHTML = '<div class="no-items">No items available in this category</div>';
                            return;
                        }

                        itemsInCategory.forEach(item => {
                            // Defensive check to ensure gameData.items is always an array
                            const userItems = Array.isArray(this.gameData.items) ? this.gameData.items : [];
                            const ownedItem = userItems.find(i => i.id === item.id);
                            const count = ownedItem ? ownedItem.count : 0;
                            const currentCost = Math.floor(item.cost * Math.pow(item.scaling, count));
                            const currentProfit = Math.floor(item.profit * Math.pow(item.scaling, count));
                            const canAfford = this.gameData.balance >= currentCost;

                            const itemCard = document.createElement('div');
                            itemCard.className = 'item-card';
                            itemCard.innerHTML = `
                                <div class="item-icon">${item.icon}</div>
                                <div class="item-info">
                                    <div class="item-name">${item.name}</div>
                                    <div class="item-profit">+${this.formatNumber(currentProfit)} SPH</div>
                                </div>
                                <div class="item-action">
                                    <div class="item-count">Owned: ${count}</div>
                                    <button class="buy-item-btn" 
                                            onclick="spudverse.buyShopItem(${item.id})"
                                            ${!canAfford ? 'disabled' : ''}>
                                        Buy for ${this.formatNumber(currentCost)}
                                    </button>
                                </div>
                            `;
                            container.appendChild(itemCard);
                        });
                    } else {
                        container.innerHTML = '<div class="error-message">⚠️ Failed to load shop items</div>';
                        const debugMsg = `Shop API error: ${response?.error || 'Unknown'} | Raw: ${JSON.stringify(response)}`;
                        this.showToast(debugMsg, 'error');
                        console.error('Failed to load shop items:', response?.error, response);
                    }
                } catch (error) {
                    container.innerHTML = '<div class="error-message">❌ Error loading shop items</div>';
                    const debugMsg = `JS error loading shop items: ${error.message}`;
                    this.showToast(debugMsg, 'error');
                    console.error('Error loading shop items:', error);
                }
    }

    async buyShopItem(itemId) {
        // Kiểm tra và tải lại dữ liệu shop nếu cần
        if (!Array.isArray(this.shopItems) || this.shopItems.length === 0) {
            this.showToast("Đang tải lại dữ liệu cửa hàng...", "info");
            const activeCategoryBtn = document.querySelector('.item-shop-nav-btn.active');
            if (activeCategoryBtn) {
                await this.loadShopItems();
            } else {
                this.showToast("Lỗi: Không thể xác định danh mục cửa hàng", "error");
                return;
            }
        }

        // Kiểm tra lại sau khi tải
        if (!Array.isArray(this.shopItems) || this.shopItems.length === 0) {
            this.showToast("Lỗi: Không thể tải dữ liệu cửa hàng. Vui lòng thử lại", "error");
            console.error("buyShopItem failed: Shop items not available after reload", this.shopItems);
            return;
        }

        const item = this.shopItems.find(i => i.id === itemId);
        if (!item) {
            this.showToast("Không tìm thấy vật phẩm trong cửa hàng", "error");
            return;
        }

        const ownedItem = Array.isArray(this.gameData.items) 
            ? this.gameData.items.find(i => i.id === item.id) 
            : null;
        const count = ownedItem ? ownedItem.count : 0;
        const currentCost = Math.floor(item.cost * Math.pow(item.scaling, count));

        if (this.gameData.balance < currentCost) {
            this.showToast("You don't have enough SPUD Points!", "error");
            return;
        }

        try {
            const response = await this.apiCall('/api/shop/buy', 'POST', { itemId });

            if (response && response.success) {
                console.log('[buyShopItem] full response:', JSON.stringify(response));
                console.log('[buyShopItem] response.new_sph:', response.new_sph);
                // Update balance and SPH from server response
                this.gameData.balance = response.new_balance ?? this.gameData.balance;
                this.gameData.sph = response.new_sph ?? this.gameData.sph;
                console.log('[buyShopItem] new sph after assignment:', this.gameData.sph);
                this.showToast(`New SPH: ${this.gameData.sph}`, 'info');

                // --- Client-side item state management ---
                // Ensure gameData.items is a valid array
                if (!Array.isArray(this.gameData.items)) {
                    this.gameData.items = [];
                }

                // Find the item in the local state
                const ownedItem = this.gameData.items.find(i => i.id === itemId);

                if (ownedItem) {
                    // If item exists, increment its count
                    ownedItem.count++;
                } else {
                    // If item doesn't exist, add it to the array
                    this.gameData.items.push({ id: itemId, count: 1 });
                }
                // --- End of client-side management ---

                this.updateUI();
                this.loadShopItems();
                this.showToast(`Purchased ${item.name}!`, 'success');
            } else {
                const debugMsg = `Buy API error: ${response?.error || 'Unknown'} | Raw: ${JSON.stringify(response)}`;
                this.showToast(debugMsg, 'error');
            }
        } catch (error) {
            console.error('Error buying item:', error);
            const debugMsg = `JS error during purchase: ${error?.message || error}`;
            this.showToast(debugMsg, 'error');
        }
    }

    startSPHInterval() {
        setInterval(async () => {
            // SPH is now calculated and added on the backend.
            // This interval will periodically sync the balance from the server.
            try {
                const response = await this.apiCall('/api/user/sync-balance', 'GET');
                if (response && response.success) {
                    this.gameData.balance = response.data.balance;
                    this.updateBalance();
                }
            } catch (error) {
                console.warn('Could not sync balance for SPH update.', error);
            }
        }, 60000); // Sync every 60 seconds
    }

    async loadUpgrades() {
        try {
            const response = await this.apiCall('/api/upgrades', 'GET');
            if (response.success) {
                this.renderUpgrades(response.data);
            } else {
                this.showToast('Could not load upgrades.', 'error');
            }
        } catch (error) {
            console.error('Error loading upgrades:', error);
            this.showToast('Failed to load upgrades. Please try again.', 'error');
        }
    }

    renderUpgrades(upgrades) {
        const container = document.getElementById('upgrades-container');
        container.innerHTML = '';

        const icons = {
            per_tap: '👆',
            max_energy: '🔋',
            energy_regen_rate: '⚡️'
        };

        upgrades.forEach(upgrade => {
            const card = document.createElement('div');
            card.className = 'upgrade-card';

            const isMaxLevel = upgrade.current_level >= upgrade.max_level;
            const canAfford = this.gameData.balance >= upgrade.next_level_cost;

            card.innerHTML = `
                <div class="upgrade-icon">${icons[upgrade.name] || '🚀'}</div>
                <div class="upgrade-info">
                    <div class="upgrade-title">${upgrade.description}</div>
                    <div class="upgrade-level">Level: ${upgrade.current_level} / ${upgrade.max_level}</div>
                </div>
                <div class="upgrade-action">
                    <button class="upgrade-btn" id="upgrade-btn-${upgrade.id}" 
                        onclick="spudverse.purchaseUpgrade('${upgrade.name}', ${upgrade.id})" 
                        ${isMaxLevel || !canAfford ? 'disabled' : ''}>
                        ${isMaxLevel ? 'Max Level' : `Upgrade`}
                    </button>
                    <div class="upgrade-cost">
                        ${isMaxLevel ? '' : `Cost: ${this.formatNumber(upgrade.next_level_cost)} SPUD`}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    async purchaseUpgrade(upgradeName, upgradeId) {
        const button = document.getElementById(`upgrade-btn-${upgradeId}`);
        button.disabled = true;
        button.textContent = 'Upgrading...';

        try {
            const response = await this.apiCall('/api/upgrades/purchase', 'POST', { upgradeName });

            if (response.success && response.data) {
                this.showToast(response.data.message || `🚀 ${upgradeName.replace('_', ' ')} upgraded!`, 'success');
                
                // Update all relevant game data from the complete user object
                this.gameData.balance = response.data.balance;
                this.gameData.level = response.data.level;
                this.gameData.perTap = response.data.perTap;
                this.gameData.energy = response.data.energy;
                this.gameData.maxEnergy = response.data.maxEnergy;
                this.gameData.energyRegenRate = response.data.energyRegenRate;
                this.gameData.timeToFull = response.data.timeToFull;

                // Reload upgrades to show new levels and costs
                this.loadUpgrades();
                // Also update user stats on all tabs
                this.updateUI();
            } else {
                this.showToast(response.error || 'Upgrade failed', 'error');
                button.disabled = false;
                button.textContent = 'Upgrade';
            }
        } catch (error) {
            console.error('Error purchasing upgrade:', error);
            this.showToast('Upgrade failed. Please try again.', 'error');
            button.disabled = false;
            button.textContent = 'Upgrade';
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
            const mockLeaderboard = {
                leaderboard: [
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
                ],
                userRank: null,
                userBalance: this.gameData.balance || 0
            };
            this.renderLeaderboard(mockLeaderboard);
        }
    }

    renderLeaderboard(data) {
        const container = document.getElementById('leaderboard-container');
        container.innerHTML = '';

        // Handle both old format (array) and new format (object with leaderboard array)
        const leaderboard = Array.isArray(data) ? data : data.leaderboard || [];
        const userRankInfo = data.userRank || null;

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
                        <div class="player-level">${this.getLevelTitle(player.level)}</div>
                    </div>
                </div>
                <div class="player-score">${this.formatNumber(player.balance)} SPUD Points</div>
            `;

            container.appendChild(item);
        });

        // Update user's rank - use real data from API or show "Unranked"
        const userRankElement = document.getElementById('user-rank');
        const userBalanceElement = document.getElementById('user-balance-rank');
        const userLevelElement = document.getElementById('user-level-rank');
        
        if (userRankElement) {
            if (userRankInfo && userRankInfo.rank > 0) {
                userRankElement.textContent = `#${userRankInfo.rank}`;
            } else {
                userRankElement.textContent = 'Unranked';
            }
        }
        
        if (userBalanceElement) {
            userBalanceElement.textContent = this.formatNumber(userRankInfo?.balance || 0);
        }

        if (userLevelElement) {
            userLevelElement.textContent = this.getLevelTitle(userRankInfo?.level || 1);
        }

        console.log('📊 Leaderboard rendered:', {
            leaderboardCount: leaderboard.length,
            userRankInfo: userRankInfo
        });
    }

    updateProfile() {
        const levelInfo = this.getCurrentLevelInfo();
        if (this.user) {
            document.getElementById('profile-name').textContent = 
                this.user.first_name + (this.user.last_name ? ' ' + this.user.last_name : '');
        }
        document.querySelector('.profile-title').innerHTML = `${levelInfo.title}`;
        
        document.getElementById('profile-balance').textContent = this.formatNumber(this.gameData.balance);
        document.getElementById('profile-referrals').textContent = this.gameData.referrals;
        document.getElementById('profile-sph').textContent = this.formatNumber(this.gameData.sph);
        document.getElementById('profile-missions').textContent = 
            this.gameData.missions.filter(m => m.claimed).length;
        
        const joinDate = new Date().toLocaleDateString();
        document.getElementById('join-date').textContent = joinDate;
        document.getElementById('best-streak').textContent = this.gameData.bestStreak || 0;
    }

    shareReferralLink() {
        const userId = this.user?.id || 12345;
        const referralCode = userId.toString();
        const botLink = `https://t.me/spudverse_bot`;
        const shareText = `🥔 Join me in SpudVerse! 🌱\n\nTap potatoes, earn SPUD Points, and become a farming legend!\n\n🎁 My referral code: ${referralCode}\n\nHow to join:\n1. Click: ${botLink}\n2. Enter my code: ${referralCode}\n3. Get 50 SPUD Points bonus!\n\nStart farming now! 🚀`;

        if (this.tg) {
            // Share with bot link and referral code
            this.tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(botLink)}&text=${encodeURIComponent(shareText)}`);
        } else if (navigator.share) {
            navigator.share({
                title: 'Join SpudVerse!',
                text: shareText,
                url: botLink
            });
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(shareText).then(() => {
                this.showToast('📋 Referral code and bot link copied to clipboard!', 'success');
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

    async showWelcomeModal() {
        console.log('📝 Attempting to show welcome modal...');
        return new Promise((resolve) => {
            console.log('🎨 Creating welcome modal elements...');
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            console.log('💅 Setting modal styles...');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                backdrop-filter: blur(5px);
                padding: 20px;
                box-sizing: border-box;
            `;
            
            overlay.innerHTML = `
                <div class="modal" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 20px;
                    padding: 30px;
                    max-width: 400px;
                    width: 90%;
                    color: white;
                    text-align: center;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    animation: modalSlideIn 0.3s ease-out;
                ">
                    <div style="font-size: 3rem; margin-bottom: 20px;">🥔</div>
                    <h2 style="margin: 0 0 10px 0; font-family: 'Comic Neue', cursive; font-size: 1.8rem;">
                        Welcome to SpudVerse!
                    </h2>
                    <p style="margin: 0 0 25px 0; opacity: 0.9; line-height: 1.5;">
                        Ready to start your potato farming adventure?
                    </p>
                    
                    <div style="background: rgba(255,255,255,0.1); border-radius: 15px; padding: 20px; margin-bottom: 25px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 1.1rem;">🎁 Got a Referral Code?</h3>
                        <p style="margin: 0 0 15px 0; font-size: 0.9rem; opacity: 0.8;">
                            Enter your friend's referral code to get bonus SPUD Points!
                        </p>
                        <input type="text" id="referral-code-input" placeholder="Enter referral code (optional)" 
                               style="width: 100%; padding: 12px; border: none; border-radius: 10px; font-size: 16px; 
                                      text-align: center; background: rgba(255,255,255,0.9); color: #333; 
                                      box-sizing: border-box; margin-bottom: 10px;">
                        <div style="font-size: 0.8rem; opacity: 0.7;">
                            You'll get 50 SPUD Points, your friend gets 100 SPUD Points!
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button id="welcome-skip-btn" style="
                            padding: 12px 25px;
                            background: rgba(255,255,255,0.2);
                            color: white;
                            border: none;
                            border-radius: 10px;
                            cursor: pointer;
                            font-family: 'Comic Neue', cursive;
                            font-weight: 600;
                            transition: all 0.3s ease;
                        ">Skip</button>
                        <button id="welcome-start-btn" style="
                            padding: 12px 25px;
                            background: #ff6b35;
                            color: white;
                            border: none;
                            border-radius: 10px;
                            cursor: pointer;
                            font-family: 'Comic Neue', cursive;
                            font-weight: 600;
                            transition: all 0.3s ease;
                        ">🚀 Start Farming!</button>
                    </div>
                </div>
            `;
            
            // Add modal animation CSS
            if (!document.querySelector('#modal-animation-style')) {
                const style = document.createElement('style');
                style.id = 'modal-animation-style';
                style.textContent = `
                    @keyframes modalSlideIn {
                        from { transform: translateY(-50px) scale(0.9); opacity: 0; }
                        to { transform: translateY(0) scale(1); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            document.body.appendChild(overlay);
            
            // Set up event handlers
            const input = document.getElementById('referral-code-input');
            const skipBtn = document.getElementById('welcome-skip-btn');
            const startBtn = document.getElementById('welcome-start-btn');
            
            // Skip button - create account without referral
            skipBtn.addEventListener('click', async () => {
                console.log('👤 User chose to skip referral code');
                overlay.remove();
                await this.createUserAccount(null);
                resolve();
            });
            
            // Start button - create account with referral code if provided
            startBtn.addEventListener('click', async () => {
                const referralCode = input.value.trim();
                console.log('🚀 User starting with referral code:', referralCode || 'none');
                
                startBtn.textContent = '⏳ Creating account...';
                startBtn.disabled = true;
                
                overlay.remove();
                await this.createUserAccount(referralCode || null);
                resolve();
            });
            
            // Focus input
            setTimeout(() => input.focus(), 300);
            
            // Handle Enter key
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    startBtn.click();
                }
            });
        });
    }

    async createUserAccount(referralCode) {
        console.log('🆕 Creating user account with referral code:', referralCode);
        
        try {
            // Call backend to create user with referral code
            const response = await this.apiCall('/api/user/create', 'POST', {
                referralCode: referralCode
            });
            
            if (response && response.success) {
                console.log('✅ User account created successfully:', response.data);
                this.gameData = { ...this.gameData, ...response.data };
                
                // Show success message
                if (referralCode) {
                    this.showToast('🎉 Account created! You got 50 SPUD Points bonus!', 'success');
                } else {
                    this.showToast('🎉 Welcome to SpudVerse!', 'success');
                }
                
                // Initialize local energy tracking
                this.lastEnergyUpdate = Date.now();
                this.updateUI();
                
                // Now that user is created, start backend energy sync
                console.log('🔄 Starting backend energy sync for new user');
                this.startBackendEnergySync();
                
            } else {
                console.error('❌ Failed to create user account:', response);
                this.showToast('❌ Failed to create account. Please try again.', 'error');
                this.useMockData();
            }
        } catch (error) {
            console.error('❌ Error creating user account:', error);
            this.useMockData();
        }
    }

    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    checkAchievements() {
        // Achievements are now handled by the backend API
        // This function is deprecated but kept for compatibility
        console.log('🏆 Achievement checking moved to backend API');
    }

    scheduleTapSync() {
        const now = Date.now();
        
        // If we have pending taps and enough time has passed, sync immediately
        if (this.pendingTaps > 0 && (now - this.lastSyncTime) >= this.syncInterval) {
            this.syncTapsToBackend();
        }
        // Otherwise, schedule a sync if not already scheduled
        else if (this.pendingTaps > 0 && !this.syncTimeout) {
            const timeToWait = this.syncInterval - (now - this.lastSyncTime);
            this.syncTimeout = setTimeout(() => {
                this.syncTapsToBackend();
            }, Math.max(100, timeToWait));
        }
    }

    async syncTapsToBackend() {
        if (this.pendingTaps <= 0) return;
        
        const tapCount = this.pendingTaps; // Actual number of taps
        const tapAmount = Math.floor(this.gameData.perTap * this.gameData.combo); // SPUD per tap
        const spudAmount = tapCount * tapAmount; // Total SPUD earned
        this.pendingTaps = 0;
        this.lastSyncTime = Date.now();
        
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
            this.syncTimeout = null;
        }
        
        console.log(`🔄 Syncing taps to backend - Taps: ${tapCount}, SPUD per tap: ${tapAmount}, Total SPUD: ${spudAmount}`);
        
        try {
            const response = await this.apiCall('/api/tap', 'POST', { 
                tapCount,  // Number of actual taps for energy consumption
                tapAmount, // SPUD earned per tap
                spudAmount // Total SPUD points earned
            });
            if (response && response.success) {
                console.log('✅ Sync successful, server response:', response.data);
                
                // Update energy from server response
                if (response.data.energy !== undefined) {
                    this.gameData.energy = response.data.energy;
                    this.gameData.maxEnergy = response.data.maxEnergy;
                    this.gameData.timeToFull = response.data.timeToFull;
                    this.updateEnergyBar();
                }

                // Update streak from server response
                if (response.data.streak !== undefined) {
                    this.gameData.streak = response.data.streak;
                }
                if (response.data.bestStreak !== undefined) {
                    this.gameData.bestStreak = response.data.bestStreak;
                }
                
                // Handle new achievements
                if (response.data.newAchievements && response.data.newAchievements.length > 0) {
                    for (const achievement of response.data.newAchievements) {
                        // Check if we already shown this achievement
                        if (!this.userAchievements.includes(achievement.id)) {
                            this.showAchievementUnlocked(achievement);
                            this.userAchievements.push(achievement.id); // Track it
                            
                            // Award achievement reward
                            if (achievement.reward > 0) {
                                this.showToast(`🎁 Achievement reward: +${achievement.reward} SPUD Points!`, 'success');
                            }
                        }
                    }
                }
                
                // Update balance from server
                const newBalance = response.data.balance;
                const balanceIncrease = newBalance - this.gameData.balance;
                if (balanceIncrease > 0) {
                    this.gameData.totalFarmed += balanceIncrease;
                }
                this.gameData.balance = newBalance;
                this.updateBalance();
                this.updateFarmStats();
            } else {
                console.warn('⚠️ Sync failed, adding back to pending');
                this.pendingTaps += tapCount; // Add back if failed
            }
        } catch (error) {
            // Handle energy errors specifically
            if (error.response && error.response.status === 400) {
                console.warn('⚡ Energy insufficient, stopping taps');
                this.pendingTaps = 0; // Don't retry energy-blocked taps
                this.showToast('⚡ Not enough energy! Wait for regeneration.', 'warning');
                return;
            }
            
            console.error('❌ Sync error:', error);
            this.pendingTaps += tapCount; // Add back if failed
        }
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
    }

    
    // Debug mode - show detailed errors in app
    showDebugError(error, context = '') {
        const errorMessage = `🐛 DEBUG${context ? ` [${context}]` : ''}: ${error.message || error}`;
        console.error('Debug error:', error);
        
        // Show in toast for immediate visibility
        this.showToast(errorMessage, 'error');
        
        // Also show in a debug overlay that can be dismissed
        this.showDebugOverlay(error, context);
    }

    showDebugOverlay(error, context) {
        // Remove existing debug overlay
        const existingOverlay = document.getElementById('debug-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'debug-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 20px;
            box-sizing: border-box;
            z-index: 99999;
            font-family: monospace;
            font-size: 12px;
            overflow-y: auto;
        `;

        overlay.innerHTML = `
            <div style="max-width: 100%; word-wrap: break-word;">
                <h3 style="color: #ff4444; margin-top: 0;">🐛 Debug Info</h3>
                <p><strong>Context:</strong> ${context || 'General error'}</p>
                <p><strong>Error:</strong> ${error.message || error}</p>
                <p><strong>Stack:</strong></p>
                <pre style="background: #333; padding: 10px; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; font-size: 10px;">${error.stack || 'No stack trace'}</pre>
                <p><strong>Time:</strong> ${new Date().toISOString()}</p>
                <button onclick="this.closest('#debug-overlay').remove()" 
                        style="background: #ff4444; color: white; border: none; padding: 10px 20px; border-radius: 4px; margin-top: 10px; cursor: pointer;">
                    Close Debug
                </button>
            </div>
        `;

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);
    }

    setupGlobalErrorHandlers() {
        // Catch unhandled errors
        window.addEventListener('error', (e) => {
            console.error('Global error caught:', e.error);
            this.showDebugError(e.error, 'Global Error');
        });

        // Catch unhandled promise rejections
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            this.showDebugError(e.reason, 'Promise Rejection');
            e.preventDefault(); // Prevent default behavior
        });
        
        console.log('🔧 Global error handlers set up');
    }

    addToastStyles() {
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
        if (typeof num !== 'number' || isNaN(num)) {
            return '0';
        }
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    saveProgress() {
        // This method is now deprecated as we are using Supabase.
        // Kept for potential offline mode in the future.
        // console.log('💾 Progress is now saved to Supabase, not localStorage.');
    }

    async apiCall(endpoint, method = 'GET', data = null) {
        try {
            const baseUrl = window.location.origin;
            let url = baseUrl + endpoint;
            
            console.log(`[DEBUG] Making API call:`, {
                method,
                url,
                data,
                tg: !!this.tg,
                user: this.user
            });
            
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                // Add timeout
                signal: AbortSignal.timeout(5000) // 5 second timeout
            };

            // Add authorization header with Telegram data
            if (this.tg) {
                // Always try to send Telegram auth data, even if empty
                const initData = this.tg.initData || '';
                options.headers['Authorization'] = `tma ${initData}`;
                
                console.log('[DEBUG] Auth info:', {
                    hasTelegram: !!this.tg,
                    hasInitData: !!this.tg.initData,
                    initDataLength: initData.length,
                    initDataPreview: initData.substring(0, 100) + '...',
                    user: this.user,
                    referrerId: this.referrerId
                });
            } else {
                console.log('[DEBUG] Development mode - no Telegram WebApp');
                
                // Fallback for development - add referral data as query params
                if (method === 'GET' && this.referrerId) {
                    const separator = url.includes('?') ? '&' : '?';
                    url += `${separator}referrerId=${this.referrerId}`;
                }
                
                // Add user info for development
                if (this.user) {
                    const separator = url.includes('?') ? '&' : '?';
                    url += `${separator}userId=${this.user.id}&username=${this.user.username || ''}&firstName=${this.user.first_name || ''}&lastName=${this.user.last_name || ''}`;
                }
            }

            if (data && method !== 'GET') {
                // Add referral data to POST requests if not using Telegram auth
                if (!this.tg?.initData && this.referrerId) {
                    data = { ...data, referrerId: this.referrerId };
                }
                options.body = JSON.stringify(data);
            }

            console.log('[DEBUG] Making fetch request:', {
                url,
                options: {
                    ...options,
                    headers: { ...options.headers }
                }
            });

            const response = await fetch(url, options);
            console.log('[DEBUG] Received response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });

            // Đọc response text trước để debug
            const responseText = await response.text();
            console.log('[DEBUG] Response text:', responseText);

            // Xử lý case 404 cho endpoint /api/user
            if (response.status === 404 && endpoint === '/api/user') {
                console.log('[DEBUG] New user detected (404), showing welcome modal...');
                await this.showWelcomeModal();
                return null;
            }

            if (!response.ok) {
                console.error('[DEBUG] Response not OK:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: responseText
                });
                throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
            }

            // Parse JSON sau khi đã log text
            try {
                const jsonResponse = JSON.parse(responseText);
                console.log('[DEBUG] Parsed JSON response:', jsonResponse);
                return jsonResponse;
            } catch (e) {
                console.error('[DEBUG] Failed to parse JSON:', {
                    error: e,
                    responseText
                });
                throw new Error(`Invalid JSON response: ${responseText}`);
            }
        } catch (error) {
            console.error('[DEBUG] API call error:', {
                endpoint,
                error: error.message,
                stack: error.stack
            });
            // Return mock success for development
            if (endpoint === '/api/user') {
                return {
                    success: false,
                    error: error.message
                };
            }
            throw error;
        }
    }
}

// Global error handler
window.addEventListener('error', (event) => {
    console.error('🚨 Global JavaScript Error:', event.error);
    
    // Show user-friendly error
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        background: #ff4757;
        color: white;
        padding: 15px;
        border-radius: 10px;
        z-index: 10000;
        text-align: center;
        font-family: 'Comic Neue', cursive;
    `;
    errorMsg.innerHTML = `
        <div>😵 Game Error!</div>
        <small>Check console for details</small>
        <button onclick="this.parentElement.remove()" style="
            margin-left: 10px;
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
        ">✕</button>
    `;
    document.body.appendChild(errorMsg);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (errorMsg.parentElement) {
            errorMsg.remove();
        }
    }, 5000);
});

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('🎮 Starting SpudVerse...');
        window.spudverse = new SpudVerse();
    } catch (error) {
        console.error('💥 Failed to start SpudVerse:', error);
        
        // Show fallback UI
        document.body.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                font-family: 'Comic Neue', cursive;
                text-align: center;
                padding: 20px;
            ">
                <div style="font-size: 4rem; margin-bottom: 20px;">😵</div>
                <h2>SpudVerse Failed to Load</h2>
                <p>There was an error starting the game.</p>
                <button onclick="window.location.reload()" style="
                    margin-top: 20px;
                    padding: 15px 30px;
                    background: #ff6b35;
                    color: white;
                    border: none;
                    border-radius: 15px;
                    cursor: pointer;
                    font-family: 'Comic Neue', cursive;
                    font-weight: 600;
                    font-size: 1rem;
                ">🔄 Reload Game</button>
            </div>
        `;
    }
});