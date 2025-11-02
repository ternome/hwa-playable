// Game State
const MAX_LEVEL = 5;
// Progressive experience requirements: Level 1→2, 2→3, 3→4, 4→5
const EXPERIENCE_REQUIREMENTS = {
    1: 15,  // Level 1 → 2
    2: 25,  // Level 2 → 3
    3: 70,  // Level 3 → 4
    4: 110  // Level 4 → 5
};

// Get experience required for next level
function getExperienceForLevel(currentLevel) {
    if (currentLevel >= MAX_LEVEL) return 999999;
    return EXPERIENCE_REQUIREMENTS[currentLevel] || 999999;
}

// Statistics constants
const TOTAL_PLAYERS = 487543;
const TOP_1_PERCENT_THRESHOLD = 330;

// Skill cooldown durations (in seconds)
const SKILL_COOLDOWNS = {
    tap: 3,
    passive: 7,
    time1: 53,
    crowdboost: 15
};

// Crowd Boost active duration (in seconds)
const CROWD_BOOST_DURATION = 5;

const gameState = {
    coins: 1,
    level: 1,
    experience: 0,
    experienceToNextLevel: getExperienceForLevel(1),
    coinsPerTap: 2,
    coinsPerSecond: 2,
    taps: 0,
    timeLeft: 60,
    incomeMultiplier: 1, // For Crowd Boost effect
    skills: {
        tap: { level: 0, cooldownEndTime: 0, multiplier: 1 }, // Battle Spirit: ×1.5, ×2, ×3, ×4
        passive: { level: 0, cooldownEndTime: 0 }, // Hero's Focus: +10, +20, +40, +80
        time1: { cooldownEndTime: 0 },
        crowdboost: { cooldownEndTime: 0, activeEndTime: 0 }
    }
};

// Track if game has started (first tap occurred)
let gameStarted = false;

// Motivational tips timer
let lastMotivationalTipTime = 0;
const MOTIVATIONAL_TIP_INTERVAL = 10000; // Show tip every 10 seconds

// Spine animation variables
let handApp = null;
let handSpine = null;

// Load game state from localStorage
function loadGameState() {
    const saved = localStorage.getItem('tapGameState');
    if (saved) {
        const parsed = JSON.parse(saved);
        // Merge skills to preserve structure
        if (parsed.skills) {
            // Migrate old skill structure to new structure with levels
            if (!parsed.skills.tap || parsed.skills.tap.level === undefined) {
                parsed.skills.tap = { level: 0, cooldownEndTime: 0, multiplier: 1 };
            } else {
                // Restore multiplier if skill has level
                if (parsed.skills.tap.level > 0) {
                    parsed.skills.tap.multiplier = SKILL_EFFECTS.tap[parsed.skills.tap.level - 1];
                }
            }
            if (!parsed.skills.passive || parsed.skills.passive.level === undefined) {
                parsed.skills.passive = { level: 0, cooldownEndTime: 0 };
            }
            if (!parsed.skills.time1 || parsed.skills.time1.cooldownEndTime === undefined) {
                parsed.skills.time1 = { cooldownEndTime: 0 };
            }
            if (!parsed.skills.crowdboost || parsed.skills.crowdboost.cooldownEndTime === undefined) {
                parsed.skills.crowdboost = { cooldownEndTime: 0, activeEndTime: 0 };
            }
        }
        // Ensure incomeMultiplier exists
        if (parsed.incomeMultiplier === undefined) {
            parsed.incomeMultiplier = 1;
        }
        Object.assign(gameState, parsed);
    }
}

// Save game state to localStorage
function saveGameState() {
    localStorage.setItem('tapGameState', JSON.stringify(gameState));
}

// Format large numbers
function formatNumber(num) {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    // Don't abbreviate numbers below 1 million - show full number
    return Math.floor(num).toString();
}

// Update character image based on level
// Calculate player percentile ranking based on tap count
// Uses power law distribution where 330+ taps = top 1%
// Returns percentile (0.0 = best, 1.0 = worst)
function calculatePlayerPercentile(taps, totalPlayers = TOTAL_PLAYERS) {
    // Power law: most players have low taps, few have high taps
    // 330+ taps = top 1%
    const topThreshold = TOP_1_PERCENT_THRESHOLD;
    
    if (taps === 0) {
        return 1.0; // Worst possible (0 taps = 100th percentile = bottom)
    }
    
    if (taps >= topThreshold) {
        // Top 1%: further calculation for fine-grained ranking
        const excessTaps = taps - topThreshold;
        // Diminishing returns: each additional tap above 330 reduces percentile slightly
        // Base percentile for 330 taps is 0.01 (top 1%)
        const top1Percentile = 0.01 - (excessTaps / 100000);
        return Math.max(0.0001, Math.min(0.01, top1Percentile));
    }
    
    // Below top threshold: use power law
    // Invert the logic: we want LOW taps = HIGH percentile (worse), HIGH taps = LOW percentile (better)
    // Normalized taps: 0 = worst, 1 = best (at threshold)
    const normalizedTaps = taps / topThreshold;
    
    // Power law curve: lower exponent makes progression smoother
    // We want: taps=1 → percentile ~0.99, taps=330 → percentile ~0.01
    // Formula: percentile = 1 - (normalizedTaps^power) * 0.99
    // This gives: taps=0 → 1.0, taps=330 → 0.01
    const power = 1.8; // Controls curve steepness
    const percentile = 1.0 - (Math.pow(normalizedTaps, power) * 0.99);
    
    // Ensure percentile is between 0.01 (top 1%) and 1.0 (bottom)
    return Math.min(1.0, Math.max(0.01, percentile));
}

function updateCharacterImage() {
    const characterImg = document.getElementById('character-img');
    if (characterImg) {
        const level = Math.min(gameState.level, MAX_LEVEL);
        const newSrc = `assets/HeroState_${level}.png`;
        
        // Update image source
        characterImg.src = newSrc;
        characterImg.alt = `Hero Level ${level}`;
        
        // Handle image load error
        characterImg.onerror = function() {
            // Fallback to emoji if image not found
            this.style.display = 'none';
            const parent = this.parentElement;
            const existingFallback = parent.querySelector('.character-body-fallback');
            if (!existingFallback) {
                const fallback = document.createElement('div');
                fallback.className = 'character-body character-body-fallback';
                fallback.style.fontSize = '120px';
                fallback.textContent = '⚔️';
                parent.appendChild(fallback);
            }
        };
        
        // Show image if it was hidden
        characterImg.style.display = '';
        
    }
}

// Update UI
function updateUI() {
    // Update coins display
    document.getElementById('coins-display').textContent = formatNumber(gameState.coins);
    
    // Update level
    document.getElementById('current-level').textContent = gameState.level;
    
    // Update progress bar
    let progressPercent;
    if (gameState.level >= MAX_LEVEL) {
        progressPercent = 100; // Full bar when at max level
    } else {
        progressPercent = (gameState.experience / gameState.experienceToNextLevel) * 100;
    }
    document.getElementById('progress-fill').style.width = progressPercent + '%';
    
    // Update coins per tap and per second
    // Calculate actual coins per tap with all bonuses
    const battleSpiritSkill = gameState.skills.tap;
    const tapLevel = battleSpiritSkill.level || 0;
    const tapMultiplier = getBattleSpiritMultiplier(tapLevel); // Progressive squaring
    
    const heroBonuses = getHeroEvolutionBonuses();
    const baseTap = gameState.coinsPerTap;
    const actualCoinsPerTap = baseTap * tapMultiplier * heroBonuses.tapBonus * heroBonuses.totalBonus * gameState.incomeMultiplier;
    
    // Calculate actual coins per second with all bonuses
    const heroFocusSkill = gameState.skills.passive;
    const passiveLevel = heroFocusSkill.level || 0;
    const passiveBonus = getHeroFocusPassiveBonus(passiveLevel); // Progressive squaring
    const basePassive = gameState.coinsPerSecond;
    const totalPassive = basePassive + passiveBonus;
    const actualCoinsPerSecond = totalPassive * heroBonuses.passiveBonus * heroBonuses.totalBonus * gameState.incomeMultiplier;
    
    document.getElementById('coins-per-tap').textContent = formatNumber(actualCoinsPerTap);
    document.getElementById('coins-per-sec').textContent = formatNumber(actualCoinsPerSecond);
    
    // Update timer and countdown
    const timerValue = Math.floor(gameState.timeLeft);
    const timerContainer = document.querySelector('.timer-container');
    const centerCountdown = document.getElementById('center-countdown');
    
    // Show center countdown when time <= 10 seconds, hide timer text
    if (gameState.timeLeft <= 10 && timerValue > 0) {
        // Hide timer container
        if (timerContainer) {
            timerContainer.classList.add('hidden');
        }
        
        // Show center countdown with animation
        if (centerCountdown) {
            const currentText = centerCountdown.textContent;
            const newText = timerValue.toString();
            
            // Update text if changed
            if (currentText !== newText) {
                centerCountdown.textContent = newText;
                // Restart animation by removing and re-adding the class
                centerCountdown.classList.remove('visible');
                // Force reflow to restart animation
                void centerCountdown.offsetWidth;
                centerCountdown.classList.add('visible');
            } else if (!centerCountdown.classList.contains('visible')) {
                // First time showing
                centerCountdown.classList.add('visible');
            }
        }
    } else {
        // Show timer container, hide center countdown
        if (timerContainer) {
            timerContainer.classList.remove('hidden');
        }
        if (centerCountdown) {
            centerCountdown.classList.remove('visible');
            centerCountdown.textContent = '';
        }
        
        // Update timer value
        const timerValueElement = document.getElementById('timer-value');
        if (timerValueElement) {
            timerValueElement.textContent = timerValue;
        }
    }
    
    // Update percent text using realistic statistics calculation
    const percentile = calculatePlayerPercentile(gameState.taps);
    const betterThanPercent = Math.round((1 - percentile) * 100);
    document.getElementById('percent-text').textContent = `You're better than ${betterThanPercent}% of players`;
    
    // Update character image
    updateCharacterImage();
    
    // Update skill cards
    updateSkillCards();
}

// Update skill cards
function updateSkillCards() {
    const now = Date.now();
    
    Object.keys(gameState.skills).forEach(skillKey => {
        const card = document.querySelector(`[data-skill="${skillKey}"]`);
        if (!card) return;
        
        const skill = gameState.skills[skillKey];
        
        // Handle skills with levels (Battle Spirit, Hero's Focus)
        if ((skillKey === 'tap' || skillKey === 'passive') && skill.level !== undefined) {
            const skillValue = card.querySelector('.skill-value');
            const cooldownText = card.querySelector('.cooldown-text');
            const readyButton = card.querySelector('.ready-button');
            
            // Update skill effect display
            if (skillKey === 'tap') {
                // Battle Spirit: show multiplier (progressive squaring)
                if (skillValue) {
                    if (skill.level > 0) {
                        const multiplier = getBattleSpiritMultiplier(skill.level);
                        skillValue.textContent = multiplier.toString();
                    } else {
                        skillValue.textContent = '2';
                    }
                }
            } else if (skillKey === 'passive') {
                // Hero's Focus: show passive income (power of 10 progression)
                if (skillValue) {
                    if (skill.level > 0 && skill.level <= 4) {
                        const passiveBonus = getHeroFocusPassiveBonus(skill.level);
                        skillValue.textContent = formatNumber(passiveBonus);
                    } else {
                        skillValue.textContent = '10';
                    }
                }
            }
            
            // Check cooldown for these skills
            const cooldownDuration = SKILL_COOLDOWNS[skillKey] * 1000;
            let cooldownRemaining = 0;
            let isOnCooldown = false;
            
            if (skill.cooldownEndTime > now) {
                cooldownRemaining = skill.cooldownEndTime - now;
                isOnCooldown = true;
            }
            
            // Hide/show UI elements
            if (cooldownText) cooldownText.style.display = 'none';
            if (readyButton) readyButton.style.display = 'none';
            
            card.classList.remove('skill-ready', 'skill-cooldown', 'skill-active');
            
            // Hero's Focus at max level (4) should look like cooldown state
            if (skillKey === 'passive' && skill.level >= 4) {
                card.classList.add('skill-cooldown');
                if (readyButton) {
                    readyButton.textContent = 'MAX';
                    readyButton.style.opacity = '0.7';
                    readyButton.style.display = 'flex';
                }
            } else if (isOnCooldown) {
                card.classList.add('skill-cooldown');
                if (cooldownText) {
                    cooldownText.textContent = `Cooldown ${Math.ceil(cooldownRemaining / 1000)}s`;
                    cooldownText.style.display = 'flex';
                }
            } else {
                card.classList.add('skill-ready');
                // Show READY button
                if (readyButton) {
                    // For Battle Spirit, always show READY (unlimited levels)
                    // For Hero's Focus, show MAX if at level 4
                    if (skillKey === 'passive' && skill.level >= 4) {
                        readyButton.textContent = 'MAX';
                        readyButton.style.opacity = '0.7';
                    } else {
                        readyButton.textContent = 'READY';
                        readyButton.style.opacity = '1';
                    }
                    readyButton.style.display = 'flex';
                }
            }
            
            return;
        }
        
        // Handle skills with cooldown (Heroic Delay, Crowd Boost)
        const cooldownDuration = SKILL_COOLDOWNS[skillKey] * 1000;
        
        // Calculate cooldown progress
        let cooldownRemaining = 0;
        let isOnCooldown = false;
        let isActive = false;
        let activeRemaining = 0;
        
        if (skill.cooldownEndTime > now) {
            cooldownRemaining = skill.cooldownEndTime - now;
            isOnCooldown = true;
        }
        
        // Check if Crowd Boost is active
        if (skillKey === 'crowdboost' && skill.activeEndTime > now) {
            isActive = true;
            activeRemaining = skill.activeEndTime - now;
        }
        
        // Hide/show UI elements based on state
        const cooldownText = card.querySelector('.cooldown-text');
        const readyButton = card.querySelector('.ready-button');
        
        // Hide all first
        if (cooldownText) cooldownText.style.display = 'none';
        if (readyButton) readyButton.style.display = 'none';
        
        // Update card visual state
        card.classList.remove('skill-ready', 'skill-cooldown', 'skill-active');
        
        if (isActive && skillKey === 'crowdboost') {
            card.classList.add('skill-active');
            if (cooldownText) {
                cooldownText.textContent = `Active ${Math.ceil(activeRemaining / 1000)}s`;
                cooldownText.style.display = 'flex';
            }
        } else if (isOnCooldown) {
            card.classList.add('skill-cooldown');
            if (cooldownText) {
                cooldownText.textContent = `Cooldown ${Math.ceil(cooldownRemaining / 1000)}s`;
                cooldownText.style.display = 'flex';
            }
        } else {
            card.classList.add('skill-ready');
            if (readyButton) {
                readyButton.textContent = 'READY';
                readyButton.style.display = 'flex';
            }
        }
    });
}

// Emoji array for victory and wealth theme
const victoryEmojis = [
    '🏆', '💰', '💎', '⭐', '👑', '💵', '🎉', '✨', '💫', '🎊',
    '💍', '🔮', '🎁', '🏅', '🥈', '🥉', '🎖️', '💐', '🌹', '🔥',
    '💜', '💙', '❤️', '🎈', '🎀', '💯'
];

// Sound pool for instant playback
let audioPool = [];
let audioEnabled = false;
let backgroundMusic = null;
let arenaMusic = null; // Music for success screen
const AUDIO_POOL_SIZE = 5; // Pool size for rapid clicks

// Initialize background music
function initBackgroundMusic() {
    backgroundMusic = new Audio('assets/sounds/eternal_story_backgroud_music.wav');
    backgroundMusic.volume = 0.4; // Set volume to 50% for background music
    backgroundMusic.loop = true; // Enable looping
    backgroundMusic.preload = 'auto';
    
    // Initialize arena music for success screen
    arenaMusic = new Audio('assets/sounds/arena_music_hub.wav');
    arenaMusic.volume = 1; // Set volume to 50% for arena music
    arenaMusic.loop = true; // Enable looping
    arenaMusic.preload = 'auto';
}

// Stop background music and start arena music
function switchToArenaMusic() {
    if (backgroundMusic && !backgroundMusic.paused) {
        backgroundMusic.pause();
    }
    
    if (arenaMusic && audioEnabled) {
        arenaMusic.currentTime = 0; // Reset to start
        arenaMusic.play().catch(() => {
            // Music might not be ready yet
        });
    }
}

// Stop arena music and resume background music
function switchToBackgroundMusic() {
    if (arenaMusic && !arenaMusic.paused) {
        arenaMusic.pause();
        arenaMusic.currentTime = 0; // Reset to start
    }
    
    if (backgroundMusic && audioEnabled && backgroundMusic.paused) {
        backgroundMusic.play().catch(() => {
            // Music might not be ready yet
        });
    }
}

// Initialize audio pool
function initAudioPool() {
    for (let i = 0; i < AUDIO_POOL_SIZE; i++) {
        const audio = new Audio('assets/sounds/hero_popup_level_up.wav');
        audio.volume = 1.0;
        audio.preload = 'auto';
        audioPool.push(audio);
    }
}

// Enable audio on first user interaction (enhanced for PWA compatibility)
function enableAudio() {
    if (!audioEnabled) {
        // Unlock ALL audio objects for PWA compatibility
        // iOS PWA requires explicit unlock of each Audio object
        const unlockPromises = [];
        
        // Unlock audio pool
        if (audioPool.length > 0) {
            const testAudio = audioPool[0];
            unlockPromises.push(
                testAudio.play().then(() => {
                    testAudio.pause();
                    testAudio.currentTime = 0;
                }).catch(() => {
                    // Audio might not be ready yet
                })
            );
        }
        
        // Unlock background music
        if (backgroundMusic) {
            unlockPromises.push(
                backgroundMusic.play().then(() => {
                    backgroundMusic.pause();
                    backgroundMusic.currentTime = 0;
                }).catch(() => {
                    // Audio might not be ready yet
                })
            );
        }
        
        // Unlock arena music
        if (arenaMusic) {
            unlockPromises.push(
                arenaMusic.play().then(() => {
                    arenaMusic.pause();
                    arenaMusic.currentTime = 0;
                }).catch(() => {
                    // Audio might not be ready yet
                })
            );
        }
        
        // Mark audio as enabled after at least one succeeds
        Promise.allSettled(unlockPromises).then(() => {
            audioEnabled = true;
            // Start background music once audio is enabled (only if game has started)
            if (gameStarted) {
                startBackgroundMusic();
            }
        });
    }
}

// Start background music
function startBackgroundMusic() {
    // Only start music if game has started (first tap occurred)
    if (gameStarted && backgroundMusic && audioEnabled && backgroundMusic.paused) {
        backgroundMusic.play().catch(() => {
            // Music might not be ready yet
        });
    }
}

// Play attack sound from pool
function playAttackSound() {
    // Enable audio on first interaction (try to unlock if not enabled)
    if (!audioEnabled) {
        enableAudio();
    }
    
    // Find an available audio from pool
    let audio = audioPool.find(a => a.paused || a.ended);
    
    // If all are playing, use the first one (will interrupt if needed)
    if (!audio && audioPool.length > 0) {
        audio = audioPool[0];
    }
    
    if (audio) {
        // Reset to start for consistent playback
        audio.currentTime = 0;
        audio.play().then(() => {
            // If play succeeded, audio is now enabled
            if (!audioEnabled) {
                audioEnabled = true;
                // Start background music once audio is enabled (only if game has started)
                startBackgroundMusic();
            }
        }).catch(() => {
            // If play failed, audio might not be unlocked yet
            // Will retry on next interaction
        });
    }
}

// Play level up sound
function playLevelUpSound() {
    const levelUpAudio = new Audio('assets/sounds/hero_popup_upgrade_1000.wav');
    levelUpAudio.volume = 1.0;
    levelUpAudio.play().catch(() => {
        // Ignore errors - might not be unlocked yet
    });
}

// Play skill upgrade sound (for READY skill activation)
function playSkillUpgradeSound() {
    const upgradeAudio = new Audio('assets/sounds/hero_popup_upgrade_1000.wav');
    upgradeAudio.volume = 1.0;
    upgradeAudio.play().catch(() => {
        // Ignore errors - might not be unlocked yet
    });
}

// Play skill block sound (for Cooldown/Active clicks)
function playSkillBlockSound() {
    const blockAudio = new Audio('assets/sounds/ATTACK@0.wav');
    blockAudio.volume = 1.0;
    blockAudio.play().catch(() => {
        // Ignore errors - might not be unlocked yet
    });
}

// Initialize Spine hand animation
function initHandAnimation() {
    const handContainer = document.getElementById('onboarding-hand');
    if (!handContainer) return;
    
    // Don't initialize if already initialized and game has started
    if (handApp && gameStarted) return;
    
    // Clean up existing animation if any
    if (handApp) {
        hideHandAnimation();
    }
    
    // Clear any existing fallback
    const existingFallback = handContainer.querySelector('.fallback-hand');
    if (existingFallback) {
        existingFallback.remove();
    }
    
    try {
        // Create Pixi Application
        handApp = new PIXI.Application({
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: 0x000000,
            backgroundAlpha: 0,
            antialias: true,
            autoDensity: true,
            resolution: window.devicePixelRatio || 1
        });
        
        handContainer.appendChild(handApp.view);
        
        // Load Spine animation
        // In Pixi.js 7, Loader may not be available, so we use direct fetch
        const loadSpineAnimation = async () => {
            try {
                // Try using Assets API first (Pixi.js 7+)
                if (PIXI.Assets) {
                    try {
                        await PIXI.Assets.load('assets/animation/hand.spine');
                        const spineResource = PIXI.Assets.get('assets/animation/hand.spine');
                        
                        if (spineResource && spineResource.spineData) {
                            createSpineFromData(spineResource.spineData, handContainer);
                            return;
                        }
                    } catch (assetsError) {
                        console.log('Assets API failed, trying direct load:', assetsError);
                    }
                }
                
                // Try Loader if available (from pixi-spine plugin)
                // This is the standard way to load Spine files with pixi-spine
                if (typeof PIXI.Loader !== 'undefined') {
                    const loader = new PIXI.Loader();
                    loader.add('hand', 'assets/animation/hand.spine');
                    
                    loader.load((loader, resources) => {
                        if (resources.hand && resources.hand.spineData) {
                            createSpineFromData(resources.hand.spineData, handContainer);
                        } else {
                            console.warn('Spine data not found in resources, using fallback');
                            showFallbackHand(handContainer);
                        }
                    });
                    
                    loader.onError.add((error, loader, resource) => {
                        console.warn('Loader error (using fallback):', error);
                        showFallbackHand(handContainer);
                    });
                    return;
                }
                
                // If Loader is not available, show fallback immediately
                // We don't use fetch because it doesn't work with file:// protocol
                console.warn('PIXI.Loader not available, using fallback emoji hand');
                showFallbackHand(handContainer);
            } catch (error) {
                console.error('Error in loadSpineAnimation:', error);
                showFallbackHand(handContainer);
            }
        };
        
        loadSpineAnimation();
        
        // Handle window resize
        const resizeHandler = () => {
            if (handApp) {
                handApp.renderer.resize(window.innerWidth, window.innerHeight);
                if (handSpine) {
                    handSpine.x = handApp.screen.width / 2;
                    handSpine.y = handApp.screen.height / 2;
                }
            }
        };
        
        window.addEventListener('resize', resizeHandler);
    } catch (error) {
        console.error('Error initializing Pixi:', error);
        // Fallback: show emoji hand
        showFallbackHand(handContainer);
    }
}

// Helper function to create Spine from data
function createSpineFromData(spineData, handContainer) {
    try {
        handSpine = new PIXI.spine.Spine(spineData);
        
        // Center the animation
        handSpine.x = handApp.screen.width / 2;
        handSpine.y = handApp.screen.height / 2;
        
        // Scale if needed (adjust based on your animation size)
        handSpine.scale.set(1);
        
        // Set animation - try different common animation names
        let animationSet = false;
        const animNames = ['animation', 'idle', 'default', 'tap', 'point'];
        
        for (const animName of animNames) {
            if (handSpine.state.hasAnimation(animName)) {
                handSpine.state.setAnimation(0, animName, true);
                animationSet = true;
                break;
            }
        }
        
        if (!animationSet) {
            // Try to get first available animation
            const animations = spineData.animations;
            if (animations && animations.length > 0) {
                handSpine.state.setAnimation(0, animations[0].name, true);
                animationSet = true;
            }
        }
        
        if (!animationSet) {
            throw new Error('No animation found');
        }
        
        handApp.stage.addChild(handSpine);
        
        // Show hand animation only if game hasn't started
        if (!gameStarted) {
            handContainer.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error creating Spine from data:', error);
        // Fallback: show emoji hand
        showFallbackHand(handContainer);
    }
}

// Show fallback hand animation with image
function showFallbackHand(container) {
    // Clear any existing fallback elements
    const existingFallback = container.querySelector('.fallback-hand');
    const existingRipple = container.querySelector('.onboarding-ripple');
    const existingText = container.querySelector('.onboarding-text');
    
    if (existingFallback) existingFallback.remove();
    if (existingRipple) existingRipple.remove();
    if (existingText) existingText.remove();
    
    // Create hand image
    const handImg = document.createElement('img');
    handImg.src = 'assets/hand-static.png';
    handImg.className = 'fallback-hand';
    handImg.alt = 'Tap here';
    container.appendChild(handImg);
    
    // Create ripple effect
    const ripple = document.createElement('div');
    ripple.className = 'onboarding-ripple';
    container.appendChild(ripple);
    
    // Create text
    const text = document.createElement('div');
    text.className = 'onboarding-text';
    text.textContent = 'Tap as fast as you can!';
    container.appendChild(text);
    
    // Show only if game hasn't started
    if (!gameStarted) {
        container.classList.remove('hidden');
    }
}

// Hide hand animation
function hideHandAnimation() {
    const handContainer = document.getElementById('onboarding-hand');
    if (handContainer) {
        handContainer.classList.add('hidden');
        
        // Remove all fallback elements
        const fallback = handContainer.querySelector('.fallback-hand');
        const ripple = handContainer.querySelector('.onboarding-ripple');
        const text = handContainer.querySelector('.onboarding-text');
        
        if (fallback) fallback.remove();
        if (ripple) ripple.remove();
        if (text) text.remove();
    }
    
    // Clean up Pixi resources
    if (handApp) {
        try {
            handApp.destroy(true, { children: true, texture: true, baseTexture: true });
        } catch (error) {
            console.error('Error destroying Pixi app:', error);
        }
        handApp = null;
        handSpine = null;
    }
}

// Handle tap
function handleTap(event) {
    // Enable audio on first tap (critical for PWA compatibility on iOS)
    if (!audioEnabled) {
        enableAudio();
    }
    
    // Start game on first tap
    if (!gameStarted) {
        gameStarted = true;
        // Hide hand animation on first tap
        hideHandAnimation();
        
        // Set initial cooldown for all skills (so they start on cooldown, not ready)
        const now = Date.now();
        Object.keys(gameState.skills).forEach(skillKey => {
            const cooldownDuration = SKILL_COOLDOWNS[skillKey] * 1000;
            gameState.skills[skillKey].cooldownEndTime = now + cooldownDuration;
        });
        
        // Show skills grid (fade in)
        const skillsGrid = document.querySelector('.skills-grid');
        if (skillsGrid) {
            skillsGrid.classList.remove('skills-hidden');
        }
        
        // Start background music if audio is enabled
        if (audioEnabled) {
            startBackgroundMusic();
        }
    }
    
    // Calculate actual coins per tap with all bonuses (same logic as updateUI)
    const battleSpiritSkill = gameState.skills.tap;
    const tapLevel = battleSpiritSkill.level || 0;
    const tapMultiplier = getBattleSpiritMultiplier(tapLevel); // Progressive squaring
    
    const heroBonuses = getHeroEvolutionBonuses();
    const baseTap = gameState.coinsPerTap;
    let actualCoinsPerTap = baseTap * tapMultiplier * heroBonuses.tapBonus * heroBonuses.totalBonus * gameState.incomeMultiplier;
    
    // Level 5 special: 20% chance for double tap
    if (heroBonuses.specialBonus === 'doubleTapChance' && Math.random() < 0.2) {
        actualCoinsPerTap *= 2;
    }
    
    // Only add coins if time is still remaining
    if (gameState.timeLeft > 0) {
        gameState.coins += actualCoinsPerTap;
    }
    gameState.taps++;
    
    // Play attack sound
    playAttackSound();
    
    // Add experience for level progression (only if not at max level)
    if (gameState.level < MAX_LEVEL) {
        gameState.experience += 1;
        
        // Check for level up
        if (gameState.experience >= gameState.experienceToNextLevel) {
            levelUp();
        }
    }
    
    // Show coin gain effect at click position with actual coins per tap
    let clickX = null;
    let clickY = null;
    if (event) {
        if (event.clientX !== undefined) {
            clickX = event.clientX;
            clickY = event.clientY;
        } else if (event.touches && event.touches.length > 0) {
            clickX = event.touches[0].clientX;
            clickY = event.touches[0].clientY;
        }
    }
    showCoinEffect(actualCoinsPerTap, clickX, clickY);
    
    // Show ripple effect at tap position
    showRippleEffect(clickX, clickY);
    
    // Launch emojis from center
    launchEmojis();
    
    updateUI();
    saveGameState();
}

// Level up
function levelUp() {
    if (gameState.level >= MAX_LEVEL) {
        return; // Don't level up if already at max level
    }
    
    gameState.level++;
    gameState.experience = 0;
    
    // Set experience requirement for next level (progressive system)
    gameState.experienceToNextLevel = getExperienceForLevel(gameState.level);
    
    // Don't modify base coinsPerTap and coinsPerSecond - they are now modified by skills and bonuses
    // Base values stay constant, bonuses come from skills and hero evolution
    
    // Update character image
    updateCharacterImage();
    
    // Play level up sound
    playLevelUpSound();
    
    // Visual feedback for level up
    showLevelUpEffect();
    
    // Launch powerful emoji burst
    launchEmojis(true); // true = level up burst mode
}

// Launch emojis from center of screen
// isLevelUpBurst: if true, launches powerful celebratory burst (20-30 emojis)
function launchEmojis(isLevelUpBurst = false) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Level up burst mode - powerful celebratory explosion
    if (isLevelUpBurst) {
        const emojiCount = 20 + Math.floor(Math.random() * 11); // 20-30 emojis
        const levelUpEmojis = ['🎉', '⭐', '🏆', '💎', '✨', '🔥']; // Celebratory emojis
        const sizes = [30, 35, 40, 45, 50]; // Larger sizes
        const animationDuration = 2.0 + Math.random() * 0.5; // 2.0-2.5 seconds
        const distanceMin = 200;
        const distanceMax = 500; // Wider spread
        const rotationMin = 360;
        const rotationMax = 1440; // 1-4 full rotations
        
        // Launch emojis in all directions
        for (let i = 0; i < emojiCount; i++) {
            const emoji = levelUpEmojis[Math.floor(Math.random() * levelUpEmojis.length)];
            const size = sizes[Math.floor(Math.random() * sizes.length)];
            const startSize = size;
            const endSize = size * 2;
            
            const angle = Math.random() * 360;
            const distance = distanceMin + Math.random() * (distanceMax - distanceMin);
            const radians = (angle * Math.PI) / 180;
            const endX = centerX + Math.cos(radians) * distance;
            const endY = centerY + Math.sin(radians) * distance;
            
            const rotationDirection = Math.random() > 0.5 ? 1 : -1;
            const rotationSpeed = rotationMin + Math.random() * (rotationMax - rotationMin);
            
            const emojiElement = document.createElement('div');
            emojiElement.className = 'flying-emoji';
            emojiElement.textContent = emoji;
            emojiElement.style.cssText = `
                position: fixed;
                left: ${centerX}px;
                top: ${centerY}px;
                font-size: ${startSize}px;
                pointer-events: none;
                z-index: 0;
                transform: translate(-50%, -50%);
            `;
            
            const animationId = `levelUpEmoji_${Date.now()}_${i}`;
            const style = document.createElement('style');
            const translateX = endX - centerX;
            const translateY = endY - centerY;
            style.textContent = `
                @keyframes ${animationId} {
                    0% {
                        transform: translate(-50%, -50%) translate(0, 0) scale(1) rotate(0deg);
                        opacity: 0.3;
                    }
                    100% {
                        transform: translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(${endSize / startSize}) rotate(${rotationDirection * rotationSpeed}deg);
                        opacity: 1;
                    }
                }
                .flying-emoji-${animationId} {
                    animation: ${animationId} ${animationDuration}s ease-out forwards;
                }
            `;
            document.head.appendChild(style);
            
            emojiElement.classList.add(`flying-emoji-${animationId}`);
            document.body.appendChild(emojiElement);
            
            setTimeout(() => {
                emojiElement.remove();
                style.remove();
            }, animationDuration * 1000);
        }
        return; // Exit early for level up burst
    }
    
    // Regular emoji launch (existing logic)
    // Get level-based parameters
    const level = Math.min(gameState.level, MAX_LEVEL);
    let emojiCountMin, emojiCountMax, animationDuration, distanceMin, distanceMax, rotationMin, rotationMax;
    
    switch(level) {
        case 1:
            emojiCountMin = 0;
            emojiCountMax = 1;
            animationDuration = 2.0; // seconds
            distanceMin = 150;
            distanceMax = 250;
            rotationMin = 270;
            rotationMax = 810;
            break;
        case 2:
            emojiCountMin = 1;
            emojiCountMax = 1;
            animationDuration = 1.8;
            distanceMin = 150;
            distanceMax = 250;
            rotationMin = 270;
            rotationMax = 810;
            break;
        case 3:
            emojiCountMin = 1;
            emojiCountMax = 2;
            animationDuration = 1.6;
            distanceMin = 175;
            distanceMax = 300;
            rotationMin = 315;
            rotationMax = 945;
            break;
        case 4:
            emojiCountMin = 2;
            emojiCountMax = 2;
            animationDuration = 1.55;
            distanceMin = 187;
            distanceMax = 325;
            rotationMin = 337;
            rotationMax = 1012;
            break;
        case 5: // Max level - original values
            emojiCountMin = 5;
            emojiCountMax = 8;
            animationDuration = 1.5;
            distanceMin = 200;
            distanceMax = 350;
            rotationMin = 360;
            rotationMax = 1080;
            break;
        default:
            // Fallback (shouldn't happen)
            emojiCountMin = 5;
            emojiCountMax = 8;
            animationDuration = 1.5;
            distanceMin = 200;
            distanceMax = 350;
            rotationMin = 360;
            rotationMax = 1080;
    }
    
    // Launch random number of emojis based on level
    const emojiCount = Math.floor(Math.random() * (emojiCountMax - emojiCountMin + 1)) + emojiCountMin;
    
    for (let i = 0; i < emojiCount; i++) {
        // Random emoji from array
        const emoji = victoryEmojis[Math.floor(Math.random() * victoryEmojis.length)];
        
        // Random size (one of 5 sizes: 24px, 32px, 40px, 48px, 56px)
        const sizes = [24, 32, 40, 48, 56];
        const size = sizes[Math.floor(Math.random() * sizes.length)];
        const startSize = size;
        const endSize = size * 2; // Double size during flight
        
        // Random direction (0 to 360 degrees)
        const angle = Math.random() * 360;
        const distance = distanceMin + Math.random() * (distanceMax - distanceMin);
        
        // Calculate end position
        const radians = (angle * Math.PI) / 180;
        const endX = centerX + Math.cos(radians) * distance;
        const endY = centerY + Math.sin(radians) * distance;
        
        // Random rotation direction and speed
        const rotationDirection = Math.random() > 0.5 ? 1 : -1;
        const rotationSpeed = rotationMin + Math.random() * (rotationMax - rotationMin);
        
        // Create emoji element
        const emojiElement = document.createElement('div');
        emojiElement.className = 'flying-emoji';
        emojiElement.textContent = emoji;
        emojiElement.style.cssText = `
            position: fixed;
            left: ${centerX}px;
            top: ${centerY}px;
            font-size: ${startSize}px;
            pointer-events: none;
            z-index: 0;
            transform: translate(-50%, -50%);
        `;
        
        // Generate unique animation name
        const animationId = `emojiFly_${Date.now()}_${i}`;
        
        // Add keyframes for this specific emoji
        const style = document.createElement('style');
        const translateX = endX - centerX;
        const translateY = endY - centerY;
        style.textContent = `
            @keyframes ${animationId} {
                0% {
                    transform: translate(-50%, -50%) translate(0, 0) scale(1) rotate(0deg);
                    opacity: 0.3;
                }
                100% {
                    transform: translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(${endSize / startSize}) rotate(${rotationDirection * rotationSpeed}deg);
                    opacity: 1;
                }
            }
            .flying-emoji-${animationId} {
                animation: ${animationId} ${animationDuration}s ease-out forwards;
            }
        `;
        document.head.appendChild(style);
        
        emojiElement.classList.add(`flying-emoji-${animationId}`);
        document.body.appendChild(emojiElement);
        
        // Remove element and style after animation
        setTimeout(() => {
            emojiElement.remove();
            style.remove();
        }, animationDuration * 1000);
    }
}

// Show coin effect
function showCoinEffect(amount, clickX, clickY) {
    const effect = document.createElement('div');
    effect.textContent = `+${formatNumber(amount)}`;
    effect.style.cssText = `
        position: fixed;
        pointer-events: none;
        color: #FFFDED;
        font-weight: bold;
        font-size: 24px;
        z-index: 1000;
        white-space: nowrap;
        animation: coinFloat 1s ease-out forwards;
    `;
    
    // Use click position if available, otherwise fallback to character position
    let posX, posY;
    if (clickX !== null && clickY !== null && typeof clickX === 'number' && typeof clickY === 'number' && !isNaN(clickX) && !isNaN(clickY)) {
        // Random offset on X axis from -30px to 30px
        const randomOffsetX = (Math.random() * 60) - 30; // Range: -30 to 30
        posX = clickX + randomOffsetX;
        posY = clickY;
    } else {
        // Fallback to character position
        const character = document.getElementById('character');
        const rect = character.getBoundingClientRect();
        posX = rect.left + rect.width / 2;
        posY = rect.top + rect.height / 2;
    }
    
    // Position the element and center it horizontally using transform
    effect.style.left = posX + 'px';
    effect.style.top = posY + 'px';
    
    document.body.appendChild(effect);
    
    setTimeout(() => effect.remove(), 1000);
}

// Show ripple effect at tap position
function showRippleEffect(clickX, clickY) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple-effect';
    
    // Use click position if available, otherwise fallback to character position
    let posX, posY;
    if (clickX !== null && clickY !== null && typeof clickX === 'number' && typeof clickY === 'number' && !isNaN(clickX) && !isNaN(clickY)) {
        // Use exact click position (no random offset)
        posX = clickX;
        posY = clickY;
    } else {
        // Fallback to character position
        const character = document.getElementById('character');
        const rect = character.getBoundingClientRect();
        posX = rect.left + rect.width / 2;
        posY = rect.top + rect.height / 2;
    }
    
    // Position the ripple effect centered on click position
    ripple.style.left = posX + 'px';
    ripple.style.top = posY + 'px';
    
    document.body.appendChild(ripple);
    
    // Remove element after animation completes
    setTimeout(() => ripple.remove(), 600);
}

// Add coin float animation
const style = document.createElement('style');
style.textContent = `
    @keyframes coinFloat {
        0% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
        }
        100% {
            opacity: 0;
            transform: translate(-50%, -150px) scale(1.5);
        }
    }
`;
document.head.appendChild(style);

// Show level up effect
function showLevelUpEffect() {
    const effect = document.createElement('div');
    effect.textContent = `LEVEL ${gameState.level}!`;
    effect.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        color: #ffd700;
        font-weight: bold;
        font-size: 40px;
        z-index: 1000;
        text-shadow: 0 0 20px #ffd700;
        animation: levelUpPulse 1s ease-out forwards;
    `;
    
    document.body.appendChild(effect);
    
    setTimeout(() => effect.remove(), 1000);
}

// Show skill activation effect
function showSkillActivation(skillName) {
    const effect = document.createElement('div');
    effect.textContent = skillName.toUpperCase() + '!';
    effect.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        color: #ffd700;
        font-weight: bold;
        font-size: 40px;
        z-index: 1000;
        text-shadow: 0 0 20px #ffd700;
        animation: levelUpPulse 1s ease-out forwards;
    `;
    
    document.body.appendChild(effect);
    
    setTimeout(() => effect.remove(), 1000);
}

// Show light wave effect for Crowd Boost
function showLightWave() {
    const wave = document.createElement('div');
    wave.className = 'light-wave';
    document.body.appendChild(wave);
    
    setTimeout(() => wave.remove(), 1000);
}

// Add level up animation
const levelUpStyle = document.createElement('style');
levelUpStyle.textContent = `
    @keyframes levelUpPulse {
        0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }
        100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(2.5);
        }
    }
`;
document.head.appendChild(levelUpStyle);

// Motivational tips array
const MOTIVATIONAL_TIPS = [
    "⚡ Speed up, valuable rewards ahead!",
    "👆 Use two fingers, it's faster!",
    "🔥 Keep tapping! Every tap counts!",
    "💪 You've got this! Push harder!",
    "🚀 Accelerate! Time is running out!",
    "⭐ Don't slow down now! Great rewards await!",
    "🎯 Focus and tap faster!",
    "💎 The faster you tap, the more you earn!",
    "⚡ Speed = Success! Keep going!",
    "🔥 You're too slow! Tap faster!",
    "👆 Use both hands for maximum speed!",
    "💪 Challenge yourself! Tap at maximum speed!",
    "🚀 Acceleration is key! Don't stop now!"
];

// Show toast notification
function showToast(message) {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove toast after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Show motivational toast (yellow, top position)
function showMotivationalToast(message) {
    // Remove existing motivational toast if any
    const existingToast = document.querySelector('.motivational-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'motivational-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove toast after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Skill name mapping
const SKILL_NAMES = {
    tap: 'Battle Spirit',
    passive: 'Hero\'s Focus',
    time1: 'Heroic Delay',
    crowdboost: 'Crowd Boost'
};

// Skill effects (levels increase automatically on activation)
const SKILL_EFFECTS = {
    tap: [2, 4, 16, 256], // Battle Spirit multipliers (each level squares the previous value)
    passive: [10, 20, 40, 80] // Hero's Focus base passive income
};

// Calculate Battle Spirit multiplier (power progression, unlimited levels)
function getBattleSpiritMultiplier(level) {
    if (level <= 0) return 1;
    // Level 1: 2¹ = 2, Level 2: 2² = 4, Level 3: 2³ = 8, Level 4: 2⁴ = 16, Level 5: 2⁵ = 32, etc.
    return Math.pow(2, level);
}

// Calculate Hero's Focus passive bonus (power of 10 progression, max level 4)
function getHeroFocusPassiveBonus(level) {
    if (level <= 0) return 0;
    // Level 1: 10¹ = 10, Level 2: 10² = 100, Level 3: 10³ = 1000, Level 4: 10⁴ = 10000
    return Math.pow(10, level);
}

// Hero Evolution bonuses by level
const HERO_EVOLUTION_BONUSES = {
    1: { passiveBonus: 1.0, tapBonus: 1.0, totalBonus: 1.0, specialBonus: null },
    2: { passiveBonus: 1.05, tapBonus: 1.0, totalBonus: 1.0, specialBonus: null }, // +5% к пассиву
    3: { passiveBonus: 1.0, tapBonus: 1.10, totalBonus: 1.0, specialBonus: null }, // +10% к тапу
    4: { passiveBonus: 1.0, tapBonus: 1.0, totalBonus: 1.15, specialBonus: null }, // +15% ко всему
    5: { passiveBonus: 1.0, tapBonus: 1.0, totalBonus: 1.0, specialBonus: 'doubleTapChance' } // 20% шанс двойного тапа
};

// Get current hero evolution bonuses
function getHeroEvolutionBonuses() {
    return HERO_EVOLUTION_BONUSES[gameState.level] || HERO_EVOLUTION_BONUSES[1];
}

// Activate skill (cooldown-based activation, levels increase automatically)
function activateSkill(skillKey) {
    if (!gameStarted) return;
    
    const skill = gameState.skills[skillKey];
    const now = Date.now();
    
    // Check if skill is on cooldown (for all skills)
    if (skill.cooldownEndTime > now) {
        const remaining = Math.ceil((skill.cooldownEndTime - now) / 1000);
        showToast(`Cooldown: ${remaining}s`);
        playSkillBlockSound();
        return;
    }
    
    // Check if Crowd Boost is already active
    if (skillKey === 'crowdboost' && skill.activeEndTime > now) {
        const remaining = Math.ceil((skill.activeEndTime - now) / 1000);
        showToast(`Already active: ${remaining}s remaining`);
        playSkillBlockSound();
        return;
    }
    
    // Play upgrade sound for successful activation
    playSkillUpgradeSound();
    
    // Handle skills with levels (Battle Spirit, Hero's Focus) - increase level automatically
    if ((skillKey === 'tap' || skillKey === 'passive') && skill.level !== undefined) {
        // For Battle Spirit: unlimited levels (power of 2 progression)
        // For Hero's Focus: max level 4 (power of 10 progression)
        const maxLevel = (skillKey === 'tap') ? Infinity : 4;
        
        if (skill.level < maxLevel) {
            skill.level++;
            
            // Store multiplier/effect (will be used in formulas)
            if (skillKey === 'tap') {
                skill.multiplier = getBattleSpiritMultiplier(skill.level);
            } else if (skillKey === 'passive') {
                skill.passiveBonus = getHeroFocusPassiveBonus(skill.level);
            }
            
            showSkillActivation(SKILL_NAMES[skillKey] + ' Level ' + skill.level);
        } else {
            // Max level reached - show message and don't activate
            if (skillKey === 'passive' && skill.level >= 4) {
                showToast('Max level reached!');
                playSkillBlockSound();
                return; // Don't set cooldown or activate
            }
            showSkillActivation(SKILL_NAMES[skillKey]);
        }
    } else {
        // Regular skill activation
        if (skillKey === 'time1') {
            gameState.timeLeft += 10;
            showSkillActivation(SKILL_NAMES.time1);
        } else if (skillKey === 'crowdboost') {
            // Activate Crowd Boost for 5 seconds
            skill.activeEndTime = now + (CROWD_BOOST_DURATION * 1000);
            gameState.incomeMultiplier = 3;
            
            // Vibration effect
            if (navigator.vibrate) {
                navigator.vibrate(200);
            }
            
            // Light wave effect
            showLightWave();
            
            showSkillActivation(SKILL_NAMES.crowdboost);
        }
    }
    
    // Set cooldown end time for all skills
    const cooldownDuration = SKILL_COOLDOWNS[skillKey] * 1000;
    skill.cooldownEndTime = now + cooldownDuration;
    
    updateUI();
    saveGameState();
}

// Update skill cooldowns and active states
function updateSkillCooldowns() {
    if (!gameStarted) return;
    
    const now = Date.now();
    
    // Check if Crowd Boost active time has expired
    if (gameState.skills.crowdboost.activeEndTime > 0 && now >= gameState.skills.crowdboost.activeEndTime) {
        gameState.skills.crowdboost.activeEndTime = 0;
        gameState.incomeMultiplier = 1;
    }
}

// Passive coin generation
function generatePassiveCoins() {
    // Only generate coins if game has started and time is still remaining
    if (gameStarted && gameState.timeLeft > 0) {
        // Get Hero's Focus passive bonuses (progressive squaring)
        const heroFocusSkill = gameState.skills.passive;
        const passiveLevel = heroFocusSkill.level || 0;
        const passiveBonus = getHeroFocusPassiveBonus(passiveLevel); // Progressive squaring
        
        // Get Hero Evolution bonuses
        const heroBonuses = getHeroEvolutionBonuses();
        
        // Formula: PassiveIncome = (BasePassive + Σ(PassiveUpgrades²)) × PassiveLevelBonus × TotalBonus × CrowdBoost
        const basePassive = gameState.coinsPerSecond; // Base value
        const totalPassive = basePassive + passiveBonus;
        const passiveLevelBonus = heroBonuses.passiveBonus; // Level 2: +5% к пассиву
        const totalBonus = heroBonuses.totalBonus; // Level 4: +15% ко всему
        
        // Calculate passive income per frame (60fps)
        const passiveIncome = (totalPassive / 60) * passiveLevelBonus * totalBonus * gameState.incomeMultiplier;
        
        if (passiveIncome > 0) {
            gameState.coins += passiveIncome;
        }
    }
}

// Timer countdown
let lastSecond = -1;
let lastFrameTime = null;
let musicStopped = false; // Track if music was stopped for last 10 seconds
let finalCountdownShown = false; // Track if final countdown toast was shown

function updateTimer() {
    // Don't update timer until game has started
    if (!gameStarted) {
        return;
    }
    
    const now = performance.now();
    const nowTimestamp = Date.now();
    
    if (lastFrameTime === null) {
        lastFrameTime = now;
        return; // Skip first frame to calculate delta
    }
    
    const deltaTime = (now - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = now;
    
    // Show motivational tip every 10 seconds (but not in last 10 seconds)
    if (gameState.timeLeft > 10 && (nowTimestamp - lastMotivationalTipTime) >= MOTIVATIONAL_TIP_INTERVAL) {
        const randomTip = MOTIVATIONAL_TIPS[Math.floor(Math.random() * MOTIVATIONAL_TIPS.length)];
        showMotivationalToast(randomTip);
        lastMotivationalTipTime = nowTimestamp;
    }
    
    if (gameState.timeLeft > 0) {
        gameState.timeLeft -= deltaTime; // Decrease by actual time elapsed
        if (gameState.timeLeft <= 0) {
            gameState.timeLeft = 0;
            // Show success screen when timer reaches 0
            showSuccessScreen();
        }
        
        // Flash red when time left <= 10 seconds
        const currentSecond = Math.floor(gameState.timeLeft);
        if (gameState.timeLeft <= 10 && currentSecond !== lastSecond) {
            lastSecond = currentSecond;
            
            // Show final countdown toast when first hitting 10 seconds
            if (!finalCountdownShown && gameState.timeLeft <= 10 && gameState.timeLeft > 9) {
                showMotivationalToast("🔥 Final 10 seconds. FASTER!");
                finalCountdownShown = true;
            }
            
            const gameContainer = document.querySelector('.game-container');
            if (gameContainer) {
                // Add red flash
                gameContainer.classList.add('red-flash');
                
                // Stop background music when red flash starts (last 10 seconds) - only once
                if (!musicStopped && backgroundMusic && !backgroundMusic.paused) {
                    backgroundMusic.pause();
                    musicStopped = true;
                }
                
                // Remove flash after 500ms (half second - creates blinking effect)
                // setTimeout(() => {
                //     if (gameContainer) {
                //         gameContainer.classList.remove('red-flash');
                //     }
                // }, 500);
            }
        }
        
        // Stop flashing when time is above 10 seconds
        if (gameState.timeLeft > 10 && lastSecond !== -1) {
            const gameContainer = document.querySelector('.game-container');
            if (gameContainer) {
                gameContainer.classList.remove('red-flash');
                lastSecond = -1;
            }
            // Reset music stopped flag when time goes back above 10 seconds
            musicStopped = false;
        }
    }
}

// Show success screen
function showSuccessScreen() {
    const successScreen = document.getElementById('success-screen');
    if (!successScreen) return;
    
    // Update success screen data
    const wonCoinsAmount = document.getElementById('won-coins-amount');
    const wonCoinsDollar = document.getElementById('won-coins-dollar');
    const bonusPercentText = document.getElementById('bonus-percent-text');
    const successCharacterImg = document.getElementById('success-character-img');
    
    if (wonCoinsAmount) {
        wonCoinsAmount.textContent = formatNumber(gameState.coins);
    }
    
    // Calculate approximate dollar value (assuming ~35000 coins = $1)
    if (wonCoinsDollar) {
        const dollarValue = Math.round((gameState.coins / 35000) * 100) / 100;
        wonCoinsDollar.textContent = dollarValue.toFixed(2);
    }
    
    // Calculate absolute number of players using realistic statistics
    if (bonusPercentText) {
        const percentile = calculatePlayerPercentile(gameState.taps);
        const betterThanPercent = (1 - percentile) * 100;
        const playersBetterThan = Math.floor(TOTAL_PLAYERS * (betterThanPercent / 100));
        bonusPercentText.textContent = formatNumber(playersBetterThan);
    }
    
    // Update taps count
    const wonTapsCount = document.getElementById('won-taps-count');
    if (wonTapsCount) {
        wonTapsCount.textContent = formatNumber(gameState.taps);
    }
    
    // Update character image on success screen
    if (successCharacterImg) {
        const level = Math.min(gameState.level, MAX_LEVEL);
        successCharacterImg.src = `assets/HeroState_${level}.png`;
    }
    
    // Hide game container and center countdown, show success screen
    const centerCountdown = document.getElementById('center-countdown');
    if (centerCountdown) {
        centerCountdown.classList.remove('visible');
        centerCountdown.textContent = '';
    }
    
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.classList.remove('red-flash');
    }
    
    // Switch to arena music
    switchToArenaMusic();
    
    successScreen.classList.remove('hidden');
}

// Hide success screen
function hideSuccessScreen() {
    const successScreen = document.getElementById('success-screen');
    if (successScreen) {
        successScreen.classList.add('hidden');
        
        // Switch back to background music
        switchToBackgroundMusic();
    }
}

// Get app store URL based on user agent
function getAppStoreUrl() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera || '';
    
    // Check if Android (more comprehensive detection)
    if (/android/i.test(userAgent)) {
        return 'https://play.google.com/store/apps/details?id=com.nexters.herowars&hl=en';
    }
    
    // Default to iOS App Store (Hero Wars: Alliance)
    return 'https://apps.apple.com/us/app/hero-wars-alliance-fantasy/id1158967485';
}

// Full game reset (for Try again button)
function resetGameCompletely() {
    // Reset game state to initial values
    gameState.coins = 0;
    gameState.level = 1;
    gameState.experience = 0;
    gameState.experienceToNextLevel = getExperienceForLevel(1);
    gameState.coinsPerTap = 2;
    gameState.coinsPerSecond = 2;
    gameState.taps = 0;
    gameState.timeLeft = 60;
    gameState.incomeMultiplier = 1;
    gameState.skills = {
        tap: { level: 0, cooldownEndTime: 0, multiplier: 1 },
        passive: { level: 0, cooldownEndTime: 0 },
        time1: { cooldownEndTime: 0 },
        crowdboost: { cooldownEndTime: 0, activeEndTime: 0 }
    };
    
    // Reset game started flag
    gameStarted = false;
    
    // Reset timer frame time
    lastFrameTime = null;
    lastSecond = -1;
    musicStopped = false;
    finalCountdownShown = false;
    
    // Reset motivational tips timer
    lastMotivationalTipTime = 0;
    
    // Stop background music
    if (backgroundMusic && !backgroundMusic.paused) {
        backgroundMusic.pause();
    }
    
    // Hide skills grid again
    const skillsGrid = document.querySelector('.skills-grid');
    if (skillsGrid) {
        skillsGrid.classList.add('skills-hidden');
    }
    
    // Show hand animation again
    initHandAnimation();
    
    // Clear localStorage
    localStorage.removeItem('tapGameState');
    
    // Hide success screen
    hideSuccessScreen();
    
    // Update UI
    updateUI();
    
    // Reset character image
    updateCharacterImage();
}

// Throttled UI update (every 100ms for smooth updates)
let lastUIUpdate = 0;
function updateUIThrottled() {
    const now = Date.now();
    if (now - lastUIUpdate > 100) {
        updateUI();
        lastUIUpdate = now;
    }
}

// Reset game progress
function resetProgress() {
    if (confirm('Are you sure you want to reset all progress? This action cannot be undone.')) {
        // Reset game state to initial values
        gameState.coins = 0;
        gameState.level = 1;
        gameState.experience = 0;
        gameState.experienceToNextLevel = getExperienceForLevel(1);
        gameState.coinsPerTap = 2;
        gameState.coinsPerSecond = 2;
        gameState.taps = 0;
        gameState.timeLeft = 60;
        gameState.incomeMultiplier = 1;
        gameState.skills = {
            tap: { level: 0, cooldownEndTime: 0, multiplier: 1 },
            passive: { level: 0, cooldownEndTime: 0 },
            time1: { cooldownEndTime: 0 },
            crowdboost: { cooldownEndTime: 0, activeEndTime: 0 }
        };
        
        // Reset game started flag
        gameStarted = false;
        
        // Reset timer frame time
        lastFrameTime = null;
        lastSecond = -1;
        musicStopped = false;
        finalCountdownShown = false;
        
        // Reset tap speed tracking
        lastMotivationalTipTime = 0;
        
        // Stop background music
        if (backgroundMusic && !backgroundMusic.paused) {
            backgroundMusic.pause();
        }
        
        // Hide skills grid again
        const skillsGrid = document.querySelector('.skills-grid');
        if (skillsGrid) {
            skillsGrid.classList.add('skills-hidden');
        }
        
        // Show hand animation again
        initHandAnimation();
        
        // Clear localStorage
        localStorage.removeItem('tapGameState');
        
        // Update UI
        updateUI();
        
        // Show confirmation message
        alert('Progress successfully reset!');
    }
}

// Auto-scale game to fit screen
function autoScaleGame() {
    const body = document.body;
    const gameContainer = document.querySelector('.game-container');
    
    if (!gameContainer) return;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get content dimensions (game container natural size)
    // Game container has max-width based on height, so we calculate expected width
    const expectedWidth = Math.min(viewportWidth, viewportHeight * 9 / 16);
    const expectedHeight = viewportHeight;
    
    // Calculate scale factors
    const scaleX = viewportWidth / expectedWidth;
    const scaleY = viewportHeight / expectedHeight;
    
    // Use the smaller scale to ensure everything fits
    const scale = Math.min(scaleX, scaleY, 1); // Never scale up, only down
    
    // Apply transform to body
    body.style.transform = `scale(${scale})`;
    body.style.transformOrigin = 'top left';
    
    // Adjust body dimensions to compensate for scale
    // This prevents scrolling issues
    body.style.width = `${100 / scale}%`;
    body.style.height = `${100 / scale}%`;
}

// Initialize game
function initGame() {
    // loadGameState(); // Temporarily disabled for testing
    
    // Auto-scale game to fit screen
    autoScaleGame();
    
    // Re-scale on resize and orientation change
    window.addEventListener('resize', autoScaleGame);
    window.addEventListener('orientationchange', () => {
        setTimeout(autoScaleGame, 100); // Delay for orientation change to complete
    });
    
    // Initialize audio pool and background music
    initAudioPool();
    initBackgroundMusic();
    
    // For PWA: try to unlock audio on any early interaction
    // This helps with iOS PWA audio restrictions
    document.addEventListener('touchstart', enableAudio, { once: true, passive: true });
    document.addEventListener('click', enableAudio, { once: true, passive: true });
    
    // Hide skills grid until first tap
    const skillsGrid = document.querySelector('.skills-grid');
    if (skillsGrid && !gameStarted) {
        skillsGrid.classList.add('skills-hidden');
    }
    
    // Initialize hand animation (only shown if game hasn't started)
    initHandAnimation();
    
    // Tap handler
    const characterArea = document.querySelector('.middle-section');
    characterArea.addEventListener('click', (e) => {
        handleTap(e);
    });
    characterArea.addEventListener('touchstart', (e) => {
        if (e.cancelable) {
            e.preventDefault();
        }
        handleTap(e);
    });
    
    // Skill card handlers - make entire card clickable
    document.querySelectorAll('.skill-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            const skillKey = card.dataset.skill;
            if (skillKey) {
                activateSkill(skillKey);
            }
        });
        
        card.addEventListener('touchstart', (e) => {
            if (e.cancelable) {
                e.preventDefault();
            }
            e.stopPropagation();
            const skillKey = card.dataset.skill;
            if (skillKey) {
                activateSkill(skillKey);
            }
        });
    });
    
    // Reset button handler
    const resetButton = document.getElementById('reset-button');
    if (resetButton) {
        resetButton.addEventListener('click', resetProgress);
    }
    
    // Try again button handler (on success screen)
    const tryAgainButton = document.getElementById('try-again-button');
    if (tryAgainButton) {
        tryAgainButton.addEventListener('click', resetGameCompletely);
        tryAgainButton.addEventListener('touchstart', (e) => {
            if (e.cancelable) {
                e.preventDefault();
            }
            resetGameCompletely();
        });
    }
    
    // Claim button handler (on success screen)
    const claimButton = document.getElementById('claim-button');
    if (claimButton) {
        claimButton.addEventListener('click', () => {
            const url = getAppStoreUrl();
            window.open(url, '_blank');
        });
        claimButton.addEventListener('touchstart', (e) => {
            if (e.cancelable) {
                e.preventDefault();
            }
            const url = getAppStoreUrl();
            window.open(url, '_blank');
        });
    }
    
    // Keyboard shortcut for reset (R key)
    document.addEventListener('keydown', (e) => {
        // Check if R key is pressed (case insensitive)
        if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            // Don't trigger if typing in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                resetProgress();
            }
        }
    });
    
    // Game loop
    function gameLoop() {
        // Only update game if success screen is not shown
        const successScreen = document.getElementById('success-screen');
        if (!successScreen || successScreen.classList.contains('hidden')) {
            updateSkillCooldowns();
            generatePassiveCoins();
            updateTimer();
            updateUIThrottled();
        }
        requestAnimationFrame(gameLoop);
    }
    
    // Start game loop
    gameLoop();
    
    // Auto-save every 5 seconds
    setInterval(() => {
        saveGameState();
    }, 5000);
    
    // Initial UI update
    updateUI();
    
    // Initialize character image on load
    updateCharacterImage();
}

// Start game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}

