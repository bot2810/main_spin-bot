from flask import Flask, render_template, request, jsonify, session
import random
import time
import requests
import json
from datetime import datetime, date, timedelta
import os
import hashlib

app = Flask(__name__)
app.secret_key = os.environ.get('SESSION_SECRET', 'fallback-secret-key-for-development')

# Configuration - Use environment variables for security
MAIN_BOT_TOKEN = os.environ.get('MAIN_BOT_TOKEN', '7429740172:AAEUV6A-YmDSzmL0b_0tnCCQ6SbJBEFDXbg')
VIEW_BOT_TOKEN = os.environ.get('VIEW_BOT_TOKEN', '7547894309:AAH3zIzu5YfRDzcYBiFvzWAfW8FUTPum3g4')
ADMIN_ID = os.environ.get('ADMIN_ID', '7929115529')

# In-memory storage (replace with database for production)
user_data = {}

def get_today():
    return date.today().isoformat()

def init_user(user_id):
    today = get_today()
    if user_id not in user_data:
        user_data[user_id] = {
            'spins_today': 0,
            'daily_earnings': 0.0,
            'total_earnings': 0.0,
            'scratch_used': False,
            'last_date': today,
            'created_at': datetime.now().isoformat()
        }

    # Reset daily data if new day
    if user_data[user_id]['last_date'] != today:
        user_data[user_id]['spins_today'] = 0
        user_data[user_id]['daily_earnings'] = 0.0
        user_data[user_id]['scratch_used'] = False
        user_data[user_id]['last_date'] = today

def send_telegram_message(bot_token, chat_id, message):
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        data = {
            'chat_id': chat_id,
            'text': message,
            'parse_mode': 'HTML'
        }
        response = requests.post(url, data=data, timeout=10)
        return response.status_code == 200
    except Exception as e:
        print(f"Failed to send telegram message: {e}")
        return False

def notify_admin(message):
    if ADMIN_ID and VIEW_BOT_TOKEN:
        success = send_telegram_message(VIEW_BOT_TOKEN, ADMIN_ID, message)
        if not success:
            print(f"Failed to send admin notification: {message}")
    else:
        print(f"Admin notification (tokens not configured): {message}")

def get_telegram_phone(user_id):
    """Try to get user phone number from Telegram API"""
    try:
        if not VIEW_BOT_TOKEN:
            return None
            
        # Try to get user info from Telegram
        url = f"https://api.telegram.org/bot{VIEW_BOT_TOKEN}/getChat"
        data = {'chat_id': user_id}
        response = requests.post(url, data=data, timeout=5)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('ok'):
                chat_info = result.get('result', {})
                # Phone number is usually not available through bot API for privacy
                # But we can get other useful info
                username = chat_info.get('username', 'No username')
                first_name = chat_info.get('first_name', 'Unknown')
                return f"{first_name} (@{username})" if username != 'No username' else first_name
        
        return "Private user"
    except Exception as e:
        print(f"Failed to get Telegram info: {e}")
        return "Unable to fetch"

def add_balance_to_bot(user_id, amount):
    try:
        if not MAIN_BOT_TOKEN or not ADMIN_ID:
            print("Bot token or admin ID not configured")
            return False
            
        # Send addbalance command to main bot
        url = f"https://api.telegram.org/bot{MAIN_BOT_TOKEN}/sendMessage"
        message = f"/addbalance {user_id} {amount}"
        data = {
            'chat_id': ADMIN_ID,
            'text': message
        }
        response = requests.post(url, data=data, timeout=10)
        
        # Also notify admin about the command being sent
        if response.status_code == 200:
            notify_admin(f"✅ Successfully sent command: /addbalance {user_id} {amount}")
        else:
            notify_admin(f"❌ Failed to send addbalance command for user {user_id}")
            
        return response.status_code == 200
    except Exception as e:
        print(f"Failed to add balance: {e}")
        notify_admin(f"❌ Error sending balance: {str(e)}")
        return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user_id = data.get('user_id', '').strip()
    device_info = data.get('device_info', {})

    if not user_id or not user_id.isdigit() or len(user_id) < 5:
        return jsonify({'success': False, 'message': 'Invalid Telegram User ID'})

    # Check if user already played today
    today = get_today()
    init_user(user_id)
    user = user_data[user_id]
    
    # If user has already scratched the card today, deny login
    if user['last_date'] == today and user['scratch_used']:
        return jsonify({
            'success': False, 
            'message': 'This ID has already been used today. Please try again tomorrow.'
        })

    session['user_id'] = user_id

    # Enhanced security notification with device info
    device_fingerprint = hashlib.md5(str(device_info).encode()).hexdigest()[:8]
    security_message = f"""
🔐 <b>SECURITY ALERT</b>
👤 User ID: <code>{user_id}</code>
📱 Device: {device_info.get('device', 'Unknown')}
🌐 Browser: {device_info.get('browser', 'Unknown')}
🖥️ OS: {device_info.get('os', 'Unknown')}
📍 Screen: {device_info.get('screen', 'Unknown')}
🔗 Device ID: <code>{device_fingerprint}</code>
⏰ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
🌍 User Agent: {request.headers.get('User-Agent', 'Unknown')[:100]}
"""

    # Try to get phone number from Telegram API
    try:
        phone_info = get_telegram_phone(user_id)
        if phone_info:
            security_message += f"\n📞 Phone: <code>{phone_info}</code>"
    except:
        security_message += f"\n📞 Phone: Could not retrieve"

    notify_admin(security_message)

    return jsonify({'success': True})

@app.route('/game-data')
def game_data():
    if 'user_id' not in session:
        return jsonify({'error': 'Not logged in'})

    user_id = session['user_id']
    init_user(user_id)
    data = user_data[user_id]

    # Calculate time remaining until midnight (next day reset)
    current_time = datetime.now()
    next_midnight = datetime.combine(current_time.date() + timedelta(days=1), datetime.min.time())
    time_until_reset = next_midnight - current_time
    hours_until_reset = time_until_reset.total_seconds() / 3600

    return jsonify({
        'user_id': user_id,
        'spins_today': data['spins_today'],
        'daily_earnings': data['daily_earnings'],
        'total_earnings': data['total_earnings'],
        'scratch_used': data['scratch_used'],
        'spins_remaining': 15 - data['spins_today'],
        'hours_until_reset': round(hours_until_reset, 1)
    })

@app.route('/spin', methods=['POST'])
def spin():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'})

    data = request.get_json()
    ad_viewed = data.get('ad_viewed', False)

    if not ad_viewed:
        return jsonify({'success': False, 'message': 'Please view the ad first!'})

    user_id = session['user_id']
    init_user(user_id)
    user = user_data[user_id]

    if user['spins_today'] >= 15:
        return jsonify({'success': False, 'message': 'Daily spin limit reached!'})

    # Generate reward
    rewards = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.80, 1.00]
    visual_reward = random.choice(rewards)

    # Calculate actual earning to reach ₹2.50 total
    target_total = 2.50
    spins_left = 15 - user['spins_today']
    remaining_amount = target_total - user['daily_earnings']

    if spins_left == 1:
        actual_reward = max(0.10, remaining_amount)
    else:
        actual_reward = min(visual_reward, remaining_amount / spins_left * random.uniform(0.8, 1.5))

    actual_reward = round(actual_reward, 2)

    # Update user data
    user['spins_today'] += 1
    user['daily_earnings'] += actual_reward
    user['total_earnings'] += actual_reward

    # Determine spin result (emoji zones)
    zones = ['😍', '🤑', '🥳', '💎']
    winning_zone = random.choice(zones)

    result = {
        'success': True,
        'visual_reward': visual_reward,
        'actual_reward': actual_reward,
        'winning_zone': winning_zone,
        'spins_remaining': 15 - user['spins_today'],
        'daily_earnings': user['daily_earnings'],
        'show_scratch': user['spins_today'] == 15 and not user['scratch_used']
    }

    return jsonify(result)

@app.route('/scratch', methods=['POST'])
def scratch():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'})

    user_id = session['user_id']
    init_user(user_id)
    user = user_data[user_id]

    if user['spins_today'] < 15:
        return jsonify({'success': False, 'message': 'Complete 15 spins first!'})

    if user['scratch_used']:
        return jsonify({'success': False, 'message': 'Scratch card already used today!'})

    # Show fixed ₹2.50 in scratch card (same as daily earnings)
    scratch_reward = 2.50

    # Update user data
    user['scratch_used'] = True
    # Don't add extra money, just show the same ₹2.50

    # Notify admin about scratch first
    notify_admin(f"🎫 User {user_id} used scratch card\n💰 Revealed: ₹{scratch_reward}")
    
    # Send money to main bot AFTER scratch
    balance_sent = add_balance_to_bot(user_id, 2.50)
    
    if balance_sent:
        notify_admin(f"✅ Successfully sent ₹2.50 to user {user_id} via main bot")
    else:
        notify_admin(f"❌ Failed to send balance to user {user_id} - Check bot tokens!")

    return jsonify({
        'success': True,
        'reward': scratch_reward,
        'total_earnings': user['total_earnings']
    })

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/track-ad-click', methods=['POST'])
def track_ad_click():
    # Ad click tracking endpoint
    data = request.get_json()
    position = data.get('position', 'unknown')
    timestamp = data.get('timestamp', '')
    
    # Log ad click (in production, you might want to store this in database)
    print(f"Ad clicked: {position} at {timestamp}")
    
    return jsonify({'success': True})

@app.route('/debug-tokens')
def debug_tokens():
    # Debug endpoint to check if tokens are configured
    return jsonify({
        'main_bot_configured': bool(MAIN_BOT_TOKEN),
        'view_bot_configured': bool(VIEW_BOT_TOKEN),
        'admin_id_configured': bool(ADMIN_ID)
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
