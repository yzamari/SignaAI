"""
Sprint 6: Analytics Service
Real-time analytics and reporting for document signatures

Features:
- Document metrics tracking
- Signature analytics
- User activity monitoring
- Performance metrics
- Custom report generation
"""

import os
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
import logging
from pathlib import Path

import pandas as pd
import numpy as np
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class AnalyticsService:
    """
    Service for tracking and analyzing signature metrics
    """
    
    def __init__(self, db_session: Optional[AsyncSession] = None):
        """Initialize analytics service"""
        self.db = db_session
        self.metrics_cache = {}
        self.cache_ttl = 300  # 5 minutes
    
    async def get_document_statistics(
        self,
        user_id: Optional[str] = None,
        time_range: str = "30d"
    ) -> Dict[str, Any]:
        """
        Get document statistics
        
        Args:
            user_id: Optional user ID to filter by
            time_range: Time range (7d, 30d, 90d, 1y)
            
        Returns:
            Document statistics
        """
        # Calculate date range
        end_date = datetime.utcnow()
        if time_range == "7d":
            start_date = end_date - timedelta(days=7)
        elif time_range == "30d":
            start_date = end_date - timedelta(days=30)
        elif time_range == "90d":
            start_date = end_date - timedelta(days=90)
        elif time_range == "1y":
            start_date = end_date - timedelta(days=365)
        else:
            start_date = end_date - timedelta(days=30)
        
        # Mock data for demonstration
        # In production, query from database
        stats = {
            "total": 156,
            "pending": 23,
            "completed": 128,
            "expired": 5,
            "created_in_period": 45,
            "completion_rate": 82.05,
            "average_completion_time": 4.5,  # hours
            "by_status": {
                "draft": 8,
                "sent": 15,
                "viewed": 12,
                "signed": 128,
                "expired": 5,
            },
            "by_type": {
                "contract": 67,
                "agreement": 45,
                "nda": 23,
                "invoice": 12,
                "other": 9,
            },
            "trend": self._calculate_trend(start_date, end_date),
        }
        
        return stats
    
    async def get_signature_metrics(
        self,
        user_id: Optional[str] = None,
        time_range: str = "30d"
    ) -> Dict[str, Any]:
        """
        Get signature metrics
        
        Args:
            user_id: Optional user ID to filter by
            time_range: Time range
            
        Returns:
            Signature metrics
        """
        # Mock data for demonstration
        metrics = {
            "total_signatures": 342,
            "unique_signers": 89,
            "average_time_to_sign": 4.5,  # hours
            "success_rate": 94.3,
            "declined_rate": 2.1,
            "expired_rate": 3.6,
            "device_breakdown": {
                "mobile": 45,
                "desktop": 40,
                "tablet": 15,
            },
            "browser_breakdown": {
                "chrome": 52,
                "safari": 28,
                "firefox": 12,
                "edge": 8,
            },
            "signature_methods": {
                "draw": 68,
                "type": 22,
                "upload": 10,
            },
            "geographic_distribution": {
                "IL": 45,
                "US": 25,
                "UK": 15,
                "other": 15,
            },
        }
        
        return metrics
    
    async def get_user_activity(
        self,
        time_range: str = "30d",
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get top user activity
        
        Args:
            time_range: Time range
            limit: Number of users to return
            
        Returns:
            List of user activities
        """
        # Mock data for demonstration
        activities = [
            {
                "user_id": "1",
                "name": "John Doe",
                "email": "john@example.com",
                "documents_created": 45,
                "documents_signed": 38,
                "documents_sent": 52,
                "last_active": datetime.utcnow() - timedelta(hours=2),
                "activity_score": 95,
            },
            {
                "user_id": "2",
                "name": "Jane Smith",
                "email": "jane@example.com",
                "documents_created": 32,
                "documents_signed": 29,
                "documents_sent": 41,
                "last_active": datetime.utcnow() - timedelta(hours=5),
                "activity_score": 78,
            },
            {
                "user_id": "3",
                "name": "David Cohen",
                "email": "david@example.com",
                "documents_created": 28,
                "documents_signed": 25,
                "documents_sent": 33,
                "last_active": datetime.utcnow() - timedelta(days=1),
                "activity_score": 65,
            },
        ]
        
        return activities[:limit]
    
    async def get_performance_metrics(self) -> Dict[str, Any]:
        """
        Get system performance metrics
        
        Returns:
            Performance metrics
        """
        metrics = {
            "api_response_time": {
                "average": 145,  # ms
                "p50": 120,
                "p95": 280,
                "p99": 450,
            },
            "document_processing_time": {
                "average": 2.3,  # seconds
                "min": 0.8,
                "max": 5.6,
            },
            "ai_detection_accuracy": {
                "signature_fields": 95.2,
                "date_fields": 92.8,
                "text_fields": 89.4,
            },
            "storage_usage": {
                "documents": 1245,  # MB
                "signatures": 234,
                "audit_logs": 567,
                "total": 2046,
            },
            "uptime": 99.95,  # percentage
            "error_rate": 0.12,  # percentage
        }
        
        return metrics
    
    async def get_conversion_funnel(
        self,
        time_range: str = "30d"
    ) -> Dict[str, Any]:
        """
        Get conversion funnel metrics
        
        Args:
            time_range: Time range
            
        Returns:
            Conversion funnel data
        """
        funnel = {
            "stages": [
                {
                    "name": "Document Created",
                    "count": 1000,
                    "percentage": 100,
                },
                {
                    "name": "Document Sent",
                    "count": 850,
                    "percentage": 85,
                },
                {
                    "name": "Document Viewed",
                    "count": 720,
                    "percentage": 72,
                },
                {
                    "name": "Signature Started",
                    "count": 650,
                    "percentage": 65,
                },
                {
                    "name": "Signature Completed",
                    "count": 600,
                    "percentage": 60,
                },
            ],
            "drop_off_reasons": {
                "expired": 15,
                "declined": 5,
                "technical_issues": 3,
                "abandoned": 17,
            },
        }
        
        return funnel
    
    async def generate_custom_report(
        self,
        report_type: str,
        filters: Dict[str, Any],
        format: str = "json"
    ) -> Dict[str, Any]:
        """
        Generate custom analytics report
        
        Args:
            report_type: Type of report
            filters: Report filters
            format: Output format (json, csv, pdf)
            
        Returns:
            Report data
        """
        # Gather data based on report type
        if report_type == "executive_summary":
            data = await self._generate_executive_summary(filters)
        elif report_type == "user_activity":
            data = await self._generate_user_activity_report(filters)
        elif report_type == "compliance":
            data = await self._generate_compliance_report(filters)
        else:
            data = await self._generate_standard_report(filters)
        
        # Format output
        if format == "csv":
            return self._export_to_csv(data)
        elif format == "pdf":
            return self._export_to_pdf(data)
        else:
            return data
    
    def _calculate_trend(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Calculate trend data
        
        Args:
            start_date: Start date
            end_date: End date
            
        Returns:
            Trend data points
        """
        # Generate mock trend data
        days = (end_date - start_date).days
        trend = []
        
        for i in range(min(days, 30)):
            date = end_date - timedelta(days=i)
            trend.append({
                "date": date.isoformat(),
                "documents": np.random.randint(3, 15),
                "signatures": np.random.randint(5, 25),
            })
        
        return list(reversed(trend))
    
    async def _generate_executive_summary(
        self,
        filters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate executive summary report"""
        return {
            "report_type": "executive_summary",
            "generated_at": datetime.utcnow().isoformat(),
            "period": filters.get("time_range", "30d"),
            "highlights": {
                "total_documents": 1245,
                "total_signatures": 3456,
                "active_users": 234,
                "completion_rate": 82.5,
            },
            "recommendations": [
                "Improve mobile experience to increase completion rate",
                "Add bulk sending feature for high-volume users",
                "Implement reminder system for pending signatures",
            ],
        }
    
    async def _generate_user_activity_report(
        self,
        filters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate user activity report"""
        users = await self.get_user_activity(
            time_range=filters.get("time_range", "30d"),
            limit=filters.get("limit", 50)
        )
        
        return {
            "report_type": "user_activity",
            "generated_at": datetime.utcnow().isoformat(),
            "period": filters.get("time_range", "30d"),
            "total_users": len(users),
            "active_users": len([u for u in users if u["activity_score"] > 50]),
            "users": users,
        }
    
    async def _generate_compliance_report(
        self,
        filters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate compliance report"""
        return {
            "report_type": "compliance",
            "generated_at": datetime.utcnow().isoformat(),
            "period": filters.get("time_range", "30d"),
            "compliance_metrics": {
                "identity_verified": 98.5,
                "audit_trail_complete": 100,
                "encryption_enabled": 100,
                "gdpr_compliant": True,
                "esign_compliant": True,
            },
            "issues": [],
            "recommendations": [],
        }
    
    async def _generate_standard_report(
        self,
        filters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate standard report"""
        return {
            "report_type": "standard",
            "generated_at": datetime.utcnow().isoformat(),
            "documents": await self.get_document_statistics(
                time_range=filters.get("time_range", "30d")
            ),
            "signatures": await self.get_signature_metrics(
                time_range=filters.get("time_range", "30d")
            ),
            "performance": await self.get_performance_metrics(),
        }
    
    def _export_to_csv(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Export data to CSV format"""
        # Flatten nested data for CSV
        flat_data = self._flatten_dict(data)
        
        # Create CSV content
        csv_content = pd.DataFrame([flat_data]).to_csv(index=False)
        
        return {
            "format": "csv",
            "content": csv_content,
            "filename": f"report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv",
        }
    
    def _export_to_pdf(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Export data to PDF format"""
        # In production, use reportlab or similar to generate PDF
        return {
            "format": "pdf",
            "content": "PDF generation not implemented",
            "filename": f"report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf",
        }
    
    def _flatten_dict(
        self,
        d: Dict[str, Any],
        parent_key: str = "",
        sep: str = "_"
    ) -> Dict[str, Any]:
        """Flatten nested dictionary"""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep=sep).items())
            else:
                items.append((new_key, v))
        return dict(items)


class RealTimeAnalytics:
    """
    Real-time analytics using WebSocket
    """
    
    def __init__(self):
        """Initialize real-time analytics"""
        self.active_sessions = {}
        self.metrics_buffer = defaultdict(list)
        self.flush_interval = 60  # seconds
    
    async def track_event(
        self,
        event_type: str,
        user_id: str,
        data: Dict[str, Any]
    ):
        """
        Track real-time event
        
        Args:
            event_type: Type of event
            user_id: User ID
            data: Event data
        """
        event = {
            "type": event_type,
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data,
        }
        
        # Add to buffer
        self.metrics_buffer[event_type].append(event)
        
        # Broadcast to active sessions if needed
        if event_type in ["document_signed", "document_completed"]:
            await self._broadcast_event(event)
    
    async def get_real_time_stats(self) -> Dict[str, Any]:
        """
        Get current real-time statistics
        
        Returns:
            Real-time stats
        """
        now = datetime.utcnow()
        last_hour = now - timedelta(hours=1)
        
        # Count recent events
        recent_events = {
            event_type: [
                e for e in events 
                if datetime.fromisoformat(e["timestamp"]) > last_hour
            ]
            for event_type, events in self.metrics_buffer.items()
        }
        
        return {
            "active_users": len(self.active_sessions),
            "events_last_hour": sum(len(events) for events in recent_events.values()),
            "documents_signing": len(recent_events.get("signature_started", [])),
            "documents_completed": len(recent_events.get("document_completed", [])),
            "timestamp": now.isoformat(),
        }
    
    async def _broadcast_event(self, event: Dict[str, Any]):
        """Broadcast event to active sessions"""
        # In production, use WebSocket to broadcast
        logger.info(f"Broadcasting event: {event['type']}")


# Create singleton instances
analytics_service = AnalyticsService()
realtime_analytics = RealTimeAnalytics()