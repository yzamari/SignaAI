"""
Payment Service for SignaAI
Handles payment processing with Stripe, PayPal, and Israeli payment methods
"""

import os
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
import stripe
import paypalrestsdk
import httpx

logger = logging.getLogger(__name__)

# Payment configuration
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "sk_test_...")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "whsec_...")
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "...")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "...")
ISRACARD_MERCHANT_ID = os.getenv("ISRACARD_MERCHANT_ID", "...")
ISRACARD_API_KEY = os.getenv("ISRACARD_API_KEY", "...")
BIT_APP_ID = os.getenv("BIT_APP_ID", "...")
BIT_SECRET_KEY = os.getenv("BIT_SECRET_KEY", "...")

# Initialize payment providers
stripe.api_key = STRIPE_API_KEY
paypalrestsdk.configure({
    "mode": os.getenv("PAYPAL_MODE", "sandbox"),
    "client_id": PAYPAL_CLIENT_ID,
    "client_secret": PAYPAL_CLIENT_SECRET
})


class PaymentMethod(str, Enum):
    """Supported payment methods"""
    STRIPE = "stripe"
    PAYPAL = "paypal"
    ISRACARD = "isracard"
    BIT = "bit"
    BANK_TRANSFER = "bank_transfer"


class SubscriptionPlan(str, Enum):
    """Subscription plan types"""
    FREE = "free"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class Currency(str, Enum):
    """Supported currencies"""
    USD = "USD"
    EUR = "EUR"
    ILS = "ILS"  # Israeli Shekel
    AED = "AED"  # UAE Dirham
    SAR = "SAR"  # Saudi Riyal


class PaymentStatus(str, Enum):
    """Payment status states"""
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


# Subscription plan configuration
SUBSCRIPTION_PLANS = {
    SubscriptionPlan.FREE: {
        "name": "Free",
        "price_monthly": 0,
        "price_annual": 0,
        "documents_per_month": 5,
        "features": [
            "5 documents/month",
            "Basic AI detection",
            "Email support",
            "1 user"
        ],
        "stripe_price_id": None,
        "paypal_plan_id": None
    },
    SubscriptionPlan.PROFESSIONAL: {
        "name": "Professional",
        "price_monthly": 49,
        "price_annual": 490,
        "documents_per_month": 50,
        "features": [
            "50 documents/month",
            "Advanced AI detection",
            "Priority support",
            "5 users",
            "Custom branding",
            "API access"
        ],
        "stripe_price_id": "price_professional_monthly",
        "paypal_plan_id": "P-PROFESSIONAL"
    },
    SubscriptionPlan.ENTERPRISE: {
        "name": "Enterprise",
        "price_monthly": 199,
        "price_annual": 1990,
        "documents_per_month": -1,  # Unlimited
        "features": [
            "Unlimited documents",
            "Premium AI with learning",
            "24/7 phone support",
            "Unlimited users",
            "White label",
            "Advanced API",
            "Custom integrations",
            "SLA guarantee"
        ],
        "stripe_price_id": "price_enterprise_monthly",
        "paypal_plan_id": "P-ENTERPRISE"
    }
}


class PaymentService:
    """Main payment service handling all payment methods"""
    
    def __init__(self):
        self.stripe_service = StripePaymentService()
        self.paypal_service = PayPalPaymentService()
        self.isracard_service = IsracardPaymentService()
        self.bit_service = BitPaymentService()
    
    async def create_payment(
        self,
        amount: Decimal,
        currency: Currency,
        payment_method: PaymentMethod,
        user_id: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a payment with the specified payment method
        """
        try:
            if payment_method == PaymentMethod.STRIPE:
                return await self.stripe_service.create_payment(
                    amount, currency, user_id, description, metadata
                )
            elif payment_method == PaymentMethod.PAYPAL:
                return await self.paypal_service.create_payment(
                    amount, currency, user_id, description, metadata
                )
            elif payment_method == PaymentMethod.ISRACARD:
                return await self.isracard_service.create_payment(
                    amount, currency, user_id, description, metadata
                )
            elif payment_method == PaymentMethod.BIT:
                return await self.bit_service.create_payment(
                    amount, currency, user_id, description, metadata
                )
            else:
                raise ValueError(f"Unsupported payment method: {payment_method}")
                
        except Exception as e:
            logger.error(f"Payment creation failed: {e}")
            raise
    
    async def create_subscription(
        self,
        user_id: str,
        plan: SubscriptionPlan,
        payment_method: PaymentMethod,
        billing_cycle: str = "monthly"
    ) -> Dict[str, Any]:
        """
        Create a subscription for a user
        """
        plan_config = SUBSCRIPTION_PLANS[plan]
        
        if plan == SubscriptionPlan.FREE:
            # Free plan doesn't require payment
            return {
                "subscription_id": f"free_{user_id}",
                "plan": plan,
                "status": "active",
                "current_period_start": datetime.utcnow(),
                "current_period_end": datetime.utcnow() + timedelta(days=30),
                "payment_method": None
            }
        
        if payment_method == PaymentMethod.STRIPE:
            return await self.stripe_service.create_subscription(
                user_id, plan_config, billing_cycle
            )
        elif payment_method == PaymentMethod.PAYPAL:
            return await self.paypal_service.create_subscription(
                user_id, plan_config, billing_cycle
            )
        else:
            # For Israeli payment methods, create recurring payments
            price = plan_config[f"price_{billing_cycle}"]
            return await self.create_payment(
                amount=Decimal(str(price)),
                currency=Currency.ILS,
                payment_method=payment_method,
                user_id=user_id,
                description=f"{plan_config['name']} subscription ({billing_cycle})",
                metadata={"subscription_plan": plan, "billing_cycle": billing_cycle}
            )
    
    async def cancel_subscription(
        self,
        subscription_id: str,
        payment_method: PaymentMethod
    ) -> Dict[str, Any]:
        """
        Cancel a subscription
        """
        if payment_method == PaymentMethod.STRIPE:
            return await self.stripe_service.cancel_subscription(subscription_id)
        elif payment_method == PaymentMethod.PAYPAL:
            return await self.paypal_service.cancel_subscription(subscription_id)
        else:
            return {"status": "cancelled", "subscription_id": subscription_id}
    
    async def get_payment_status(
        self,
        payment_id: str,
        payment_method: PaymentMethod
    ) -> Dict[str, Any]:
        """
        Get the status of a payment
        """
        if payment_method == PaymentMethod.STRIPE:
            return await self.stripe_service.get_payment_status(payment_id)
        elif payment_method == PaymentMethod.PAYPAL:
            return await self.paypal_service.get_payment_status(payment_id)
        elif payment_method == PaymentMethod.ISRACARD:
            return await self.isracard_service.get_payment_status(payment_id)
        elif payment_method == PaymentMethod.BIT:
            return await self.bit_service.get_payment_status(payment_id)
        else:
            raise ValueError(f"Unsupported payment method: {payment_method}")


class StripePaymentService:
    """Stripe payment processing service"""
    
    async def create_payment(
        self,
        amount: Decimal,
        currency: Currency,
        user_id: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a Stripe payment intent"""
        try:
            # Convert amount to cents
            amount_cents = int(amount * 100)
            
            # Create payment intent
            intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency=currency.value.lower(),
                description=description,
                metadata=metadata or {},
                automatic_payment_methods={"enabled": True}
            )
            
            return {
                "payment_id": intent.id,
                "client_secret": intent.client_secret,
                "amount": float(amount),
                "currency": currency.value,
                "status": PaymentStatus.PENDING,
                "payment_method": PaymentMethod.STRIPE,
                "created_at": datetime.utcnow()
            }
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe payment failed: {e}")
            raise
    
    async def create_subscription(
        self,
        user_id: str,
        plan_config: Dict[str, Any],
        billing_cycle: str
    ) -> Dict[str, Any]:
        """Create a Stripe subscription"""
        try:
            # Create or get customer
            customer = stripe.Customer.create(
                metadata={"user_id": user_id}
            )
            
            # Create subscription
            subscription = stripe.Subscription.create(
                customer=customer.id,
                items=[{"price": plan_config["stripe_price_id"]}],
                payment_behavior="default_incomplete",
                expand=["latest_invoice.payment_intent"]
            )
            
            return {
                "subscription_id": subscription.id,
                "customer_id": customer.id,
                "status": subscription.status,
                "current_period_start": datetime.fromtimestamp(subscription.current_period_start),
                "current_period_end": datetime.fromtimestamp(subscription.current_period_end),
                "client_secret": subscription.latest_invoice.payment_intent.client_secret,
                "payment_method": PaymentMethod.STRIPE
            }
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe subscription failed: {e}")
            raise
    
    async def cancel_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """Cancel a Stripe subscription"""
        try:
            subscription = stripe.Subscription.delete(subscription_id)
            return {
                "subscription_id": subscription.id,
                "status": "cancelled",
                "cancelled_at": datetime.fromtimestamp(subscription.canceled_at)
            }
        except stripe.error.StripeError as e:
            logger.error(f"Stripe cancellation failed: {e}")
            raise
    
    async def get_payment_status(self, payment_id: str) -> Dict[str, Any]:
        """Get Stripe payment status"""
        try:
            intent = stripe.PaymentIntent.retrieve(payment_id)
            return {
                "payment_id": intent.id,
                "status": self._map_stripe_status(intent.status),
                "amount": intent.amount / 100,
                "currency": intent.currency.upper()
            }
        except stripe.error.StripeError as e:
            logger.error(f"Stripe status check failed: {e}")
            raise
    
    def _map_stripe_status(self, stripe_status: str) -> PaymentStatus:
        """Map Stripe status to internal status"""
        mapping = {
            "requires_payment_method": PaymentStatus.PENDING,
            "requires_confirmation": PaymentStatus.PENDING,
            "requires_action": PaymentStatus.PENDING,
            "processing": PaymentStatus.PROCESSING,
            "succeeded": PaymentStatus.SUCCEEDED,
            "canceled": PaymentStatus.CANCELLED
        }
        return mapping.get(stripe_status, PaymentStatus.FAILED)


class PayPalPaymentService:
    """PayPal payment processing service"""
    
    async def create_payment(
        self,
        amount: Decimal,
        currency: Currency,
        user_id: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a PayPal payment"""
        try:
            payment = paypalrestsdk.Payment({
                "intent": "sale",
                "payer": {"payment_method": "paypal"},
                "transactions": [{
                    "amount": {
                        "total": str(amount),
                        "currency": currency.value
                    },
                    "description": description
                }],
                "redirect_urls": {
                    "return_url": f"{os.getenv('APP_URL')}/payment/success",
                    "cancel_url": f"{os.getenv('APP_URL')}/payment/cancel"
                }
            })
            
            if payment.create():
                # Get approval URL
                approval_url = None
                for link in payment.links:
                    if link.rel == "approval_url":
                        approval_url = link.href
                        break
                
                return {
                    "payment_id": payment.id,
                    "approval_url": approval_url,
                    "amount": float(amount),
                    "currency": currency.value,
                    "status": PaymentStatus.PENDING,
                    "payment_method": PaymentMethod.PAYPAL,
                    "created_at": datetime.utcnow()
                }
            else:
                logger.error(f"PayPal payment creation failed: {payment.error}")
                raise Exception("PayPal payment creation failed")
                
        except Exception as e:
            logger.error(f"PayPal payment failed: {e}")
            raise
    
    async def create_subscription(
        self,
        user_id: str,
        plan_config: Dict[str, Any],
        billing_cycle: str
    ) -> Dict[str, Any]:
        """Create a PayPal subscription"""
        try:
            billing_plan = paypalrestsdk.BillingPlan({
                "name": plan_config["name"],
                "description": f"{plan_config['name']} subscription",
                "type": "INFINITE",
                "payment_definitions": [{
                    "name": f"{billing_cycle} payment",
                    "type": "REGULAR",
                    "frequency": "MONTH" if billing_cycle == "monthly" else "YEAR",
                    "frequency_interval": "1",
                    "amount": {
                        "value": str(plan_config[f"price_{billing_cycle}"]),
                        "currency": "USD"
                    }
                }],
                "merchant_preferences": {
                    "return_url": f"{os.getenv('APP_URL')}/payment/success",
                    "cancel_url": f"{os.getenv('APP_URL')}/payment/cancel",
                    "auto_bill_amount": "YES"
                }
            })
            
            if billing_plan.create() and billing_plan.activate():
                # Create billing agreement
                agreement = paypalrestsdk.BillingAgreement({
                    "name": f"{plan_config['name']} Agreement",
                    "description": f"Agreement for {plan_config['name']} plan",
                    "start_date": (datetime.utcnow() + timedelta(minutes=5)).isoformat() + "Z",
                    "plan": {"id": billing_plan.id},
                    "payer": {"payment_method": "paypal"}
                })
                
                if agreement.create():
                    # Get approval URL
                    approval_url = None
                    for link in agreement.links:
                        if link.rel == "approval_url":
                            approval_url = link.href
                            break
                    
                    return {
                        "subscription_id": agreement.id,
                        "plan_id": billing_plan.id,
                        "approval_url": approval_url,
                        "status": "pending_approval",
                        "payment_method": PaymentMethod.PAYPAL
                    }
            
            raise Exception("PayPal subscription creation failed")
            
        except Exception as e:
            logger.error(f"PayPal subscription failed: {e}")
            raise
    
    async def cancel_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """Cancel a PayPal subscription"""
        try:
            agreement = paypalrestsdk.BillingAgreement.find(subscription_id)
            if agreement.cancel({"note": "User requested cancellation"}):
                return {
                    "subscription_id": subscription_id,
                    "status": "cancelled",
                    "cancelled_at": datetime.utcnow()
                }
            raise Exception("PayPal cancellation failed")
        except Exception as e:
            logger.error(f"PayPal cancellation failed: {e}")
            raise
    
    async def get_payment_status(self, payment_id: str) -> Dict[str, Any]:
        """Get PayPal payment status"""
        try:
            payment = paypalrestsdk.Payment.find(payment_id)
            return {
                "payment_id": payment.id,
                "status": self._map_paypal_status(payment.state),
                "amount": float(payment.transactions[0].amount.total),
                "currency": payment.transactions[0].amount.currency
            }
        except Exception as e:
            logger.error(f"PayPal status check failed: {e}")
            raise
    
    def _map_paypal_status(self, paypal_status: str) -> PaymentStatus:
        """Map PayPal status to internal status"""
        mapping = {
            "created": PaymentStatus.PENDING,
            "approved": PaymentStatus.PROCESSING,
            "failed": PaymentStatus.FAILED,
            "cancelled": PaymentStatus.CANCELLED,
            "expired": PaymentStatus.FAILED,
            "pending": PaymentStatus.PENDING,
            "in_progress": PaymentStatus.PROCESSING,
            "completed": PaymentStatus.SUCCEEDED
        }
        return mapping.get(paypal_status.lower(), PaymentStatus.FAILED)


class IsracardPaymentService:
    """Isracard (Israeli credit card) payment service"""
    
    async def create_payment(
        self,
        amount: Decimal,
        currency: Currency,
        user_id: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create an Isracard payment"""
        try:
            # Convert to ILS if needed
            if currency != Currency.ILS:
                amount = await self._convert_currency(amount, currency, Currency.ILS)
                currency = Currency.ILS
            
            # Isracard API call (simplified - actual implementation would be more complex)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.isracard.co.il/v1/payments",
                    json={
                        "merchant_id": ISRACARD_MERCHANT_ID,
                        "amount": str(amount),
                        "currency": "ILS",
                        "description": description,
                        "user_reference": user_id,
                        "metadata": metadata
                    },
                    headers={
                        "Authorization": f"Bearer {ISRACARD_API_KEY}",
                        "Content-Type": "application/json"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "payment_id": data["transaction_id"],
                        "payment_url": data["payment_url"],
                        "amount": float(amount),
                        "currency": "ILS",
                        "status": PaymentStatus.PENDING,
                        "payment_method": PaymentMethod.ISRACARD,
                        "created_at": datetime.utcnow()
                    }
                else:
                    raise Exception(f"Isracard payment failed: {response.text}")
                    
        except Exception as e:
            logger.error(f"Isracard payment failed: {e}")
            raise
    
    async def get_payment_status(self, payment_id: str) -> Dict[str, Any]:
        """Get Isracard payment status"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://api.isracard.co.il/v1/payments/{payment_id}",
                    headers={
                        "Authorization": f"Bearer {ISRACARD_API_KEY}"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "payment_id": payment_id,
                        "status": self._map_isracard_status(data["status"]),
                        "amount": data["amount"],
                        "currency": "ILS"
                    }
                else:
                    raise Exception(f"Status check failed: {response.text}")
                    
        except Exception as e:
            logger.error(f"Isracard status check failed: {e}")
            raise
    
    def _map_isracard_status(self, isracard_status: str) -> PaymentStatus:
        """Map Isracard status to internal status"""
        mapping = {
            "pending": PaymentStatus.PENDING,
            "processing": PaymentStatus.PROCESSING,
            "approved": PaymentStatus.SUCCEEDED,
            "declined": PaymentStatus.FAILED,
            "cancelled": PaymentStatus.CANCELLED
        }
        return mapping.get(isracard_status.lower(), PaymentStatus.FAILED)
    
    async def _convert_currency(
        self,
        amount: Decimal,
        from_currency: Currency,
        to_currency: Currency
    ) -> Decimal:
        """Convert currency using exchange rates"""
        # Simplified - actual implementation would use real exchange rates
        exchange_rates = {
            "USD_ILS": Decimal("3.30"),
            "EUR_ILS": Decimal("3.60"),
            "ILS_USD": Decimal("0.30"),
            "ILS_EUR": Decimal("0.28")
        }
        
        rate_key = f"{from_currency.value}_{to_currency.value}"
        if rate_key in exchange_rates:
            return amount * exchange_rates[rate_key]
        return amount


class BitPaymentService:
    """Bit (Israeli payment app) service"""
    
    async def create_payment(
        self,
        amount: Decimal,
        currency: Currency,
        user_id: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a Bit payment request"""
        try:
            # Bit only supports ILS
            if currency != Currency.ILS:
                raise ValueError("Bit only supports ILS currency")
            
            # Bit API call (simplified)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.bit-pay.co.il/v1/payments",
                    json={
                        "app_id": BIT_APP_ID,
                        "amount": str(amount),
                        "description": description,
                        "user_id": user_id,
                        "callback_url": f"{os.getenv('APP_URL')}/api/v1/payments/bit/callback",
                        "metadata": metadata
                    },
                    headers={
                        "Authorization": f"Bearer {BIT_SECRET_KEY}",
                        "Content-Type": "application/json"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "payment_id": data["payment_id"],
                        "payment_link": data["payment_link"],
                        "qr_code": data["qr_code"],
                        "amount": float(amount),
                        "currency": "ILS",
                        "status": PaymentStatus.PENDING,
                        "payment_method": PaymentMethod.BIT,
                        "created_at": datetime.utcnow()
                    }
                else:
                    raise Exception(f"Bit payment failed: {response.text}")
                    
        except Exception as e:
            logger.error(f"Bit payment failed: {e}")
            raise
    
    async def get_payment_status(self, payment_id: str) -> Dict[str, Any]:
        """Get Bit payment status"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://api.bit-pay.co.il/v1/payments/{payment_id}",
                    headers={
                        "Authorization": f"Bearer {BIT_SECRET_KEY}"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "payment_id": payment_id,
                        "status": self._map_bit_status(data["status"]),
                        "amount": data["amount"],
                        "currency": "ILS"
                    }
                else:
                    raise Exception(f"Status check failed: {response.text}")
                    
        except Exception as e:
            logger.error(f"Bit status check failed: {e}")
            raise
    
    def _map_bit_status(self, bit_status: str) -> PaymentStatus:
        """Map Bit status to internal status"""
        mapping = {
            "pending": PaymentStatus.PENDING,
            "processing": PaymentStatus.PROCESSING,
            "completed": PaymentStatus.SUCCEEDED,
            "failed": PaymentStatus.FAILED,
            "cancelled": PaymentStatus.CANCELLED,
            "expired": PaymentStatus.FAILED
        }
        return mapping.get(bit_status.lower(), PaymentStatus.FAILED)