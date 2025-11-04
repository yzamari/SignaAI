#!/usr/bin/env python3
"""
Check Twilio SMS Delivery Status and Test Direct SMS
"""

import os
from twilio.rest import Client
from datetime import datetime, timedelta
import time

# Twilio credentials from environment/Dockerfile
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
TEST_PHONE = os.getenv("TWILIO_PHONE_TO", "+972523121682")

def check_recent_messages():
    """Check recent SMS messages sent from our Twilio account"""
    print("\n" + "="*60)
    print("📱 CHECKING RECENT TWILIO SMS MESSAGES")
    print("="*60)
    
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Get messages sent in the last 2 hours
        two_hours_ago = datetime.now() - timedelta(hours=2)
        
        messages = client.messages.list(
            from_=TWILIO_PHONE_NUMBER,
            date_sent_after=two_hours_ago,
            limit=20
        )
        
        print(f"\nFound {len(messages)} messages sent in the last 2 hours")
        print("-" * 60)
        
        for msg in messages:
            print(f"\n📨 Message SID: {msg.sid}")
            print(f"   To: {msg.to}")
            print(f"   Status: {msg.status}")
            print(f"   Sent: {msg.date_sent}")
            print(f"   Error Code: {msg.error_code}")
            print(f"   Error Message: {msg.error_message}")
            print(f"   Body Preview: {msg.body[:100]}..." if len(msg.body) > 100 else f"   Body: {msg.body}")
            
            # Check if this is to our test number
            if msg.to == TEST_PHONE:
                print("   ✅ This is to our test number!")
                
                # Get detailed delivery status
                if msg.status in ['delivered', 'sent']:
                    print(f"   ✅ Message was {msg.status} successfully")
                elif msg.status == 'failed':
                    print(f"   ❌ Message failed: {msg.error_message}")
                elif msg.status == 'undelivered':
                    print(f"   ⚠️ Message undelivered - may be carrier issue")
                else:
                    print(f"   ⏳ Message status: {msg.status}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error checking messages: {e}")
        return False

def send_test_sms():
    """Send a test SMS directly using Twilio"""
    print("\n" + "="*60)
    print("🚀 SENDING TEST SMS DIRECTLY")
    print("="*60)
    
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Test message in Hebrew
        test_message = f"""שלום יהב,

זוהי הודעת בדיקה מ-SignaAI.
נשלחה ב: {datetime.now().strftime('%H:%M:%S')}

לינק לדוגמה: https://signaai-frontend-691837885081.us-central1.run.app/sign/test123

- צוות SignaAI"""
        
        print(f"\nSending test SMS to: {TEST_PHONE}")
        print(f"From: {TWILIO_PHONE_NUMBER}")
        print(f"Message:\n{test_message}")
        print("-" * 60)
        
        message = client.messages.create(
            body=test_message,
            from_=TWILIO_PHONE_NUMBER,
            to=TEST_PHONE
        )
        
        print(f"\n✅ SMS sent successfully!")
        print(f"   Message SID: {message.sid}")
        print(f"   Status: {message.status}")
        
        # Wait a few seconds and check status
        print("\n⏳ Waiting 5 seconds to check delivery status...")
        time.sleep(5)
        
        # Fetch updated status
        message = client.messages(message.sid).fetch()
        print(f"\n📊 Updated Status:")
        print(f"   Status: {message.status}")
        print(f"   Error Code: {message.error_code}")
        print(f"   Error Message: {message.error_message}")
        
        if message.status == 'delivered':
            print("   ✅ Message delivered successfully!")
        elif message.status == 'sent':
            print("   📤 Message sent, awaiting delivery confirmation")
        elif message.status in ['failed', 'undelivered']:
            print(f"   ❌ Message not delivered: {message.error_message}")
        
        return message.sid
        
    except Exception as e:
        print(f"❌ Error sending SMS: {e}")
        import traceback
        traceback.print_exc()
        return None

def check_phone_number_format():
    """Check if phone number is correctly formatted"""
    print("\n" + "="*60)
    print("📞 CHECKING PHONE NUMBER FORMAT")
    print("="*60)
    
    import phonenumbers
    
    try:
        # Parse the phone number
        parsed = phonenumbers.parse(TEST_PHONE, None)
        
        print(f"\nPhone number: {TEST_PHONE}")
        print(f"Country code: +{parsed.country_code}")
        print(f"National number: {parsed.national_number}")
        print(f"Is valid: {phonenumbers.is_valid_number(parsed)}")
        print(f"Is possible: {phonenumbers.is_possible_number(parsed)}")
        print(f"E164 format: {phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)}")
        
        if phonenumbers.is_valid_number(parsed):
            print("✅ Phone number is valid!")
        else:
            print("❌ Phone number appears invalid!")
            
    except Exception as e:
        print(f"❌ Error parsing phone number: {e}")

def check_twilio_account():
    """Check Twilio account status and balance"""
    print("\n" + "="*60)
    print("💰 CHECKING TWILIO ACCOUNT STATUS")
    print("="*60)
    
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Get account info
        account = client.api.accounts(TWILIO_ACCOUNT_SID).fetch()
        print(f"\nAccount SID: {account.sid}")
        print(f"Account Status: {account.status}")
        print(f"Account Name: {account.friendly_name}")
        
        # Get balance (if available)
        try:
            balance = client.api.accounts(TWILIO_ACCOUNT_SID).balance.fetch()
            print(f"Balance: {balance.balance} {balance.currency}")
        except:
            print("Balance: Unable to fetch")
        
        # Check phone number
        phone_numbers = client.incoming_phone_numbers.list(limit=10)
        print(f"\nPhone Numbers:")
        for number in phone_numbers:
            print(f"  - {number.phone_number} ({number.friendly_name})")
            if number.phone_number == TWILIO_PHONE_NUMBER:
                print(f"    ✅ This is our sending number!")
                print(f"    Capabilities: SMS={number.sms_enabled}, Voice={number.voice_enabled}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error checking account: {e}")
        return False

if __name__ == "__main__":
    print("\n🔍 TWILIO SMS TROUBLESHOOTING")
    print("="*60)
    
    # 1. Check phone number format
    check_phone_number_format()
    
    # 2. Check Twilio account
    check_twilio_account()
    
    # 3. Check recent messages
    check_recent_messages()
    
    # 4. Send test SMS
    print("\n" + "="*60)
    response = input("📱 Do you want to send a test SMS? (y/n): ")
    if response.lower() == 'y':
        message_sid = send_test_sms()
        if message_sid:
            print(f"\n✅ Test SMS sent with SID: {message_sid}")
            print(f"   Please check your phone: {TEST_PHONE}")
    
    print("\n" + "="*60)
    print("✅ TROUBLESHOOTING COMPLETE")
    print("="*60)