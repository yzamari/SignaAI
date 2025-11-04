"""
Payment API Endpoints
Handles payment processing, subscriptions, and billing
"""

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
from decimal import Decimal
from datetime import datetime
import logging

from core.database import get_db
from api.v1.auth import get_current_user
from services.payment_service import (
    PaymentService, PaymentMethod, SubscriptionPlan, 
    Currency, PaymentStatus, SUBSCRIPTION_PLANS
)
from models.subscription import Subscription, Payment, Invoice
from schemas.payment import (
    PaymentCreate, PaymentResponse, SubscriptionCreate,
    SubscriptionResponse, InvoiceResponse, WebhookEvent
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])

# Initialize payment service
payment_service = PaymentService()


@router.get("/plans", response_model=Dict[str, Any])
async def get_subscription_plans() -> Dict[str, Any]:
    """
    Get available subscription plans with pricing
    """
    return {"plans": SUBSCRIPTION_PLANS}


@router.post("/create", response_model=PaymentResponse)
async def create_payment(
    payment_data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
) -> PaymentResponse:
    """
    Create a payment for one-time purchase or subscription
    """
    try:
        # Create payment via service
        result = await payment_service.create_payment(
            amount=Decimal(str(payment_data.amount)),
            currency=payment_data.currency,
            payment_method=payment_data.payment_method,
            user_id=current_user["id"],
            description=payment_data.description,
            metadata=payment_data.metadata
        )
        
        # Save payment record to database
        payment = Payment(
            user_id=current_user["id"],
            amount=payment_data.amount,
            currency=payment_data.currency.value,
            payment_method=payment_data.payment_method.value,
            payment_id=result["payment_id"],
            status=result["status"].value,
            description=payment_data.description,
            metadata=payment_data.metadata,
            created_at=datetime.utcnow()
        )
        db.add(payment)
        db.commit()
        
        return PaymentResponse(
            payment_id=result["payment_id"],
            amount=payment_data.amount,
            currency=payment_data.currency,
            status=result["status"],
            payment_method=payment_data.payment_method,
            client_secret=result.get("client_secret"),
            approval_url=result.get("approval_url"),
            payment_url=result.get("payment_url"),
            payment_link=result.get("payment_link"),
            qr_code=result.get("qr_code"),
            created_at=result["created_at"]
        )
        
    except Exception as e:
        logger.error(f"Payment creation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/subscriptions/create", response_model=SubscriptionResponse)
async def create_subscription(
    subscription_data: SubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
) -> SubscriptionResponse:
    """
    Create a subscription for the user
    """
    try:
        # Check if user already has an active subscription
        existing = db.query(Subscription).filter(
            Subscription.user_id == current_user["id"],
            Subscription.status == "active"
        ).first()
        
        if existing and subscription_data.plan != SubscriptionPlan.FREE:
            raise HTTPException(
                status_code=400,
                detail="User already has an active subscription"
            )
        
        # Create subscription via service
        result = await payment_service.create_subscription(
            user_id=current_user["id"],
            plan=subscription_data.plan,
            payment_method=subscription_data.payment_method,
            billing_cycle=subscription_data.billing_cycle
        )
        
        # Save subscription to database
        subscription = Subscription(
            user_id=current_user["id"],
            plan=subscription_data.plan.value,
            billing_cycle=subscription_data.billing_cycle,
            payment_method=subscription_data.payment_method.value if subscription_data.payment_method else None,
            subscription_id=result["subscription_id"],
            status=result.get("status", "active"),
            current_period_start=result.get("current_period_start"),
            current_period_end=result.get("current_period_end"),
            created_at=datetime.utcnow()
        )
        db.add(subscription)
        db.commit()
        
        return SubscriptionResponse(
            subscription_id=result["subscription_id"],
            plan=subscription_data.plan,
            billing_cycle=subscription_data.billing_cycle,
            status=result.get("status", "active"),
            current_period_start=result.get("current_period_start"),
            current_period_end=result.get("current_period_end"),
            payment_method=subscription_data.payment_method,
            client_secret=result.get("client_secret"),
            approval_url=result.get("approval_url"),
            created_at=subscription.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Subscription creation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/subscriptions/{subscription_id}/cancel")
async def cancel_subscription(
    subscription_id: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Cancel a subscription
    """
    try:
        # Get subscription from database
        subscription = db.query(Subscription).filter(
            Subscription.subscription_id == subscription_id,
            Subscription.user_id == current_user["id"]
        ).first()
        
        if not subscription:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        if subscription.status != "active":
            raise HTTPException(
                status_code=400,
                detail="Subscription is not active"
            )
        
        # Cancel via service
        payment_method = PaymentMethod(subscription.payment_method) if subscription.payment_method else None
        result = await payment_service.cancel_subscription(
            subscription_id=subscription_id,
            payment_method=payment_method
        )
        
        # Update database
        subscription.status = "cancelled"
        subscription.cancelled_at = datetime.utcnow()
        db.commit()
        
        return {
            "subscription_id": subscription_id,
            "status": "cancelled",
            "cancelled_at": subscription.cancelled_at
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Subscription cancellation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/subscriptions/current", response_model=SubscriptionResponse)
async def get_current_subscription(
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
) -> SubscriptionResponse:
    """
    Get user's current subscription
    """
    subscription = db.query(Subscription).filter(
        Subscription.user_id == current_user["id"],
        Subscription.status == "active"
    ).first()
    
    if not subscription:
        # Return free plan if no subscription
        return SubscriptionResponse(
            subscription_id=f"free_{current_user['id']}",
            plan=SubscriptionPlan.FREE,
            billing_cycle="monthly",
            status="active",
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow(),
            created_at=datetime.utcnow()
        )
    
    return SubscriptionResponse(
        subscription_id=subscription.subscription_id,
        plan=SubscriptionPlan(subscription.plan),
        billing_cycle=subscription.billing_cycle,
        status=subscription.status,
        current_period_start=subscription.current_period_start,
        current_period_end=subscription.current_period_end,
        payment_method=PaymentMethod(subscription.payment_method) if subscription.payment_method else None,
        created_at=subscription.created_at
    )


@router.get("/history")
async def get_payment_history(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get user's payment history
    """
    payments = db.query(Payment).filter(
        Payment.user_id == current_user["id"]
    ).order_by(Payment.created_at.desc()).offset(offset).limit(limit).all()
    
    return {
        "payments": [
            {
                "payment_id": p.payment_id,
                "amount": p.amount,
                "currency": p.currency,
                "status": p.status,
                "payment_method": p.payment_method,
                "description": p.description,
                "created_at": p.created_at
            }
            for p in payments
        ],
        "total": db.query(Payment).filter(Payment.user_id == current_user["id"]).count()
    }


@router.get("/invoices")
async def get_invoices(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get user's invoices
    """
    invoices = db.query(Invoice).filter(
        Invoice.user_id == current_user["id"]
    ).order_by(Invoice.created_at.desc()).offset(offset).limit(limit).all()
    
    return {
        "invoices": [
            {
                "invoice_id": i.invoice_id,
                "invoice_number": i.invoice_number,
                "amount": i.amount,
                "currency": i.currency,
                "status": i.status,
                "issue_date": i.issue_date,
                "due_date": i.due_date,
                "pdf_url": i.pdf_url
            }
            for i in invoices
        ],
        "total": db.query(Invoice).filter(Invoice.user_id == current_user["id"]).count()
    }


@router.get("/invoices/{invoice_id}/download")
async def download_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, str]:
    """
    Get invoice download URL
    """
    invoice = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id,
        Invoice.user_id == current_user["id"]
    ).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    return {"download_url": invoice.pdf_url}


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
) -> Dict[str, str]:
    """
    Handle Stripe webhook events
    """
    try:
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        
        # Verify webhook signature (simplified - actual implementation would verify)
        # event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        
        # Process event based on type
        # This is a simplified example - actual implementation would handle various events
        event_type = request.headers.get("event-type", "payment.succeeded")
        
        if event_type == "payment_intent.succeeded":
            # Update payment status in database
            pass
        elif event_type == "subscription.updated":
            # Update subscription in database
            pass
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Webhook processing failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhooks/paypal")
async def paypal_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
) -> Dict[str, str]:
    """
    Handle PayPal webhook events
    """
    try:
        payload = await request.json()
        
        # Process PayPal IPN/webhook
        event_type = payload.get("event_type")
        
        if event_type == "PAYMENT.SALE.COMPLETED":
            # Update payment status
            pass
        elif event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
            # Update subscription
            pass
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"PayPal webhook failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status/{payment_id}")
async def get_payment_status(
    payment_id: str,
    payment_method: PaymentMethod,
    db: Session = Depends(get_db),
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get payment status
    """
    try:
        # Verify payment belongs to user
        payment = db.query(Payment).filter(
            Payment.payment_id == payment_id,
            Payment.user_id == current_user["id"]
        ).first()
        
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        # Get status from payment service
        status_result = await payment_service.get_payment_status(
            payment_id=payment_id,
            payment_method=payment_method
        )
        
        # Update database if status changed
        if status_result["status"] != payment.status:
            payment.status = status_result["status"].value
            db.commit()
        
        return status_result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))