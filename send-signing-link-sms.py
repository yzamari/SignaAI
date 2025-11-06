#!/usr/bin/env python3
"""
Send SMS with actual signing link from E2E test
"""

import os
import sys
from dotenv import load_dotenv
load_dotenv('.env.production')

def send_signing_link_sms():
    """Send SMS with the real signing link"""
    from twilio.rest import Client

    # Twilio credentials
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    from_number = os.environ.get('TWILIO_PHONE_NUMBER')

    # Recipient and link
    to_number = "+972523121682"
    signing_link = "https://signa.ai/sign/b302b73533a842b762f1ae8ded708857"

    # Message in Hebrew
    message = f"""שלום,

נשלח אליך מסמך לחתימה מ-SignaAI.

לחץ כאן לצפייה וחתימה:
{signing_link}

המסמך מכיל 33 שדות למילוי.

SignaAI - חתימה דיגיטלית"""

    print("=" * 70)
    print("Sending SMS with Signing Link")
    print("=" * 70)
    print(f"To: {to_number}")
    print(f"From: {from_number}")
    print(f"Link: {signing_link}")
    print()
    print("Message:")
    print("-" * 70)
    print(message)
    print("-" * 70)
    print()

    try:
        client = Client(account_sid, auth_token)

        sms = client.messages.create(
            from_=from_number,
            to=to_number,
            body=message
        )

        print("✅ SMS SENT SUCCESSFULLY!")
        print()
        print(f"Message SID: {sms.sid}")
        print(f"Status: {sms.status}")
        print(f"To: {sms.to}")
        print(f"From: {sms.from_}")
        print()
        print("The user should receive the SMS shortly!")
        return True

    except Exception as e:
        error_str = str(e)
        print("❌ SMS Failed")
        print(f"Error: {error_str}")
        print()

        if "63038" in error_str or "daily messages limit" in error_str.lower():
            print("⚠️  Twilio Daily Limit Reached (50 messages)")
            print()
            print("WORKAROUND OPTIONS:")
            print()
            print("1. Wait until midnight PST for limit reset")
            print()
            print("2. Upgrade Twilio account:")
            print("   https://www.twilio.com/console/billing")
            print()
            print("3. Send via WhatsApp manually:")
            print("   Copy this link and send via WhatsApp:")
            print(f"   {signing_link}")
            print()
            print("4. Send via Email:")
            print(f"   Email the link to the recipient")
            print()
            print("The signing link is VALID and READY TO USE!")
            print("User can access it from any shared method.")

        return False

if __name__ == "__main__":
    send_signing_link_sms()
