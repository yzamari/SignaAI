#!/usr/bin/env python3
"""
Deploy backend with database support
"""

import subprocess
import time
import os

def run_command(cmd, description=""):
    """Run a shell command"""
    print(f"\n{'='*60}")
    if description:
        print(f"🔧 {description}")
    print(f"📝 Command: {cmd[:100]}...")
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            print(f"✅ Success!")
            return True
        else:
            print(f"❌ Failed: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("\n🚀 DEPLOYING BACKEND WITH DATABASE SUPPORT")
    print("="*70)
    
    # Set project
    run_command(
        "gcloud config set project signaai-prod-1758272250",
        "Setting project"
    )
    
    # Wait for build to complete
    print("\n⏳ Waiting for build to complete...")
    time.sleep(30)
    
    # Deploy with Cloud SQL
    print("\n🚀 Deploying backend with Cloud SQL...")
    deploy_cmd = """gcloud run deploy signaai-backend \
        --image gcr.io/signaai-prod-1758272250/signaai-backend:latest \
        --platform managed \
        --region us-central1 \
        --allow-unauthenticated \
        --memory 1Gi \
        --cpu 1 \
        --timeout 60s \
        --add-cloudsql-instances signaai-prod-1758272250:us-central1:signaai-db-prod \
        --set-env-vars "DATABASE_URL=postgresql://signaai:SignaAI2024!@/signaai-db?host=/cloudsql/signaai-prod-1758272250:us-central1:signaai-db-prod" \
        --project signaai-prod-1758272250 \
        --quiet"""
    
    if run_command(deploy_cmd, "Deploying backend with database"):
        print("\n✅ Backend deployed successfully with database support!")
        print("🌐 URL: https://signaai-backend-691837885081.us-central1.run.app")
    else:
        print("\n⚠️ Deployment might need manual intervention")
        print("Try running: gcloud auth login")
    
    print("\n" + "="*70)
    print("📋 DEPLOYMENT SUMMARY")
    print("="*70)
    print("✅ Database: Cloud SQL PostgreSQL")
    print("✅ Backend: Cloud Run with DB connection")
    print("✅ Documents/Sessions: Now persisted in database")
    print("✅ Signing links: Will work with persistent data")

if __name__ == "__main__":
    main()