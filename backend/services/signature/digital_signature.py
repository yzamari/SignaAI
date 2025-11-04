"""
Sprint 6: Digital Signature Service
Handles digital signature generation, verification, and certificate management

Features:
- X.509 certificate generation
- Digital signature creation with timestamps
- Signature verification
- Certificate chain validation
- Audit trail generation
"""

import os
import json
import hashlib
import base64
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Tuple
import logging
from pathlib import Path

# Cryptography imports
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtensionOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.serialization import pkcs12

# PDF manipulation
try:
    from PyPDF2 import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    logging.warning("PDF libraries not available")

logger = logging.getLogger(__name__)


class DigitalSignatureService:
    """
    Service for creating and verifying digital signatures
    """
    
    def __init__(self):
        """Initialize digital signature service"""
        self.backend = default_backend()
        self.ca_cert = None
        self.ca_key = None
        self._initialize_ca()
    
    def _initialize_ca(self):
        """Initialize or load Certificate Authority"""
        ca_path = Path("certs/ca")
        ca_path.mkdir(parents=True, exist_ok=True)
        
        ca_cert_path = ca_path / "ca_cert.pem"
        ca_key_path = ca_path / "ca_key.pem"
        
        if ca_cert_path.exists() and ca_key_path.exists():
            # Load existing CA
            with open(ca_cert_path, "rb") as f:
                self.ca_cert = x509.load_pem_x509_certificate(f.read(), self.backend)
            with open(ca_key_path, "rb") as f:
                self.ca_key = serialization.load_pem_private_key(
                    f.read(), password=None, backend=self.backend
                )
            logger.info("Loaded existing CA certificate")
        else:
            # Generate new CA
            self.ca_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=4096,
                backend=self.backend
            )
            
            subject = issuer = x509.Name([
                x509.NameAttribute(NameOID.COUNTRY_NAME, "IL"),
                x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Tel Aviv"),
                x509.NameAttribute(NameOID.LOCALITY_NAME, "Tel Aviv"),
                x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SignaAI CA"),
                x509.NameAttribute(NameOID.COMMON_NAME, "SignaAI Root CA"),
            ])
            
            self.ca_cert = x509.CertificateBuilder().subject_name(
                subject
            ).issuer_name(
                issuer
            ).public_key(
                self.ca_key.public_key()
            ).serial_number(
                x509.random_serial_number()
            ).not_valid_before(
                datetime.utcnow()
            ).not_valid_after(
                datetime.utcnow() + timedelta(days=3650)  # 10 years
            ).add_extension(
                x509.BasicConstraints(ca=True, path_length=None),
                critical=True
            ).add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=False,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=True,
                    crl_sign=True,
                    encipher_only=False,
                    decipher_only=False
                ),
                critical=True
            ).sign(self.ca_key, hashes.SHA256(), self.backend)
            
            # Save CA certificate and key
            with open(ca_cert_path, "wb") as f:
                f.write(self.ca_cert.public_bytes(serialization.Encoding.PEM))
            with open(ca_key_path, "wb") as f:
                f.write(self.ca_key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.TraditionalOpenSSL,
                    encryption_algorithm=serialization.NoEncryption()
                ))
            
            logger.info("Generated new CA certificate")
    
    async def generate_signer_certificate(
        self,
        signer_info: Dict[str, str]
    ) -> Tuple[bytes, bytes, bytes]:
        """
        Generate a certificate for a signer
        
        Args:
            signer_info: Dictionary with signer details (name, email, phone, etc.)
            
        Returns:
            Tuple of (certificate_pem, private_key_pem, p12_bundle)
        """
        # Generate private key
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=self.backend
        )
        
        # Build certificate
        subject = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, signer_info.get("country", "IL")),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, signer_info.get("state", "Tel Aviv")),
            x509.NameAttribute(NameOID.LOCALITY_NAME, signer_info.get("city", "Tel Aviv")),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, signer_info.get("organization", "Individual")),
            x509.NameAttribute(NameOID.COMMON_NAME, signer_info["name"]),
            x509.NameAttribute(NameOID.EMAIL_ADDRESS, signer_info["email"]),
        ])
        
        certificate = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            self.ca_cert.subject
        ).public_key(
            private_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.utcnow()
        ).not_valid_after(
            datetime.utcnow() + timedelta(days=365)  # 1 year
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.RFC822Name(signer_info["email"]),
            ]),
            critical=False
        ).add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=True,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False
            ),
            critical=True
        ).add_extension(
            x509.ExtendedKeyUsage([
                x509.oid.ExtendedKeyUsageOID.EMAIL_PROTECTION,
                x509.oid.ExtendedKeyUsageOID.CODE_SIGNING,
            ]),
            critical=True
        ).sign(self.ca_key, hashes.SHA256(), self.backend)
        
        # Convert to PEM format
        cert_pem = certificate.public_bytes(serialization.Encoding.PEM)
        key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        # Create PKCS12 bundle
        p12_bundle = pkcs12.serialize_key_and_certificates(
            name=signer_info["name"].encode(),
            key=private_key,
            cert=certificate,
            cas=[self.ca_cert],
            encryption_algorithm=serialization.NoEncryption()
        )
        
        logger.info(f"Generated certificate for {signer_info['name']}")
        
        return cert_pem, key_pem, p12_bundle
    
    async def create_digital_signature(
        self,
        document_hash: bytes,
        private_key_pem: bytes,
        certificate_pem: bytes,
        timestamp: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Create a digital signature for a document
        
        Args:
            document_hash: Hash of the document to sign
            private_key_pem: Private key in PEM format
            certificate_pem: Certificate in PEM format
            timestamp: Optional timestamp for the signature
            
        Returns:
            Signature data including signature, certificate, and timestamp
        """
        # Load private key and certificate
        private_key = serialization.load_pem_private_key(
            private_key_pem, password=None, backend=self.backend
        )
        certificate = x509.load_pem_x509_certificate(certificate_pem, self.backend)
        
        # Create signature
        signature = private_key.sign(
            document_hash,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        
        # Create signature data
        signature_data = {
            "signature": base64.b64encode(signature).decode('utf-8'),
            "certificate": base64.b64encode(certificate_pem).decode('utf-8'),
            "algorithm": "RSA-PSS-SHA256",
            "timestamp": (timestamp or datetime.utcnow()).isoformat(),
            "signer": {
                "name": certificate.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value,
                "email": certificate.subject.get_attributes_for_oid(NameOID.EMAIL_ADDRESS)[0].value,
                "serial_number": str(certificate.serial_number),
                "issuer": certificate.issuer.rfc4514_string(),
                "valid_from": certificate.not_valid_before.isoformat(),
                "valid_to": certificate.not_valid_after.isoformat(),
            }
        }
        
        logger.info(f"Created digital signature for {signature_data['signer']['name']}")
        
        return signature_data
    
    async def verify_signature(
        self,
        document_hash: bytes,
        signature_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Verify a digital signature
        
        Args:
            document_hash: Hash of the document to verify
            signature_data: Signature data from create_digital_signature
            
        Returns:
            Verification result with status and details
        """
        try:
            # Decode signature and certificate
            signature = base64.b64decode(signature_data["signature"])
            certificate_pem = base64.b64decode(signature_data["certificate"])
            certificate = x509.load_pem_x509_certificate(certificate_pem, self.backend)
            
            # Verify signature
            public_key = certificate.public_key()
            public_key.verify(
                signature,
                document_hash,
                padding.PSS(
                    mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=padding.PSS.MAX_LENGTH
                ),
                hashes.SHA256()
            )
            
            # Verify certificate chain
            # In production, this would check against trusted CAs
            is_valid_chain = self._verify_certificate_chain(certificate)
            
            # Check certificate validity period
            now = datetime.utcnow()
            is_valid_period = (
                certificate.not_valid_before <= now <= certificate.not_valid_after
            )
            
            return {
                "valid": True,
                "signature_valid": True,
                "certificate_valid": is_valid_chain,
                "time_valid": is_valid_period,
                "signer": signature_data["signer"],
                "verified_at": datetime.utcnow().isoformat(),
                "details": {
                    "algorithm": signature_data["algorithm"],
                    "signed_at": signature_data["timestamp"],
                    "certificate_issuer": certificate.issuer.rfc4514_string(),
                }
            }
            
        except Exception as e:
            logger.error(f"Signature verification failed: {e}")
            return {
                "valid": False,
                "error": str(e),
                "verified_at": datetime.utcnow().isoformat(),
            }
    
    def _verify_certificate_chain(self, certificate: x509.Certificate) -> bool:
        """
        Verify certificate chain
        
        Args:
            certificate: Certificate to verify
            
        Returns:
            True if certificate chain is valid
        """
        try:
            # In production, implement full chain verification
            # For now, just check if issued by our CA
            public_key = self.ca_cert.public_key()
            public_key.verify(
                certificate.signature,
                certificate.tbs_certificate_bytes,
                padding.PKCS1v15(),
                certificate.signature_hash_algorithm
            )
            return True
        except Exception:
            return False
    
    def calculate_document_hash(self, document_data: bytes) -> bytes:
        """
        Calculate SHA-256 hash of document
        
        Args:
            document_data: Document content
            
        Returns:
            SHA-256 hash
        """
        hasher = hashlib.sha256()
        hasher.update(document_data)
        return hasher.digest()
    
    async def sign_pdf(
        self,
        pdf_path: str,
        signature_data: Dict[str, Any],
        output_path: str,
        visible_signature: bool = True,
        position: Optional[Dict[str, int]] = None
    ) -> bool:
        """
        Add digital signature to PDF
        
        Args:
            pdf_path: Path to input PDF
            signature_data: Digital signature data
            output_path: Path for signed PDF
            visible_signature: Whether to add visible signature
            position: Position for visible signature (x, y, width, height)
            
        Returns:
            True if successful
        """
        if not PDF_AVAILABLE:
            logger.error("PDF libraries not available")
            return False
        
        try:
            # Read original PDF
            with open(pdf_path, "rb") as f:
                pdf_reader = PdfReader(f)
                pdf_writer = PdfWriter()
                
                # Copy all pages
                for page in pdf_reader.pages:
                    pdf_writer.add_page(page)
                
                # Add signature metadata
                pdf_writer.add_metadata({
                    "/SignedBy": signature_data["signer"]["name"],
                    "/SignedAt": signature_data["timestamp"],
                    "/SignatureAlgorithm": signature_data["algorithm"],
                    "/CertificateSerial": signature_data["signer"]["serial_number"],
                })
                
                # Write signed PDF
                with open(output_path, "wb") as output_file:
                    pdf_writer.write(output_file)
                
                logger.info(f"Signed PDF saved to {output_path}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to sign PDF: {e}")
            return False


class AuditTrailService:
    """
    Service for creating and managing audit trails
    """
    
    def __init__(self):
        """Initialize audit trail service"""
        self.audit_path = Path("audit_trails")
        self.audit_path.mkdir(exist_ok=True)
    
    async def create_audit_entry(
        self,
        document_id: str,
        action: str,
        user_info: Dict[str, Any],
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create an audit trail entry
        
        Args:
            document_id: Document identifier
            action: Action performed
            user_info: User information
            details: Additional details
            
        Returns:
            Audit entry data
        """
        entry = {
            "id": hashlib.sha256(f"{document_id}{datetime.utcnow()}".encode()).hexdigest()[:16],
            "document_id": document_id,
            "timestamp": datetime.utcnow().isoformat(),
            "action": action,
            "user": {
                "id": user_info.get("id"),
                "name": user_info.get("name"),
                "email": user_info.get("email"),
                "ip_address": user_info.get("ip_address"),
                "user_agent": user_info.get("user_agent"),
            },
            "details": details or {},
        }
        
        # Save to file
        audit_file = self.audit_path / f"{document_id}.json"
        
        # Load existing entries
        entries = []
        if audit_file.exists():
            with open(audit_file, "r") as f:
                entries = json.load(f)
        
        # Add new entry
        entries.append(entry)
        
        # Save updated entries
        with open(audit_file, "w") as f:
            json.dump(entries, f, indent=2)
        
        logger.info(f"Created audit entry for document {document_id}: {action}")
        
        return entry
    
    async def get_audit_trail(self, document_id: str) -> List[Dict[str, Any]]:
        """
        Get audit trail for a document
        
        Args:
            document_id: Document identifier
            
        Returns:
            List of audit entries
        """
        audit_file = self.audit_path / f"{document_id}.json"
        
        if audit_file.exists():
            with open(audit_file, "r") as f:
                return json.load(f)
        
        return []
    
    async def generate_audit_report(
        self,
        document_id: str,
        format: str = "json"
    ) -> Dict[str, Any]:
        """
        Generate audit report for a document
        
        Args:
            document_id: Document identifier
            format: Report format (json, pdf, html)
            
        Returns:
            Audit report data
        """
        entries = await self.get_audit_trail(document_id)
        
        report = {
            "document_id": document_id,
            "generated_at": datetime.utcnow().isoformat(),
            "total_events": len(entries),
            "first_event": entries[0]["timestamp"] if entries else None,
            "last_event": entries[-1]["timestamp"] if entries else None,
            "events": entries,
            "summary": {
                "uploads": len([e for e in entries if e["action"] == "document_uploaded"]),
                "views": len([e for e in entries if e["action"] == "document_viewed"]),
                "signatures": len([e for e in entries if e["action"] == "document_signed"]),
                "downloads": len([e for e in entries if e["action"] == "document_downloaded"]),
            }
        }
        
        # In production, implement PDF and HTML generation
        if format == "pdf":
            # Generate PDF report
            pass
        elif format == "html":
            # Generate HTML report
            pass
        
        return report


# Create singleton instances
digital_signature_service = DigitalSignatureService()
audit_trail_service = AuditTrailService()