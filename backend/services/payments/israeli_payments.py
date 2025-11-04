"""
Sprint 7: Israeli Payment Methods Integration
Handles Isracard, Bit, and other local payment methods
"""

import os
import aiohttp
import hashlib
import hmac
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import logging
import json

logger = logging.getLogger(__name__)


class IsraeliPaymentService:
    """
    Service for handling Israeli payment methods
    """
    
    def __init__(self):
        """Initialize Israeli payment service"""
        self.isracard_api_url = os.getenv('ISRACARD_API_URL', 'https://api.isracard.co.il')
        self.isracard_merchant_id = os.getenv('ISRACARD_MERCHANT_ID')
        self.isracard_api_key = os.getenv('ISRACARD_API_KEY')
        
        self.bit_api_url = os.getenv('BIT_API_URL', 'https://api.bit.co.il')
        self.bit_merchant_id = os.getenv('BIT_MERCHANT_ID')
        self.bit_api_key = os.getenv('BIT_API_KEY')
    
    async def process_isracard_payment(
        self,
        amount: float,
        currency: str = 'ILS',
        card_number: str = None,
        card_holder: str = None,
        cvv: str = None,
        exp_month: str = None,
        exp_year: str = None,
        installments: int = 1,
        customer_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process payment via Isracard
        
        Args:
            amount: Payment amount in ILS
            currency: Currency (default ILS)
            card_number: Card number
            card_holder: Card holder name
            cvv: CVV code
            exp_month: Expiration month
            exp_year: Expiration year
            installments: Number of installments (1-36)
            customer_id: Optional customer ID
            
        Returns:
            Payment result
        """
        try:
            # Validate installments
            if installments < 1 or installments > 36:
                raise ValueError("Installments must be between 1 and 36")
            
            # Calculate signature for security
            signature = self._generate_signature({
                'merchant_id': self.isracard_merchant_id,
                'amount': amount,
                'currency': currency,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            # Prepare payment request
            payment_data = {
                'merchant_id': self.isracard_merchant_id,
                'amount': amount,
                'currency': currency,
                'card_details': {
                    'number': card_number,
                    'holder': card_holder,
                    'cvv': cvv,
                    'exp_month': exp_month,
                    'exp_year': exp_year
                },
                'installments': installments,
                'customer_id': customer_id,
                'signature': signature
            }
            
            # Make API request
            async with aiohttp.ClientSession() as session:
                headers = {
                    'Authorization': f'Bearer {self.isracard_api_key}',
                    'Content-Type': 'application/json'
                }
                
                async with session.post(
                    f'{self.isracard_api_url}/v1/payments',
                    json=payment_data,
                    headers=headers
                ) as response:
                    result = await response.json()
                    
                    if response.status == 200:
                        logger.info(f"Isracard payment successful: {result.get('transaction_id')}")
                        return {
                            'success': True,
                            'transaction_id': result.get('transaction_id'),
                            'authorization_number': result.get('authorization_number'),
                            'amount': amount,
                            'currency': currency,
                            'installments': installments,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                    else:
                        logger.error(f"Isracard payment failed: {result}")
                        return {
                            'success': False,
                            'error': result.get('error_message', 'Payment failed'),
                            'error_code': result.get('error_code')
                        }
                        
        except Exception as e:
            logger.error(f"Error processing Isracard payment: {e}")
            raise
    
    async def process_bit_payment(
        self,
        amount: float,
        phone_number: str,
        description: str = None,
        reference_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process payment via Bit (Israeli instant payment app)
        
        Args:
            amount: Payment amount in ILS
            phone_number: Customer phone number
            description: Payment description
            reference_id: Optional reference ID
            
        Returns:
            Payment request result
        """
        try:
            # Format phone number for Israeli format
            phone_number = self._format_israeli_phone(phone_number)
            
            # Generate payment request ID
            request_id = hashlib.sha256(
                f"{self.bit_merchant_id}{amount}{phone_number}{datetime.utcnow()}".encode()
            ).hexdigest()[:16]
            
            # Prepare Bit payment request
            payment_data = {
                'merchant_id': self.bit_merchant_id,
                'request_id': request_id,
                'amount': amount,
                'currency': 'ILS',
                'phone_number': phone_number,
                'description': description or 'SignaAI Document Signing',
                'reference_id': reference_id,
                'callback_url': f'{os.getenv("BASE_URL")}/api/v1/payments/bit/callback',
                'expiry_time': (datetime.utcnow() + timedelta(minutes=30)).isoformat()
            }
            
            # Sign the request
            signature = self._generate_bit_signature(payment_data)
            payment_data['signature'] = signature
            
            # Make API request
            async with aiohttp.ClientSession() as session:
                headers = {
                    'X-API-Key': self.bit_api_key,
                    'Content-Type': 'application/json'
                }
                
                async with session.post(
                    f'{self.bit_api_url}/v1/payment-requests',
                    json=payment_data,
                    headers=headers
                ) as response:
                    result = await response.json()
                    
                    if response.status == 200:
                        logger.info(f"Bit payment request created: {request_id}")
                        return {
                            'success': True,
                            'request_id': request_id,
                            'payment_url': result.get('payment_url'),
                            'qr_code': result.get('qr_code'),
                            'expires_at': result.get('expires_at'),
                            'status': 'pending'
                        }
                    else:
                        logger.error(f"Bit payment request failed: {result}")
                        return {
                            'success': False,
                            'error': result.get('error_message', 'Payment request failed'),
                            'error_code': result.get('error_code')
                        }
                        
        except Exception as e:
            logger.error(f"Error creating Bit payment request: {e}")
            raise
    
    async def check_bit_payment_status(
        self,
        request_id: str
    ) -> Dict[str, Any]:
        """
        Check status of Bit payment request
        
        Args:
            request_id: Payment request ID
            
        Returns:
            Payment status
        """
        try:
            async with aiohttp.ClientSession() as session:
                headers = {
                    'X-API-Key': self.bit_api_key
                }
                
                async with session.get(
                    f'{self.bit_api_url}/v1/payment-requests/{request_id}',
                    headers=headers
                ) as response:
                    result = await response.json()
                    
                    if response.status == 200:
                        return {
                            'request_id': request_id,
                            'status': result.get('status'),  # pending, completed, failed, expired
                            'amount': result.get('amount'),
                            'paid_at': result.get('paid_at'),
                            'transaction_id': result.get('transaction_id')
                        }
                    else:
                        return {
                            'request_id': request_id,
                            'status': 'unknown',
                            'error': result.get('error_message')
                        }
                        
        except Exception as e:
            logger.error(f"Error checking Bit payment status: {e}")
            raise
    
    async def refund_isracard_payment(
        self,
        transaction_id: str,
        amount: Optional[float] = None,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Refund an Isracard payment
        
        Args:
            transaction_id: Original transaction ID
            amount: Refund amount (None for full refund)
            reason: Refund reason
            
        Returns:
            Refund result
        """
        try:
            refund_data = {
                'merchant_id': self.isracard_merchant_id,
                'transaction_id': transaction_id,
                'amount': amount,
                'reason': reason or 'Customer request'
            }
            
            async with aiohttp.ClientSession() as session:
                headers = {
                    'Authorization': f'Bearer {self.isracard_api_key}',
                    'Content-Type': 'application/json'
                }
                
                async with session.post(
                    f'{self.isracard_api_url}/v1/refunds',
                    json=refund_data,
                    headers=headers
                ) as response:
                    result = await response.json()
                    
                    if response.status == 200:
                        logger.info(f"Isracard refund successful: {result.get('refund_id')}")
                        return {
                            'success': True,
                            'refund_id': result.get('refund_id'),
                            'transaction_id': transaction_id,
                            'amount': amount or result.get('amount'),
                            'status': 'refunded'
                        }
                    else:
                        logger.error(f"Isracard refund failed: {result}")
                        return {
                            'success': False,
                            'error': result.get('error_message', 'Refund failed')
                        }
                        
        except Exception as e:
            logger.error(f"Error processing Isracard refund: {e}")
            raise
    
    def _generate_signature(self, data: Dict[str, Any]) -> str:
        """
        Generate HMAC signature for API requests
        
        Args:
            data: Data to sign
            
        Returns:
            Signature string
        """
        message = json.dumps(data, sort_keys=True)
        signature = hmac.new(
            self.isracard_api_key.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature
    
    def _generate_bit_signature(self, data: Dict[str, Any]) -> str:
        """
        Generate signature for Bit API requests
        
        Args:
            data: Data to sign
            
        Returns:
            Signature string
        """
        # Bit uses a specific signature format
        sign_string = f"{data['merchant_id']}|{data['request_id']}|{data['amount']}|{data['phone_number']}"
        signature = hmac.new(
            self.bit_api_key.encode(),
            sign_string.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature
    
    def _format_israeli_phone(self, phone: str) -> str:
        """
        Format phone number to Israeli format
        
        Args:
            phone: Phone number
            
        Returns:
            Formatted phone number
        """
        # Remove all non-digits
        phone = ''.join(filter(str.isdigit, phone))
        
        # Add Israeli country code if needed
        if phone.startswith('0'):
            phone = '972' + phone[1:]
        elif not phone.startswith('972'):
            phone = '972' + phone
            
        return '+' + phone


# Create singleton instance
israeli_payment_service = IsraeliPaymentService()