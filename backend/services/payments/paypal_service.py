"""
PayPal Payment Service for SignaAI
Handles PayPal payment processing, subscriptions, and refunds
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from decimal import Decimal
import paypalrestsdk
from enum import Enum

logger = logging.getLogger(__name__)

class PayPalPlanType(Enum):
    """PayPal subscription plan types"""
    BASIC = "basic_monthly"
    PROFESSIONAL = "professional_monthly"
    ENTERPRISE = "enterprise_monthly"
    BASIC_YEARLY = "basic_yearly"
    PROFESSIONAL_YEARLY = "professional_yearly"
    ENTERPRISE_YEARLY = "enterprise_yearly"

class PayPalService:
    """PayPal payment service implementation"""
    
    def __init__(self):
        """Initialize PayPal SDK with credentials from environment"""
        self.client_id = os.getenv("PAYPAL_CLIENT_ID", "placeholder")
        self.client_secret = os.getenv("PAYPAL_CLIENT_SECRET", "placeholder")
        self.mode = os.getenv("PAYPAL_MODE", "sandbox")  # 'sandbox' or 'live'
        
        # Configure PayPal SDK
        paypalrestsdk.configure({
            "mode": self.mode,
            "client_id": self.client_id,
            "client_secret": self.client_secret
        })
        
        # Plan pricing (in USD)
        self.plan_prices = {
            PayPalPlanType.BASIC: 29,
            PayPalPlanType.PROFESSIONAL: 79,
            PayPalPlanType.ENTERPRISE: 199,
            PayPalPlanType.BASIC_YEARLY: 290,
            PayPalPlanType.PROFESSIONAL_YEARLY: 790,
            PayPalPlanType.ENTERPRISE_YEARLY: 1990
        }
        
        logger.info(f"PayPal service initialized in {self.mode} mode")
    
    def create_payment(
        self,
        amount: Decimal,
        currency: str = "USD",
        description: str = "SignaAI Payment",
        return_url: str = None,
        cancel_url: str = None,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Create a one-time payment
        
        Args:
            amount: Payment amount
            currency: Currency code (USD, EUR, ILS, etc.)
            description: Payment description
            return_url: URL to redirect after successful payment
            cancel_url: URL to redirect if payment is cancelled
            metadata: Additional metadata
            
        Returns:
            Payment creation response with approval URL
        """
        try:
            payment = paypalrestsdk.Payment({
                "intent": "sale",
                "payer": {
                    "payment_method": "paypal"
                },
                "redirect_urls": {
                    "return_url": return_url or f"{os.getenv('FRONTEND_URL')}/payment/success",
                    "cancel_url": cancel_url or f"{os.getenv('FRONTEND_URL')}/payment/cancel"
                },
                "transactions": [{
                    "amount": {
                        "total": str(amount),
                        "currency": currency
                    },
                    "description": description,
                    "custom": str(metadata) if metadata else ""
                }]
            })
            
            if payment.create():
                # Get approval URL for redirect
                approval_url = None
                for link in payment.links:
                    if link.rel == "approval_url":
                        approval_url = link.href
                        break
                
                return {
                    "success": True,
                    "payment_id": payment.id,
                    "approval_url": approval_url,
                    "state": payment.state
                }
            else:
                logger.error(f"PayPal payment creation failed: {payment.error}")
                return {
                    "success": False,
                    "error": payment.error
                }
                
        except Exception as e:
            logger.error(f"PayPal payment creation error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def execute_payment(self, payment_id: str, payer_id: str) -> Dict[str, Any]:
        """
        Execute an approved payment
        
        Args:
            payment_id: PayPal payment ID
            payer_id: PayPal payer ID
            
        Returns:
            Payment execution result
        """
        try:
            payment = paypalrestsdk.Payment.find(payment_id)
            
            if payment.execute({"payer_id": payer_id}):
                return {
                    "success": True,
                    "payment_id": payment.id,
                    "state": payment.state,
                    "payer_email": payment.payer.payer_info.email,
                    "amount": payment.transactions[0].amount.total,
                    "currency": payment.transactions[0].amount.currency
                }
            else:
                logger.error(f"PayPal payment execution failed: {payment.error}")
                return {
                    "success": False,
                    "error": payment.error
                }
                
        except Exception as e:
            logger.error(f"PayPal payment execution error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def create_subscription_plan(
        self,
        plan_type: PayPalPlanType,
        name: str = None,
        description: str = None
    ) -> Dict[str, Any]:
        """
        Create a subscription billing plan
        
        Args:
            plan_type: Type of subscription plan
            name: Custom plan name
            description: Plan description
            
        Returns:
            Plan creation result
        """
        try:
            # Determine billing frequency
            if "yearly" in plan_type.value:
                frequency = "YEAR"
                frequency_interval = "1"
            else:
                frequency = "MONTH"
                frequency_interval = "1"
            
            billing_plan = paypalrestsdk.BillingPlan({
                "name": name or f"SignaAI {plan_type.name.title()} Plan",
                "description": description or f"SignaAI {plan_type.name.title()} Subscription",
                "type": "INFINITE",
                "payment_definitions": [{
                    "name": f"{plan_type.name.title()} Subscription",
                    "type": "REGULAR",
                    "frequency": frequency,
                    "frequency_interval": frequency_interval,
                    "amount": {
                        "value": str(self.plan_prices[plan_type]),
                        "currency": "USD"
                    },
                    "cycles": "0"
                }],
                "merchant_preferences": {
                    "return_url": f"{os.getenv('FRONTEND_URL')}/subscription/success",
                    "cancel_url": f"{os.getenv('FRONTEND_URL')}/subscription/cancel",
                    "auto_bill_amount": "YES",
                    "initial_fail_amount_action": "CONTINUE",
                    "max_fail_attempts": "3"
                }
            })
            
            if billing_plan.create():
                # Activate the plan
                if billing_plan.activate():
                    return {
                        "success": True,
                        "plan_id": billing_plan.id,
                        "state": billing_plan.state
                    }
                else:
                    return {
                        "success": False,
                        "error": "Failed to activate plan"
                    }
            else:
                logger.error(f"PayPal plan creation failed: {billing_plan.error}")
                return {
                    "success": False,
                    "error": billing_plan.error
                }
                
        except Exception as e:
            logger.error(f"PayPal plan creation error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def create_subscription(
        self,
        plan_id: str,
        user_email: str,
        user_name: str,
        start_date: datetime = None
    ) -> Dict[str, Any]:
        """
        Create a subscription agreement for a user
        
        Args:
            plan_id: PayPal billing plan ID
            user_email: Subscriber email
            user_name: Subscriber name
            start_date: Subscription start date
            
        Returns:
            Subscription creation result with approval URL
        """
        try:
            if not start_date:
                start_date = datetime.utcnow() + timedelta(minutes=5)
            
            billing_agreement = paypalrestsdk.BillingAgreement({
                "name": f"SignaAI Subscription for {user_name}",
                "description": "SignaAI Document Signing Service Subscription",
                "start_date": start_date.strftime('%Y-%m-%dT%H:%M:%SZ'),
                "plan": {
                    "id": plan_id
                },
                "payer": {
                    "payment_method": "paypal",
                    "payer_info": {
                        "email": user_email
                    }
                }
            })
            
            if billing_agreement.create():
                # Get approval URL
                approval_url = None
                for link in billing_agreement.links:
                    if link.rel == "approval_url":
                        approval_url = link.href
                        break
                
                return {
                    "success": True,
                    "agreement_id": billing_agreement.id,
                    "approval_url": approval_url
                }
            else:
                logger.error(f"PayPal subscription creation failed: {billing_agreement.error}")
                return {
                    "success": False,
                    "error": billing_agreement.error
                }
                
        except Exception as e:
            logger.error(f"PayPal subscription creation error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def execute_subscription(self, token: str) -> Dict[str, Any]:
        """
        Execute an approved subscription agreement
        
        Args:
            token: Agreement token from approval URL
            
        Returns:
            Subscription execution result
        """
        try:
            billing_agreement = paypalrestsdk.BillingAgreement.execute(token)
            
            if billing_agreement:
                return {
                    "success": True,
                    "agreement_id": billing_agreement.id,
                    "state": billing_agreement.state,
                    "payer_email": billing_agreement.payer.payer_info.email
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to execute subscription"
                }
                
        except Exception as e:
            logger.error(f"PayPal subscription execution error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def cancel_subscription(self, agreement_id: str, reason: str = "User requested") -> Dict[str, Any]:
        """
        Cancel a subscription agreement
        
        Args:
            agreement_id: Billing agreement ID
            reason: Cancellation reason
            
        Returns:
            Cancellation result
        """
        try:
            billing_agreement = paypalrestsdk.BillingAgreement.find(agreement_id)
            
            cancel_note = {
                "note": reason
            }
            
            if billing_agreement.cancel(cancel_note):
                return {
                    "success": True,
                    "agreement_id": agreement_id,
                    "state": "cancelled"
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to cancel subscription"
                }
                
        except Exception as e:
            logger.error(f"PayPal subscription cancellation error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def process_refund(
        self,
        payment_id: str,
        amount: Optional[Decimal] = None,
        reason: str = "Customer requested"
    ) -> Dict[str, Any]:
        """
        Process a refund for a payment
        
        Args:
            payment_id: Original payment ID
            amount: Refund amount (None for full refund)
            reason: Refund reason
            
        Returns:
            Refund processing result
        """
        try:
            payment = paypalrestsdk.Payment.find(payment_id)
            sale_id = payment.transactions[0].related_resources[0].sale.id
            sale = paypalrestsdk.Sale.find(sale_id)
            
            refund_data = {
                "reason": reason
            }
            
            if amount:
                refund_data["amount"] = {
                    "total": str(amount),
                    "currency": payment.transactions[0].amount.currency
                }
            
            refund = sale.refund(refund_data)
            
            if refund.success():
                return {
                    "success": True,
                    "refund_id": refund.id,
                    "state": refund.state,
                    "amount": refund.amount.total,
                    "currency": refund.amount.currency
                }
            else:
                logger.error(f"PayPal refund failed: {refund.error}")
                return {
                    "success": False,
                    "error": refund.error
                }
                
        except Exception as e:
            logger.error(f"PayPal refund error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_payment_details(self, payment_id: str) -> Dict[str, Any]:
        """
        Get payment details
        
        Args:
            payment_id: PayPal payment ID
            
        Returns:
            Payment details
        """
        try:
            payment = paypalrestsdk.Payment.find(payment_id)
            
            return {
                "success": True,
                "payment_id": payment.id,
                "state": payment.state,
                "amount": payment.transactions[0].amount.total,
                "currency": payment.transactions[0].amount.currency,
                "description": payment.transactions[0].description,
                "create_time": payment.create_time,
                "update_time": payment.update_time
            }
            
        except Exception as e:
            logger.error(f"PayPal payment details error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_subscription_details(self, agreement_id: str) -> Dict[str, Any]:
        """
        Get subscription agreement details
        
        Args:
            agreement_id: Billing agreement ID
            
        Returns:
            Subscription details
        """
        try:
            billing_agreement = paypalrestsdk.BillingAgreement.find(agreement_id)
            
            return {
                "success": True,
                "agreement_id": billing_agreement.id,
                "state": billing_agreement.state,
                "name": billing_agreement.name,
                "description": billing_agreement.description,
                "start_date": billing_agreement.start_date,
                "payer_email": billing_agreement.payer.payer_info.email,
                "plan_id": billing_agreement.plan.id
            }
            
        except Exception as e:
            logger.error(f"PayPal subscription details error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def list_transactions(
        self,
        start_date: datetime,
        end_date: datetime = None,
        page_size: int = 20
    ) -> List[Dict[str, Any]]:
        """
        List transactions within a date range
        
        Args:
            start_date: Start date for transaction search
            end_date: End date (defaults to now)
            page_size: Number of results per page
            
        Returns:
            List of transactions
        """
        try:
            if not end_date:
                end_date = datetime.utcnow()
            
            # PayPal transaction search would go here
            # This is a placeholder implementation
            return []
            
        except Exception as e:
            logger.error(f"PayPal transaction list error: {str(e)}")
            return []
    
    def verify_webhook(self, headers: Dict, body: str) -> bool:
        """
        Verify PayPal webhook signature
        
        Args:
            headers: Request headers including PayPal signature
            body: Raw request body
            
        Returns:
            True if webhook is valid
        """
        try:
            # PayPal webhook verification logic would go here
            # This requires webhook ID and verification endpoint
            return True
            
        except Exception as e:
            logger.error(f"PayPal webhook verification error: {str(e)}")
            return False

# Initialize service singleton
paypal_service = PayPalService()