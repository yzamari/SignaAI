#!/usr/bin/env python3
"""
Send SMS directly using Twilio API
Sends test message to: +972523121682
"""

import os
import sys
from datetime import datetime

# Load environment variables
from dotenv import load_dotenv
load_dotenv('.env.production')

def send_sms_twilio(phone: str, message: str):
    """Send SMS using Twilio API"""
    import requests
    from requests.auth import HTTPBasicAuth

    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    from_number = os.environ.get('TWILIO_PHONE_NUMBER')

    if not account_sid or not auth_token or not from_number:
        print("❌ Twilio credentials not configured")
        print(f"   TWILIO_ACCOUNT_SID: {'✓' if account_sid else '✗'}")
        print(f"   TWILIO_AUTH_TOKEN: {'✓' if auth_token else '✗'}")
        print(f"   TWILIO_PHONE_NUMBER: {'✓' if from_number else '✗'}")
        print()
        print("To send real SMS, set these environment variables in .env.production")
        return False

    print(f"📱 Sending SMS via Twilio...")
    print(f"   From: {from_number}")
    print(f"   To: {phone}")
    print(f"   Account SID: {account_sid[:8]}...")
    print()

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

    data = {
        'From': from_number,
        'To': phone,
        'Body': message
    }

    try:
        response = requests.post(
            url,
            data=data,
            auth=HTTPBasicAuth(account_sid, auth_token),
            timeout=30
        )

        if response.status_code == 201:
            result = response.json()
            print(f"✅ SMS sent successfully!")
            print(f"   Message SID: {result.get('sid')}")
            print(f"   Status: {result.get('status')}")
            print(f"   Price: {result.get('price')} {result.get('price_unit', 'USD')}")
            return True
        else:
            print(f"❌ Twilio API error: {response.status_code}")
            print(f"   Response: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Error sending SMS: {e}")
        return False

def main():
    """Send test SMS"""
    print("=" * 70)
    print("SignaAI - Direct SMS Test")
    print("=" * 70)
    print()

    # Recipient details
    phone = "+972523121682"
    recipient_name = "יקר/ה"  # Hebrew: "Dear"
    sender_name = "SignaAI"
    document_title = "מסמך לחתימה"  # Hebrew: "Document to Sign"

    # Create message in Hebrew
    sign_url = f"https://signa.ai/sign/test-{int(datetime.now().timestamp())}"

    message = f"""שלום {recipient_name},

{sender_name} שלח/ה לך מסמך לחתימה: '{document_title}'.

לחץ כאן לצפייה וחתימה:
{sign_url}

SignaAI - חתימה דיגיטלית"""

    print(f"Recipient: {phone}")
    print(f"Message length: {len(message)} characters")
    print()
    print("Message content:")
    print("-" * 70)
    print(message)
    print("-" * 70)
    print()

    # Send SMS
    if send_sms_twilio(phone, message):
        print()
        print("=" * 70)
        print("✅ SMS Test Completed Successfully!")
        print("=" * 70)
        print()
        print(f"Check your phone at {phone} for the message!")
        sys.exit(0)
    else:
        print()
        print("=" * 70)
        print("❌ SMS Test Failed")
        print("=" * 70)
        print()
        print("MOCK SMS would have been sent:")
        print(f"  To: {phone}")
        print(f"  Message: {message}")
        sys.exit(1)

if __name__ == "__main__":
    # Check if requests is available
    try:
        import requests
    except ImportError:
        print("❌ 'requests' module not found")
        print("Installing...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "python-dotenv"])
        print("✅ Installed successfully")
        print()

    main()
