// Game State
const MAX_LEVEL = 5;
const EXPERIENCE_PER_LEVEL = 30;

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
    experienceToNextLevel: EXPERIENCE_PER_LEVEL,
    coinsPerTap: 1,
    coinsPerSecond: 1,
    taps: 0,
    timeLeft: 15,
    incomeMultiplier: 1, // For Crowd Boost effect
    skills: {
        tap: { cooldownEndTime: 0 },
        passive: { cooldownEndTime: 0 },
        time1: { cooldownEndTime: 0 },
        crowdboost: { cooldownEndTime: 0, activeEndTime: 0 }
    }
};

// Track if game has started (first tap occurred)
let gameStarted = false;

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
            // Migrate old skill structure to new cooldown structure
            const skillKeys = ['tap', 'passive', 'time1', 'crowdboost'];
            skillKeys.forEach(key => {
                if (!parsed.skills[key] || parsed.skills[key].cooldownEndTime === undefined) {
                    parsed.skills[key] = { cooldownEndTime: 0 };
                    if (key === 'crowdboost') {
                        parsed.skills[key].activeEndTime = 0;
                    }
                }
            });
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
    document.getElementById('coins-per-tap').textContent = formatNumber(gameState.coinsPerTap);
    document.getElementById('coins-per-sec').textContent = formatNumber(gameState.coinsPerSecond);
    
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
    
    // Update percent text (mock calculation based on taps)
    const mockPercent = Math.min(100, Math.floor(gameState.taps / 100));
    document.getElementById('percent-text').textContent = `You're better than ${Math.max(17, 100 - mockPercent)}% of players`;
    
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

// Enable audio on first user interaction
function enableAudio() {
    if (!audioEnabled && audioPool.length > 0) {
        // Try to play and immediately pause to unlock audio
        const testAudio = audioPool[0];
        testAudio.play().then(() => {
            testAudio.pause();
            testAudio.currentTime = 0;
            audioEnabled = true;
            
            // Start background music once audio is enabled (only if game has started)
            startBackgroundMusic();
        }).catch(() => {
            // Audio might not be ready yet, will retry on next interaction
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
    
    // Only add coins if time is still remaining
    if (gameState.timeLeft > 0) {
        gameState.coins += gameState.coinsPerTap * gameState.incomeMultiplier; // Apply multiplier
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
    
    // Visual feedback - press animation for character and pedestal
    const character = document.getElementById('character');
    const pedestal = document.querySelector('.pedestal');
    
    if (character && pedestal) {
        // Add press class
        character.classList.add('tap-press');
        pedestal.classList.add('tap-press');
        
        // Remove press class after animation completes (100ms)
        setTimeout(() => {
            character.classList.remove('tap-press');
            pedestal.classList.remove('tap-press');
        }, 100);
    }
    
    // Show coin gain effect at click position
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
    showCoinEffect(gameState.coinsPerTap, clickX, clickY);
    
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
    
    // Always need 5 clicks for next level (or no next level if at max)
    if (gameState.level < MAX_LEVEL) {
        gameState.experienceToNextLevel = EXPERIENCE_PER_LEVEL;
    } else {
        gameState.experienceToNextLevel = 999999; // Effectively infinite
    }
    
    // Increase coins per tap and per second on level up
    gameState.coinsPerTap = Math.floor(1 * Math.pow(1.2, gameState.level - 1));
    gameState.coinsPerSecond = Math.floor(gameState.coinsPerSecond * 1.1);
    
    // Update character image
    updateCharacterImage();
    
    // Play level up sound
    playLevelUpSound();
    
    // Visual feedback for level up
    showLevelUpEffect();
}

// Launch emojis from center of screen
function launchEmojis() {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
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

// Skill name mapping
const SKILL_NAMES = {
    tap: 'Iron Skies',
    passive: 'Hero\'s Focus',
    time1: 'Heroic Delay',
    crowdboost: 'Crowd Boost'
};

// Activate skill
function activateSkill(skillKey) {
    if (!gameStarted) return;
    
    const skill = gameState.skills[skillKey];
    const now = Date.now();
    
    // Check if skill is on cooldown
    if (skill.cooldownEndTime > now) {
        const remaining = Math.ceil((skill.cooldownEndTime - now) / 1000);
        showToast(`Cooldown: ${remaining}s`);
        // Play block sound for cooldown
        playSkillBlockSound();
        return;
    }
    
    // Check if Crowd Boost is already active
    if (skillKey === 'crowdboost' && skill.activeEndTime > now) {
        const remaining = Math.ceil((skill.activeEndTime - now) / 1000);
        showToast(`Already active: ${remaining}s remaining`);
        // Play block sound for active
        playSkillBlockSound();
        return;
    }
    
    // Play upgrade sound for successful activation (READY state)
    playSkillUpgradeSound();
    
    // Set cooldown end time
    const cooldownDuration = SKILL_COOLDOWNS[skillKey] * 1000;
    skill.cooldownEndTime = now + cooldownDuration;
    
    // Apply skill effect
    switch(skillKey) {
        case 'tap':
            gameState.coinsPerTap += 1;
            showSkillActivation(SKILL_NAMES.tap);
            break;
        case 'passive':
            gameState.coinsPerSecond += 7;
            showSkillActivation(SKILL_NAMES.passive);
            break;
        case 'time1':
            gameState.timeLeft += 10;
            showSkillActivation(SKILL_NAMES.time1);
            break;
        case 'crowdboost':
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
            break;
    }
    
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
    if (gameStarted && gameState.timeLeft > 0 && gameState.coinsPerSecond > 0) {
        const coinsToAdd = (gameState.coinsPerSecond / 60) * gameState.incomeMultiplier; // Apply multiplier
        gameState.coins += coinsToAdd;
    }
}

// Timer countdown
let lastSecond = -1;
let lastFrameTime = null;
let musicStopped = false; // Track if music was stopped for last 10 seconds

function updateTimer() {
    // Don't update timer until game has started
    if (!gameStarted) {
        return;
    }
    
    const now = performance.now();
    
    if (lastFrameTime === null) {
        lastFrameTime = now;
        return; // Skip first frame to calculate delta
    }
    
    const deltaTime = (now - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = now;
    
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
    
    // Calculate mock percent (same as in-game)
    if (bonusPercentText) {
        const mockPercent = Math.min(100, Math.floor(gameState.taps / 100));
        bonusPercentText.textContent = 100 - mockPercent;
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
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Check if Android
    if (/android/i.test(userAgent)) {
        return 'https://play.google.com/store/apps/details?id=com.nexters.herowars&hl=en';
    }
    
    // Check if iOS
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        return 'https://apps.apple.com/us/app/hero-wars-alliance-fantasy/id1158967485';
    }
    
    // Default to iOS App Store
    return 'https://apps.apple.com/us/app/hero-wars-alliance-fantasy/id1158967485';
}

// Full game reset (for Try again button)
function resetGameCompletely() {
    // Reset game state to initial values
    gameState.coins = 0;
    gameState.level = 1;
    gameState.experience = 0;
    gameState.experienceToNextLevel = EXPERIENCE_PER_LEVEL;
    gameState.coinsPerTap = 1;
    gameState.coinsPerSecond = 0;
    gameState.taps = 0;
    gameState.timeLeft = 60;
    gameState.incomeMultiplier = 1;
    gameState.skills = {
        tap: { cooldownEndTime: 0 },
        passive: { cooldownEndTime: 0 },
        time1: { cooldownEndTime: 0 },
        crowdboost: { cooldownEndTime: 0, activeEndTime: 0 }
    };
    
    // Reset game started flag
    gameStarted = false;
    
    // Reset timer frame time
    lastFrameTime = null;
    lastSecond = -1;
    musicStopped = false;
    
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
        gameState.experienceToNextLevel = EXPERIENCE_PER_LEVEL;
        gameState.coinsPerTap = 1;
        gameState.coinsPerSecond = 0;
        gameState.taps = 0;
        gameState.timeLeft = 60;
        gameState.incomeMultiplier = 1;
        gameState.skills = {
            tap: { cooldownEndTime: 0 },
            passive: { cooldownEndTime: 0 },
            time1: { cooldownEndTime: 0 },
            crowdboost: { cooldownEndTime: 0, activeEndTime: 0 }
        };
        
        // Reset game started flag
        gameStarted = false;
        
        // Reset timer frame time
        lastFrameTime = null;
        lastSecond = -1;
        
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

// Initialize game
function initGame() {
    // loadGameState(); // Temporarily disabled for testing
    
    // Initialize audio pool and background music
    initAudioPool();
    initBackgroundMusic();
    
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

