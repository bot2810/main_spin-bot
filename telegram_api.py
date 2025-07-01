import requests
import logging

def send_balance_update(user_id, amount, bot_token):
    """Send balance update to main Telegram bot"""
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        message = f"/addbalance {user_id} {amount:.2f}"
        
        payload = {
            'chat_id': user_id,  # Assuming the bot sends to the user
            'text': message
        }
        
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            logging.info(f"Balance update sent successfully for user {user_id}: ₹{amount:.2f}")
        else:
            logging.error(f"Failed to send balance update: {response.status_code} - {response.text}")
            
    except requests.exceptions.RequestException as e:
        logging.error(f"Error sending balance update: {str(e)}")

def notify_admin(message, bot_token, admin_id):
    """Send notification to admin via Telegram bot"""
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        
        payload = {
            'chat_id': admin_id,
            'text': f"🎮 Spin & Win Alert:\n{message}",
            'parse_mode': 'HTML'
        }
        
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            logging.info(f"Admin notification sent: {message}")
        else:
            logging.error(f"Failed to send admin notification: {response.status_code} - {response.text}")
            
    except requests.exceptions.RequestException as e:
        logging.error(f"Error sending admin notification: {str(e)}")
