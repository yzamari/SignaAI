"""
Sprint 7: Stripe Payment Integration Service
Handles subscription management and payment processing
"""

import os
import stripe
from typing import Dict, Any, Optional, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Initialize Stripe with API key
stripe.api_key = os.getenv('STRIPE_SECRET_KEY', 'sk_test_example')


class StripePaymentService:
    """
    Service for handling Stripe payment operations
    """
    
    def __init__(self):
        """Initialize Stripe service"""
        self.plans = {
            'free': {
                'name': 'Free Plan',
                'price': 0,
                'documents': 5,
                'features': ['Basic signing', 'Email notifications']
            },
            'professional': {
                'name': 'Professional',
                'price_id': 'price_professional',
                'price': 49.99,
                'documents': 50,
                'features': ['AI field detection', 'SMS/WhatsApp', 'Analytics']
            },
            'enterprise': {
                'name': 'Enterprise',
                'price_id': 'price_enterprise',
                'price': 199.99,
                'documents': -1,  # Unlimited
                'features': ['All features', 'Custom branding', 'API access', 'Priority support']
            }
        }
    
    async def create_customer(
        self,
        email: str,
        name: str,
        phone: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create a new Stripe customer
        
        Args:
            email: Customer email
            name: Customer name
            phone: Optional phone number
            metadata: Additional metadata
            
        Returns:
            Customer ID
        """
        try:
            customer = stripe.Customer.create(
                email=email,
                name=name,
                phone=phone,
                metadata=metadata or {}
            )
            
            logger.info(f"Created Stripe customer: {customer.id}")
            return customer.id
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error creating customer: {e}")
            raise
    
    async def create_subscription(
        self,
        customer_id: str,
        price_id: str,
        payment_method_id: Optional[str] = None,
        trial_days: int = 14
    ) -> Dict[str, Any]:
        """
        Create a subscription for a customer
        
        Args:
            customer_id: Stripe customer ID
            price_id: Price ID for the subscription plan
            payment_method_id: Payment method to use
            trial_days: Number of trial days
            
        Returns:
            Subscription details
        """
        try:
            # Attach payment method if provided
            if payment_method_id:
                stripe.PaymentMethod.attach(
                    payment_method_id,
                    customer=customer_id
                )
                
                # Set as default payment method
                stripe.Customer.modify(
                    customer_id,
                    invoice_settings={
                        'default_payment_method': payment_method_id
                    }
                )
            
            # Create subscription
            subscription = stripe.Subscription.create(
                customer=customer_id,
                items=[{'price': price_id}],
                trial_period_days=trial_days,
                payment_behavior='default_incomplete',
                expand=['latest_invoice.payment_intent']
            )
            
            logger.info(f"Created subscription: {subscription.id}")
            
            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'current_period_end': subscription.current_period_end,
                'trial_end': subscription.trial_end,
                'client_secret': subscription.latest_invoice.payment_intent.client_secret if subscription.latest_invoice else None
            }
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error creating subscription: {e}")
            raise
    
    async def cancel_subscription(
        self,
        subscription_id: str,
        immediately: bool = False
    ) -> Dict[str, Any]:
        """
        Cancel a subscription
        
        Args:
            subscription_id: Subscription ID
            immediately: Cancel immediately or at period end
            
        Returns:
            Cancellation details
        """
        try:
            if immediately:
                subscription = stripe.Subscription.delete(subscription_id)
            else:
                subscription = stripe.Subscription.modify(
                    subscription_id,
                    cancel_at_period_end=True
                )
            
            logger.info(f"Cancelled subscription: {subscription_id}")
            
            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'canceled_at': subscription.canceled_at,
                'cancel_at_period_end': subscription.cancel_at_period_end
            }
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error canceling subscription: {e}")
            raise
    
    async def create_payment_intent(
        self,
        amount: int,
        currency: str = 'usd',
        customer_id: Optional[str] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a one-time payment intent
        
        Args:
            amount: Amount in cents
            currency: Currency code
            customer_id: Optional customer ID
            description: Payment description
            
        Returns:
            Payment intent details
        """
        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=amount,
                currency=currency,
                customer=customer_id,
                description=description,
                automatic_payment_methods={'enabled': True}
            )
            
            logger.info(f"Created payment intent: {payment_intent.id}")
            
            return {
                'payment_intent_id': payment_intent.id,
                'client_secret': payment_intent.client_secret,
                'amount': payment_intent.amount,
                'currency': payment_intent.currency,
                'status': payment_intent.status
            }
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error creating payment intent: {e}")
            raise
    
    async def create_checkout_session(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        mode: str = 'subscription'
    ) -> str:
        """
        Create a Stripe Checkout session
        
        Args:
            customer_id: Customer ID
            price_id: Price ID
            success_url: URL to redirect on success
            cancel_url: URL to redirect on cancel
            mode: Payment mode (subscription or payment)
            
        Returns:
            Checkout session URL
        """
        try:
            session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=['card'],
                line_items=[{
                    'price': price_id,
                    'quantity': 1
                }],
                mode=mode,
                success_url=success_url,
                cancel_url=cancel_url,
                allow_promotion_codes=True
            )
            
            logger.info(f"Created checkout session: {session.id}")
            return session.url
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error creating checkout session: {e}")
            raise
    
    async def retrieve_subscription(
        self,
        subscription_id: str
    ) -> Dict[str, Any]:
        """
        Retrieve subscription details
        
        Args:
            subscription_id: Subscription ID
            
        Returns:
            Subscription details
        """
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            
            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'current_period_start': subscription.current_period_start,
                'current_period_end': subscription.current_period_end,
                'plan': subscription.items.data[0].price.id if subscription.items.data else None,
                'cancel_at_period_end': subscription.cancel_at_period_end
            }
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error retrieving subscription: {e}")
            raise
    
    async def list_invoices(
        self,
        customer_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        List customer invoices
        
        Args:
            customer_id: Customer ID
            limit: Number of invoices to retrieve
            
        Returns:
            List of invoices
        """
        try:
            invoices = stripe.Invoice.list(
                customer=customer_id,
                limit=limit
            )
            
            return [{
                'invoice_id': invoice.id,
                'number': invoice.number,
                'amount_paid': invoice.amount_paid,
                'amount_due': invoice.amount_due,
                'currency': invoice.currency,
                'status': invoice.status,
                'created': invoice.created,
                'pdf': invoice.invoice_pdf
            } for invoice in invoices.data]
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error listing invoices: {e}")
            raise
    
    async def handle_webhook(
        self,
        payload: str,
        sig_header: str,
        webhook_secret: str
    ) -> Dict[str, Any]:
        """
        Handle Stripe webhook events
        
        Args:
            payload: Webhook payload
            sig_header: Stripe signature header
            webhook_secret: Webhook secret for verification
            
        Returns:
            Event handling result
        """
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
            
            # Handle different event types
            if event['type'] == 'payment_intent.succeeded':
                payment_intent = event['data']['object']
                logger.info(f"Payment succeeded: {payment_intent['id']}")
                # Update database, send confirmation email, etc.
                
            elif event['type'] == 'subscription.created':
                subscription = event['data']['object']
                logger.info(f"Subscription created: {subscription['id']}")
                # Activate features, update user status
                
            elif event['type'] == 'subscription.deleted':
                subscription = event['data']['object']
                logger.info(f"Subscription cancelled: {subscription['id']}")
                # Deactivate features, send cancellation email
                
            elif event['type'] == 'invoice.payment_failed':
                invoice = event['data']['object']
                logger.warning(f"Payment failed for invoice: {invoice['id']}")
                # Send payment failed notification
            
            return {
                'event_type': event['type'],
                'event_id': event['id'],
                'handled': True
            }
            
        except ValueError as e:
            logger.error(f"Invalid webhook payload: {e}")
            raise
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid webhook signature: {e}")
            raise


# Create singleton instance
stripe_service = StripePaymentService()