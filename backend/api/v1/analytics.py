"""
Analytics API Endpoints
Provides RESTful API for analytics and reporting
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import Optional, Dict
import logging
from datetime import datetime

from services.analytics_service import AnalyticsServiceFactory, TimeRange
from api.v1.auth import get_current_user

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])

# Create analytics service instance
analytics_service = AnalyticsServiceFactory.create()


@router.get("/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """
    Get core dashboard statistics
    """
    try:
        stats = await analytics_service.get_dashboard_stats(user_id=current_user.id)
        return {
            "total": stats.get("total_documents", 0),
            "sent": stats.get("sent_documents", 0),
            "completed": stats.get("completed_documents", 0),
            "pending": stats.get("pending_documents", 0),
            "thisWeek": stats.get("this_week_documents", 0),
            "completionRate": stats.get("completion_rate", 0),
            "activeSigners": stats.get("active_signers", 0),
        }
    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve dashboard stats")


@router.get("/dashboard")
async def get_dashboard_analytics(
    time_range: str = Query("30d", description="Time range (7d, 30d, 90d, 1y)"),
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Get dashboard analytics data
    
    Returns comprehensive analytics including:
    - Document statistics
    - Signature metrics
    - Top users
    - Workflow metrics
    - Compliance metrics
    """
    try:
        # Validate time range
        if time_range not in ["7d", "30d", "90d", "1y"]:
            raise HTTPException(status_code=400, detail="Invalid time range")
        
        # Get analytics data
        data = await analytics_service.get_dashboard_data(time_range, user_id)
        
        return {
            "success": True,
            "data": data,
            "message": "Analytics data retrieved successfully"
        }
        
    except ValueError as e:
        logger.error(f"Invalid parameter: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting dashboard analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve analytics")


@router.get("/documents")
async def get_document_analytics(
    time_range: str = Query("30d"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """Get document-specific analytics"""
    try:
        range_enum = TimeRange(time_range)
        provider = analytics_service.provider
        
        stats = await provider.get_document_stats(range_enum)
        time_series = await provider.get_time_series_data("documents", range_enum)
        
        return {
            "success": True,
            "data": {
                "stats": stats.to_dict(),
                "timeSeries": time_series,
                "timeRange": time_range
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting document analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve document analytics")


@router.get("/signatures")
async def get_signature_analytics(
    time_range: str = Query("30d"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """Get signature-specific analytics"""
    try:
        range_enum = TimeRange(time_range)
        provider = analytics_service.provider
        
        stats = await provider.get_signature_stats(range_enum)
        time_series = await provider.get_time_series_data("signatures", range_enum)
        
        return {
            "success": True,
            "data": {
                "stats": stats.to_dict(),
                "timeSeries": time_series,
                "timeRange": time_range
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting signature analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve signature analytics")


@router.get("/users")
async def get_user_analytics(
    time_range: str = Query("30d"),
    limit: int = Query(10, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """Get user activity analytics"""
    try:
        range_enum = TimeRange(time_range)
        provider = analytics_service.provider
        
        top_users = await provider.get_top_users(range_enum, limit)
        
        return {
            "success": True,
            "data": {
                "users": [user.to_dict() for user in top_users],
                "timeRange": time_range,
                "count": len(top_users)
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting user analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user analytics")


@router.get("/workflows")
async def get_workflow_analytics(
    time_range: str = Query("30d"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """Get workflow analytics"""
    try:
        range_enum = TimeRange(time_range)
        provider = analytics_service.provider
        
        metrics = await provider.get_workflow_metrics(range_enum)
        
        return {
            "success": True,
            "data": {
                "metrics": metrics.to_dict(),
                "timeRange": time_range
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting workflow analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve workflow analytics")


@router.get("/compliance")
async def get_compliance_analytics(
    time_range: str = Query("30d"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """Get compliance and security analytics"""
    try:
        range_enum = TimeRange(time_range)
        provider = analytics_service.provider
        
        metrics = await provider.get_compliance_metrics(range_enum)
        
        return {
            "success": True,
            "data": {
                "metrics": metrics.to_dict(),
                "timeRange": time_range
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting compliance analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve compliance analytics")


@router.get("/chart/{metric}")
async def get_chart_data(
    metric: str,
    time_range: str = Query("30d"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """Get time series data for specific metric"""
    try:
        # Validate metric
        valid_metrics = ["documents", "signatures", "users", "verifications", "completions"]
        if metric not in valid_metrics:
            raise HTTPException(status_code=400, detail=f"Invalid metric. Must be one of: {valid_metrics}")
        
        data = await analytics_service.get_chart_data(metric, time_range)
        
        return {
            "success": True,
            "data": data
        }
        
    except Exception as e:
        logger.error(f"Error getting chart data: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve chart data")


@router.get("/export")
async def export_analytics(
    format: str = Query("csv", description="Export format (csv, pdf, json)"),
    time_range: str = Query("30d"),
    current_user: dict = Depends(get_current_user)
):
    """Export analytics data in specified format"""
    try:
        # Validate format
        if format not in ["csv", "pdf", "json"]:
            raise HTTPException(status_code=400, detail="Invalid export format")
        
        # Generate export
        export_data = await analytics_service.export_analytics(format, time_range)
        
        # Set appropriate content type
        content_types = {
            "csv": "text/csv",
            "pdf": "application/pdf",
            "json": "application/json"
        }
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"analytics_{time_range}_{timestamp}.{format}"
        
        return Response(
            content=export_data,
            media_type=content_types[format],
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        logger.error(f"Error exporting analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to export analytics")


@router.get("/summary")
async def get_analytics_summary(
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """Get quick analytics summary"""
    try:
        # Get data for different time ranges
        week_data = await analytics_service.get_dashboard_data("7d")
        month_data = await analytics_service.get_dashboard_data("30d")
        
        # Calculate growth rates
        week_docs = week_data["documentStats"]["completed"]
        month_docs = month_data["documentStats"]["completed"]
        
        return {
            "success": True,
            "data": {
                "thisWeek": {
                    "documents": week_docs,
                    "signatures": week_data["signatureStats"]["totalSignatures"]
                },
                "thisMonth": {
                    "documents": month_docs,
                    "signatures": month_data["signatureStats"]["totalSignatures"]
                },
                "successRate": month_data["signatureStats"]["successRate"],
                "topUser": month_data["topUsers"][0] if month_data["topUsers"] else None,
                "timestamp": datetime.now().isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting analytics summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve analytics summary")


@router.post("/track")
async def track_event(
    event_type: str,
    event_data: Dict,
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """Track analytics event"""
    try:
        # Log event for analytics
        logger.info(f"Analytics event: {event_type} by user {current_user['sub']}")
        
        # In production, this would write to analytics database
        # For now, just acknowledge
        
        return {
            "success": True,
            "message": "Event tracked successfully",
            "eventId": datetime.now().timestamp()
        }
        
    except Exception as e:
        logger.error(f"Error tracking event: {e}")
        raise HTTPException(status_code=500, detail="Failed to track event")