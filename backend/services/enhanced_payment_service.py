"""
Enhanced Payment Service with Multi-Currency and Subscription Management
Supports Stripe, PayPal, Isracard, and Bit payment methods
"""

import stripe
import paypalrestsdk
from decimal import Decimal
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from enum import Enum
import hashlib
import hmac
import requests
import json
import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Payment provider configurations from environment
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY")
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID")
PAYPAL_SECRET = os.getenv("PAYPAL_SECRET")
ISRACARD_MERCHANT_ID = os.getenv("ISRACARD_MERCHANT_ID")
BIT_APP_ID = os.getenv("BIT_APP_ID")

if not STRIPE_API_KEY:
    logger.warning("STRIPE_API_KEY not set - Stripe payments will not be available")
if not PAYPAL_CLIENT_ID or not PAYPAL_SECRET:
    logger.warning("PayPal credentials not set - PayPal payments will not be available")

class PaymentMethod(Enum):
    STRIPE_CARD = "stripe_card"
    PAYPAL = "paypal"
    ISRACARD = "isracard"
    BIT = "bit"
    BANK_TRANSFER = "bank_transfer"

class Currency(Enum):
    USD = "USD"
    EUR = "EUR"
    ILS = "ILS"
    SAR = "SAR"
    AED = "AED"

class SubscriptionPlan(Enum):
    FREE = "free"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"

@dataclass
class PlanDetails:
    name: str
    price_monthly: Dict[Currency, Decimal]
    price_annual: Dict[Currency, Decimal]
    documents_per_month: int
    features: List[str]
    api_access: bool
    custom_branding: bool
    priority_support: bool

class EnhancedPaymentService:
    """
    Enhanced payment service with full integration for multiple providers
    """
    
    # Plan definitions
    PLANS = {
        SubscriptionPlan.FREE: PlanDetails(
            name="Free Plan",
            price_monthly={
                Currency.USD: Decimal("0"),
                Currency.EUR: Decimal("0"),
                Currency.ILS: Decimal("0"),
                Currency.SAR: Decimal("0"),
                Currency.AED: Decimal("0")
            },
            price_annual={
                Currency.USD: Decimal("0"),
                Currency.EUR: Decimal("0"),
                Currency.ILS: Decimal("0"),
                Currency.SAR: Decimal("0"),
                Currency.AED: Decimal("0")
            },
            documents_per_month=5,
            features=["Basic signatures", "Email notifications", "PDF support"],
            api_access=False,
            custom_branding=False,
            priority_support=False
        ),
        SubscriptionPlan.PROFESSIONAL: PlanDetails(
            name="Professional Plan",
            price_monthly={
                Currency.USD: Decimal("49"),
                Currency.EUR: Decimal("45"),
                Currency.ILS: Decimal("159"),
                Currency.SAR: Decimal("184"),
                Currency.AED: Decimal("180")
            },
            price_annual={
                Currency.USD: Decimal("490"),
                Currency.EUR: Decimal("450"),
                Currency.ILS: Decimal("1590"),
                Currency.SAR: Decimal("1840"),
                Currency.AED: Decimal("1800")
            },
            documents_per_month=50,
            features=[
                "Advanced signatures",
                "SMS/WhatsApp notifications",
                "AI field detection",
                "Templates",
                "Multi-language support"
            ],
            api_access=True,
            custom_branding=False,
            priority_support=True
        ),
        SubscriptionPlan.ENTERPRISE: PlanDetails(
            name="Enterprise Plan",
            price_monthly={
                Currency.USD: Decimal("199"),
                Currency.EUR: Decimal("180"),
                Currency.ILS: Decimal("649"),
                Currency.SAR: Decimal("749"),
                Currency.AED: Decimal("730")
            },
            price_annual={
                Currency.USD: Decimal("1990"),
                Currency.EUR: Decimal("1800"),
                Currency.ILS: Decimal("6490"),
                Currency.SAR: Decimal("7490"),
                Currency.AED: Decimal("7300")
            },
            documents_per_month=999999,  # Unlimited
            features=[
                "All Professional features",
                "Unlimited documents",
                "Custom branding",
                "API access",
                "Dedicated support",
                "SLA guarantee",
                "Custom integrations"
            ],
            api_access=True,
            custom_branding=True,
            priority_support=True
        )
    }
    
    def __init__(self):
        """Initialize payment providers"""
        # Initialize Stripe
        stripe.api_key = STRIPE_API_KEY
        
        # Initialize PayPal
        paypalrestsdk.configure({
            "mode": "sandbox",  # Change to "live" in production
            "client_id": PAYPAL_CLIENT_ID,
            "client_secret": PAYPAL_SECRET
        })
        
        # Initialize Israeli payment providers
        self.isracard_api_url = "https://api.isracard.co.il/v1"
        self.bit_api_url = "https://api.bit.co.il/v1"
    
    async def create_subscription(
        self,
        user_id: str,
        plan: SubscriptionPlan,
        payment_method: PaymentMethod,
        currency: Currency,
        billing_cycle: str = "monthly",
        payment_details: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Create a subscription for a user
        
        Args:
            user_id: User identifier
            plan: Subscription plan
            payment_method: Payment method to use
            currency: Currency for billing
            billing_cycle: "monthly" or "annual"
            payment_details: Payment method specific details
            
        Returns:
            Subscription details
        """
        plan_details = self.PLANS[plan]
        
        if billing_cycle == "monthly":
            amount = plan_details.price_monthly[currency]
        else:
            amount = plan_details.price_annual[currency]
        
        # Process payment based on method
        if payment_method == PaymentMethod.STRIPE_CARD:
            result = await self._create_stripe_subscription(
                user_id, plan, amount, currency, billing_cycle, payment_details
            )
        elif payment_method == PaymentMethod.PAYPAL:
            result = await self._create_paypal_subscription(
                user_id, plan, amount, currency, billing_cycle, payment_details
            )
        elif payment_method == PaymentMethod.ISRACARD:
            result = await self._create_isracard_subscription(
                user_id, plan, amount, currency, billing_cycle, payment_details
            )
        elif payment_method == PaymentMethod.BIT:
            result = await self._create_bit_subscription(
                user_id, plan, amount, currency, billing_cycle, payment_details
            )
        else:
            raise ValueError(f"Unsupported payment method: {payment_method}")
        
        # Save subscription to database
        subscription = {
            'user_id': user_id,
            'plan': plan.value,
            'payment_method': payment_method.value,
            'currency': currency.value,
            'billing_cycle': billing_cycle,
            'amount': str(amount),
            'status': 'active',
            'created_at': datetime.now().isoformat(),
            'next_billing_date': self._calculate_next_billing_date(billing_cycle),
            'provider_subscription_id': result.get('subscription_id'),
            'features': plan_details.features,
            'document_limit': plan_details.documents_per_month
        }
        
        return subscription
    
    async def _create_stripe_subscription(
        self,
        user_id: str,
        plan: SubscriptionPlan,
        amount: Decimal,
        currency: Currency,
        billing_cycle: str,
        payment_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create Stripe subscription"""
        try:
            # Create or get customer
            customer = stripe.Customer.create(
                metadata={'user_id': user_id},
                email=payment_details.get('email'),
                payment_method=payment_details.get('payment_method_id')
            )
            
            # Create price
            price = stripe.Price.create(
                unit_amount=int(amount * 100),  # Amount in cents
                currency=currency.value.lower(),
                recurring={
                    'interval': 'month' if billing_cycle == 'monthly' else 'year'
                },
                product_data={
                    'name': f"SignaAI {plan.value.title()} Plan"
                }
            )
            
            # Create subscription
            subscription = stripe.Subscription.create(
                customer=customer.id,
                items=[{'price': price.id}],
                default_payment_method=payment_details.get('payment_method_id')
            )
            
            return {
                'subscription_id': subscription.id,
                'customer_id': customer.id,
                'status': subscription.status,
                'current_period_end': subscription.current_period_end
            }
        
        except stripe.error.StripeError as e:
            logger.error(f"Stripe subscription error: {e}")
            raise Exception(f"Payment failed: {str(e)}")
    
    async def _create_paypal_subscription(
        self,
        user_id: str,
        plan: SubscriptionPlan,
        amount: Decimal,
        currency: Currency,
        billing_cycle: str,
        payment_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create PayPal subscription"""
        try:
            # Create billing plan
            billing_plan = paypalrestsdk.BillingPlan({
                "name": f"SignaAI {plan.value.title()} Plan",
                "description": f"SignaAI subscription - {billing_cycle}",
                "type": "INFINITE",
                "payment_definitions": [{
                    "name": "Regular Payment",
                    "type": "REGULAR",
                    "frequency": "MONTH" if billing_cycle == "monthly" else "YEAR",
                    "frequency_interval": "1",
                    "amount": {
                        "value": str(amount),
                        "currency": currency.value
                    }
                }],
                "merchant_preferences": {
                    "return_url": payment_details.get('return_url'),
                    "cancel_url": payment_details.get('cancel_url'),
                    "auto_bill_amount": "YES"
                }
            })
            
            if billing_plan.create():
                # Activate plan
                billing_plan.activate()
                
                # Create agreement
                agreement = paypalrestsdk.BillingAgreement({
                    "name": f"SignaAI Subscription",
                    "description": f"Agreement for SignaAI {plan.value.title()} Plan",
                    "start_date": (datetime.now() + timedelta(days=1)).isoformat() + "Z",
                    "plan": {
                        "id": billing_plan.id
                    },
                    "payer": {
                        "payment_method": "paypal"
                    }
                })
                
                if agreement.create():
                    # Get approval URL
                    for link in agreement.links:
                        if link.rel == "approval_url":
                            approval_url = link.href
                            break
                    
                    return {
                        'subscription_id': agreement.id,
                        'plan_id': billing_plan.id,
                        'approval_url': approval_url,
                        'status': 'pending_approval'
                    }
            
            raise Exception("Failed to create PayPal subscription")
        
        except Exception as e:
            logger.error(f"PayPal subscription error: {e}")
            raise Exception(f"PayPal payment failed: {str(e)}")
    
    async def _create_isracard_subscription(
        self,
        user_id: str,
        plan: SubscriptionPlan,
        amount: Decimal,
        currency: Currency,
        billing_cycle: str,
        payment_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create Isracard subscription (Israeli credit card)"""
        try:
            # Prepare request data
            data = {
                'merchant_id': ISRACARD_MERCHANT_ID,
                'amount': float(amount),
                'currency': 'ILS',  # Isracard only supports ILS
                'card_number': payment_details.get('card_number'),
                'card_holder_id': payment_details.get('id_number'),  # Israeli ID
                'card_exp': payment_details.get('expiry'),
                'card_cvv': payment_details.get('cvv'),
                'recurring': True,
                'recurring_interval': billing_cycle,
                'description': f"SignaAI {plan.value.title()} Subscription"
            }
            
            # Create signature
            signature = self._create_isracard_signature(data)
            data['signature'] = signature
            
            # Make API request
            response = requests.post(
                f"{self.isracard_api_url}/transactions/recurring",
                json=data,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'subscription_id': result.get('recurring_id'),
                    'transaction_id': result.get('transaction_id'),
                    'status': 'active',
                    'next_charge': result.get('next_charge_date')
                }
            else:
                raise Exception(f"Isracard API error: {response.text}")
        
        except Exception as e:
            logger.error(f"Isracard subscription error: {e}")
            raise Exception(f"Isracard payment failed: {str(e)}")
    
    async def _create_bit_subscription(
        self,
        user_id: str,
        plan: SubscriptionPlan,
        amount: Decimal,
        currency: Currency,
        billing_cycle: str,
        payment_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create Bit payment (Israeli instant payment)"""
        try:
            # Bit doesn't support recurring payments directly
            # Create payment link for manual renewal
            data = {
                'app_id': BIT_APP_ID,
                'amount': float(amount),
                'currency': 'ILS',
                'phone': payment_details.get('phone'),
                'description': f"SignaAI {plan.value.title()} - {billing_cycle}",
                'reference': user_id,
                'callback_url': payment_details.get('callback_url')
            }
            
            # Generate payment link
            response = requests.post(
                f"{self.bit_api_url}/payment-links",
                json=data,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'subscription_id': f"bit_{result.get('link_id')}",
                    'payment_link': result.get('payment_url'),
                    'qr_code': result.get('qr_code_url'),
                    'status': 'pending_payment',
                    'expires_at': result.get('expiry')
                }
            else:
                raise Exception(f"Bit API error: {response.text}")
        
        except Exception as e:
            logger.error(f"Bit payment error: {e}")
            raise Exception(f"Bit payment failed: {str(e)}")
    
    async def cancel_subscription(
        self,
        subscription_id: str,
        payment_method: PaymentMethod
    ) -> Dict[str, Any]:
        """
        Cancel a subscription
        
        Args:
            subscription_id: Subscription identifier
            payment_method: Payment method used
            
        Returns:
            Cancellation confirmation
        """
        if payment_method == PaymentMethod.STRIPE_CARD:
            result = await self._cancel_stripe_subscription(subscription_id)
        elif payment_method == PaymentMethod.PAYPAL:
            result = await self._cancel_paypal_subscription(subscription_id)
        elif payment_method == PaymentMethod.ISRACARD:
            result = await self._cancel_isracard_subscription(subscription_id)
        else:
            result = {'status': 'cancelled'}
        
        return {
            'subscription_id': subscription_id,
            'status': 'cancelled',
            'cancelled_at': datetime.now().isoformat(),
            'provider_response': result
        }
    
    async def _cancel_stripe_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """Cancel Stripe subscription"""
        try:
            subscription = stripe.Subscription.delete(subscription_id)
            return {
                'status': subscription.status,
                'canceled_at': subscription.canceled_at
            }
        except stripe.error.StripeError as e:
            logger.error(f"Stripe cancellation error: {e}")
            raise Exception(f"Cancellation failed: {str(e)}")
    
    async def _cancel_paypal_subscription(self, agreement_id: str) -> Dict[str, Any]:
        """Cancel PayPal subscription"""
        try:
            cancel_note = {
                "note": "Subscription canceled by user"
            }
            
            response = paypalrestsdk.BillingAgreement.cancel(
                agreement_id,
                cancel_note
            )
            
            return {'status': 'cancelled'}
        except Exception as e:
            logger.error(f"PayPal cancellation error: {e}")
            raise Exception(f"Cancellation failed: {str(e)}")
    
    async def _cancel_isracard_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """Cancel Isracard subscription"""
        try:
            response = requests.delete(
                f"{self.isracard_api_url}/subscriptions/{subscription_id}",
                headers={'Authorization': f"Bearer {ISRACARD_MERCHANT_ID}"}
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                raise Exception(f"Isracard cancellation error: {response.text}")
        except Exception as e:
            logger.error(f"Isracard cancellation error: {e}")
            raise Exception(f"Cancellation failed: {str(e)}")
    
    async def process_one_time_payment(
        self,
        amount: Decimal,
        currency: Currency,
        payment_method: PaymentMethod,
        payment_details: Dict[str, Any],
        description: str = "SignaAI Payment"
    ) -> Dict[str, Any]:
        """
        Process a one-time payment
        
        Args:
            amount: Payment amount
            currency: Payment currency
            payment_method: Payment method
            payment_details: Payment details
            description: Payment description
            
        Returns:
            Payment confirmation
        """
        if payment_method == PaymentMethod.STRIPE_CARD:
            result = await self._process_stripe_payment(
                amount, currency, payment_details, description
            )
        elif payment_method == PaymentMethod.PAYPAL:
            result = await self._process_paypal_payment(
                amount, currency, payment_details, description
            )
        elif payment_method == PaymentMethod.ISRACARD:
            result = await self._process_isracard_payment(
                amount, currency, payment_details, description
            )
        elif payment_method == PaymentMethod.BIT:
            result = await self._process_bit_payment(
                amount, currency, payment_details, description
            )
        else:
            raise ValueError(f"Unsupported payment method: {payment_method}")
        
        return {
            'payment_id': result.get('payment_id'),
            'amount': str(amount),
            'currency': currency.value,
            'status': result.get('status'),
            'payment_method': payment_method.value,
            'processed_at': datetime.now().isoformat(),
            'provider_response': result
        }
    
    async def _process_stripe_payment(
        self,
        amount: Decimal,
        currency: Currency,
        payment_details: Dict[str, Any],
        description: str
    ) -> Dict[str, Any]:
        """Process Stripe payment"""
        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=int(amount * 100),
                currency=currency.value.lower(),
                payment_method=payment_details.get('payment_method_id'),
                confirm=True,
                description=description
            )
            
            return {
                'payment_id': payment_intent.id,
                'status': payment_intent.status,
                'client_secret': payment_intent.client_secret
            }
        except stripe.error.StripeError as e:
            logger.error(f"Stripe payment error: {e}")
            raise Exception(f"Payment failed: {str(e)}")
    
    async def _process_paypal_payment(
        self,
        amount: Decimal,
        currency: Currency,
        payment_details: Dict[str, Any],
        description: str
    ) -> Dict[str, Any]:
        """Process PayPal payment"""
        try:
            payment = paypalrestsdk.Payment({
                "intent": "sale",
                "payer": {
                    "payment_method": "paypal"
                },
                "transactions": [{
                    "amount": {
                        "total": str(amount),
                        "currency": currency.value
                    },
                    "description": description
                }],
                "redirect_urls": {
                    "return_url": payment_details.get('return_url'),
                    "cancel_url": payment_details.get('cancel_url')
                }
            })
            
            if payment.create():
                for link in payment.links:
                    if link.rel == "approval_url":
                        approval_url = link.href
                        break
                
                return {
                    'payment_id': payment.id,
                    'status': 'pending_approval',
                    'approval_url': approval_url
                }
            else:
                raise Exception("Failed to create PayPal payment")
        
        except Exception as e:
            logger.error(f"PayPal payment error: {e}")
            raise Exception(f"PayPal payment failed: {str(e)}")
    
    async def _process_isracard_payment(
        self,
        amount: Decimal,
        currency: Currency,
        payment_details: Dict[str, Any],
        description: str
    ) -> Dict[str, Any]:
        """Process Isracard payment"""
        try:
            data = {
                'merchant_id': ISRACARD_MERCHANT_ID,
                'amount': float(amount),
                'currency': 'ILS',
                'card_number': payment_details.get('card_number'),
                'card_holder_id': payment_details.get('id_number'),
                'card_exp': payment_details.get('expiry'),
                'card_cvv': payment_details.get('cvv'),
                'description': description
            }
            
            signature = self._create_isracard_signature(data)
            data['signature'] = signature
            
            response = requests.post(
                f"{self.isracard_api_url}/transactions",
                json=data,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'payment_id': result.get('transaction_id'),
                    'status': 'completed' if result.get('approved') else 'failed',
                    'approval_code': result.get('approval_code')
                }
            else:
                raise Exception(f"Isracard API error: {response.text}")
        
        except Exception as e:
            logger.error(f"Isracard payment error: {e}")
            raise Exception(f"Isracard payment failed: {str(e)}")
    
    async def _process_bit_payment(
        self,
        amount: Decimal,
        currency: Currency,
        payment_details: Dict[str, Any],
        description: str
    ) -> Dict[str, Any]:
        """Process Bit payment"""
        try:
            data = {
                'app_id': BIT_APP_ID,
                'amount': float(amount),
                'currency': 'ILS',
                'phone': payment_details.get('phone'),
                'description': description,
                'callback_url': payment_details.get('callback_url')
            }
            
            response = requests.post(
                f"{self.bit_api_url}/payment-links",
                json=data,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    'payment_id': result.get('link_id'),
                    'status': 'pending',
                    'payment_url': result.get('payment_url'),
                    'qr_code': result.get('qr_code_url')
                }
            else:
                raise Exception(f"Bit API error: {response.text}")
        
        except Exception as e:
            logger.error(f"Bit payment error: {e}")
            raise Exception(f"Bit payment failed: {str(e)}")
    
    def _calculate_next_billing_date(self, billing_cycle: str) -> str:
        """Calculate next billing date based on cycle"""
        if billing_cycle == "monthly":
            next_date = datetime.now() + timedelta(days=30)
        else:  # annual
            next_date = datetime.now() + timedelta(days=365)
        
        return next_date.isoformat()
    
    def _create_isracard_signature(self, data: Dict[str, Any]) -> str:
        """Create signature for Isracard API"""
        # Simplified signature - in production use proper HMAC
        message = json.dumps(data, sort_keys=True)
        signature = hashlib.sha256(message.encode()).hexdigest()
        return signature
    
    async def get_billing_history(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get billing history for a user
        
        Args:
            user_id: User identifier
            limit: Maximum number of records
            
        Returns:
            List of billing records
        """
        # In production, fetch from database
        # This is a mock implementation
        return [
            {
                'id': 'inv_001',
                'date': '2024-01-15',
                'amount': '49.00',
                'currency': 'USD',
                'description': 'Professional Plan - Monthly',
                'status': 'paid',
                'invoice_url': '/invoices/inv_001.pdf'
            }
        ]
    
    async def generate_invoice(
        self,
        payment_id: str,
        user_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate invoice for a payment
        
        Args:
            payment_id: Payment identifier
            user_details: User billing details
            
        Returns:
            Invoice details
        """
        invoice = {
            'invoice_id': f"INV-{payment_id[:8]}",
            'payment_id': payment_id,
            'date': datetime.now().isoformat(),
            'customer': user_details,
            'status': 'generated',
            'pdf_url': f"/invoices/{payment_id}.pdf"
        }
        
        return invoice