let gameData = {};
let adViewed = false;
let spinning = false;

// Initialize game
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
});

function checkLoginStatus() {
    fetch('/game-data')
        .then(response => response.json())
        .then(data => {
            if (data.error || !data.user_id) {
                // Always show login screen first if no user data
                showScreen('loginScreen');
            } else {
                gameData = data;
                updateUI();
                showScreen('gameScreen');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            // Always show login screen on error
            showScreen('loginScreen');
        });
}

function login() {
    const userId = document.getElementById('userIdInput').value.trim();

    if (!userId) {
        showNotification('Please enter your Telegram User ID');
        return;
    }

    if (!userId.match(/^\d{5,}$/)) {
        showNotification('Invalid Telegram User ID format');
        return;
    }

    // Collect device fingerprint
    const deviceInfo = {
        device: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
        browser: getBrowserInfo(),
        os: getOSInfo(),
        screen: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        platform: navigator.platform,
        memory: navigator.deviceMemory || 'Unknown',
        cores: navigator.hardwareConcurrency || 'Unknown'
    };

    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            user_id: userId,
            device_info: deviceInfo
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            checkLoginStatus();
        } else {
            showNotification(data.message || 'Login failed');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Login failed. Please try again.');
    });
}

function updateUI() {
    document.getElementById('userId').textContent = `User: ${gameData.user_id}`;
    document.getElementById('spinsLeft').textContent = gameData.spins_remaining;
    document.getElementById('todayEarnings').textContent = `₹${gameData.daily_earnings.toFixed(2)}`;
    document.getElementById('totalEarnings').textContent = `₹${gameData.total_earnings.toFixed(2)}`;
    document.getElementById('dailyEarnings').textContent = `₹${gameData.daily_earnings.toFixed(2)}`;

    // Show/hide elements based on game state
    if (gameData.spins_remaining <= 0) {
        document.getElementById('spinBtn').style.display = 'none';

        if (!gameData.scratch_used) {
            document.getElementById('scratchContainer').style.display = 'block';
        }
    } else {
        document.getElementById('spinBtn').style.display = 'inline-block';
        document.getElementById('scratchContainer').style.display = 'none';
    }

    // Update spin button state
    updateSpinButton();

    // Show time until next reset (midnight)
    if (gameData.hours_until_reset !== undefined) {
        const hoursRemaining = gameData.hours_until_reset;
        const hours = Math.floor(hoursRemaining);
        const minutes = Math.floor((hoursRemaining - hours) * 60);

        if (hoursRemaining > 0) {
            document.getElementById('resetTimer').textContent = `Next reset: ${hours}h ${minutes}m (at midnight)`;
        } else {
            document.getElementById('resetTimer').textContent = 'Reset completed! New spins available.';
        }
    }
}

function updateSpinButton() {
    const spinBtn = document.getElementById('spinBtn');
    if (!spinning && gameData.spins_remaining > 0) {
        spinBtn.disabled = false;
        spinBtn.textContent = '🎯 SPIN & WIN!';
    } else {
        spinBtn.disabled = true;
        if (spinning) {
            spinBtn.textContent = '🎡 SPINNING...';
        } else {
            spinBtn.textContent = '❌ NO SPINS LEFT';
        }
    }
}

function startAdAndSpin() {
    if (spinning || gameData.spins_remaining <= 0) {
        return;
    }

    // Show ad overlay
    showAdOverlay();
}

function showAdOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'adOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: Arial, sans-serif;
    `;

    let countdown = 5;
    overlay.innerHTML = `
        <div style="text-align: center; padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
            <h2 style="margin: 0 0 20px 0;">🎬 Watch This Ad</h2>
            <div style="font-size: 48px; margin: 20px 0;" id="adCountdown">${countdown}</div>
            <p style="margin: 0;">Your spin will start automatically...</p>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; margin: 20px 0; overflow: hidden;">
                <div id="adProgress" style="width: 0%; height: 100%; background: #4CAF50; transition: width 1s ease;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const timer = setInterval(() => {
        countdown--;
        document.getElementById('adCountdown').textContent = countdown;
        document.getElementById('adProgress').style.width = `${(5-countdown)/5*100}%`;

        if (countdown <= 0) {
            clearInterval(timer);
            document.body.removeChild(overlay);
            adViewed = true;
            spin();
        }
    }, 1000);
}

function spin() {
    if (spinning || gameData.spins_remaining <= 0) {
        return;
    }

    spinning = true;
    updateSpinButton();

    // Play dollar sound effect
    playDollarSound();

    // Animate wheel
    const wheel = document.getElementById('wheel');
    const randomRotation = 1440 + Math.random() * 1440; // 4-8 full rotations
    wheel.style.transform = `rotate(${randomRotation}deg)`;

    // Send spin request
    fetch('/spin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ad_viewed: adViewed })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Wait for animation to complete
            setTimeout(() => {
                showSpinResult(data);
                gameData.spins_remaining = data.spins_remaining;
                gameData.daily_earnings = data.daily_earnings;
                gameData.total_earnings = gameData.total_earnings + data.actual_reward;

                updateUI();
                spinning = false;
                adViewed = false; // Reset for next spin
                updateSpinButton();

                // Show scratch card if available
                if (data.show_scratch) {
                    document.getElementById('scratchContainer').style.display = 'block';
                }
            }, 3000);
        } else {
            showNotification(data.message);
            spinning = false;
            updateSpinButton();
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Spin failed. Please try again.');
        spinning = false;
        updateSpinButton();
    });
}

function showSpinResult(data) {
    const resultDisplay = document.getElementById('resultDisplay');
    const resultTitle = document.getElementById('resultTitle');
    const resultAmount = document.getElementById('resultAmount');
    const resultEmoji = document.getElementById('resultEmoji');

    resultTitle.textContent = '🎉 Congratulations! 🎉';
    resultAmount.textContent = `You won ₹${data.actual_reward.toFixed(2)}!`;
    resultEmoji.textContent = data.winning_zone;

    resultDisplay.classList.add('show');

    // Hide result after 3 seconds
    setTimeout(() => {
        resultDisplay.classList.remove('show');
    }, 3000);
}

function scratchCard() {
    const scratchCard = document.getElementById('scratchCard');
    if (scratchCard.classList.contains('scratched')) return;

    fetch('/scratch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            scratchCard.classList.add('scratched');
            document.getElementById('scratchAmount').textContent = `₹${data.reward.toFixed(2)}`;
            gameData.total_earnings = data.total_earnings;
            gameData.scratch_used = true;
            updateUI();
            showNotification(`🎫 Scratch revealed: ₹${data.reward.toFixed(2)}!`);
        } else {
            showNotification(data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Scratch failed. Please try again.');
    });
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function showNotification(message) {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }

    // Create new notification
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function logout() {
    fetch('/logout', {
        method: 'POST'
    })
    .then(() => {
        showScreen('loginScreen');
        document.getElementById('userIdInput').value = '';
        gameData = {};
    });
}

// Dollar/Coin sound effect function
function playDollarSound() {
    try {
        // Create coin/dollar sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create multiple oscillators for richer coin sound
        const oscillator1 = audioContext.createOscillator();
        const oscillator2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator1.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Coin drop "cha-ching" sound with multiple frequencies
        oscillator1.frequency.setValueAtTime(1200, audioContext.currentTime);
        oscillator1.frequency.setValueAtTime(800, audioContext.currentTime + 0.1);
        oscillator1.frequency.setValueAtTime(400, audioContext.currentTime + 0.3);

        oscillator2.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator2.frequency.setValueAtTime(600, audioContext.currentTime + 0.15);
        oscillator2.frequency.setValueAtTime(300, audioContext.currentTime + 0.4);

        // Volume envelope for realistic coin sound
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);

        oscillator1.start(audioContext.currentTime);
        oscillator1.stop(audioContext.currentTime + 0.6);
        oscillator2.start(audioContext.currentTime + 0.05);
        oscillator2.stop(audioContext.currentTime + 0.65);

        // Also create a simple beep as fallback
        setTimeout(() => {
            const beep = audioContext.createOscillator();
            const beepGain = audioContext.createGain();
            beep.connect(beepGain);
            beepGain.connect(audioContext.destination);
            beep.frequency.value = 800;
            beepGain.gain.setValueAtTime(0.2, audioContext.currentTime);
            beepGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            beep.start();
            beep.stop(audioContext.currentTime + 0.2);
        }, 100);

    } catch (error) {
        console.log('Audio not supported or failed:', error);
        // Fallback: try to play a simple beep
        try {
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.frequency.value = 800;
            gain.gain.value = 0.3;
            oscillator.start();
            oscillator.stop(context.currentTime + 0.3);
        } catch (e) {
            console.log('All audio methods failed');
        }
    }
}

function getBrowserInfo() {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
}

function getOSInfo() {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Unknown';
}

// Auto-refresh game data every 30 seconds
setInterval(() => {
    if (document.getElementById('gameScreen').classList.contains('active')) {
        checkLoginStatus();
    }
}, 30000);