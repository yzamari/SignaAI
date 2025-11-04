#!/usr/bin/env python3
"""
Direct Twilio SMS Test
"""

import os
from twilio.rest import Client
from datetime import datetime, timedelta
import time

# Twilio credentials - load from environment
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
TEST_PHONE = os.getenv("TWILIO_PHONE_TO", "+972523121682")

def send_test_sms():
    """Send test SMS and track delivery"""
    print("\n" + "="*60)
    print("🚀 SENDING TEST SMS DIRECTLY VIA TWILIO")
    print("="*60)
    
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Test message
        test_message = f"""שלום יהב,

זוהי הודעת בדיקה ישירה מ-SignaAI.
זמן: {datetime.now().strftime('%H:%M:%S')}

לינק לדוגמה: https://signaai-frontend-691837885081.us-central1.run.app/sign/test-{int(time.time())}

- צוות SignaAI"""
        
        print(f"\nSending SMS to: {TEST_PHONE}")
        print(f"From: {TWILIO_PHONE_NUMBER}")
        print("-" * 60)
        
        # Send the message
        message = client.messages.create(
            body=test_message,
            from_=TWILIO_PHONE_NUMBER,
            to=TEST_PHONE
        )
        
        print(f"✅ SMS sent!")
        print(f"Message SID: {message.sid}")
        print(f"Initial Status: {message.status}")
        
        # Wait and check status multiple times
        for i in range(3):
            time.sleep(3)
            message = client.messages(message.sid).fetch()
            print(f"\nStatus check {i+1}: {message.status}")
            if message.error_code:
                print(f"Error: {message.error_code} - {message.error_message}")
                break
            if message.status == 'delivered':
                print("✅ Message delivered successfully!")
                break
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def check_all_messages():
    """Check ALL messages from the account"""
    print("\n" + "="*60)
    print("📱 CHECKING ALL RECENT MESSAGES")
    print("="*60)
    
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Get ALL messages from today
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        messages = client.messages.list(
            date_sent_after=today,
            limit=50
        )
        
        print(f"\nFound {len(messages)} messages sent today")
        
        for msg in messages:
            if TEST_PHONE in msg.to:
                print(f"\n📨 Message to our test number:")
                print(f"   SID: {msg.sid}")
                print(f"   From: {msg.from_}")
                print(f"   To: {msg.to}")
                print(f"   Status: {msg.status}")
                print(f"   Sent: {msg.date_sent}")
                if msg.error_code:
                    print(f"   Error: {msg.error_code} - {msg.error_message}")
                
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    # First check existing messages
    check_all_messages()
    
    # Send test SMS
    if send_test_sms():
        print("\n" + "="*60)
        print("✅ TEST COMPLETE")
        print(f"Please check your phone: {TEST_PHONE}")
        print("="*60)
    else:
        print("\n❌ Test failed!")