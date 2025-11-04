"""
API v1 module initialization
"""

# Import all routers to make them available at package level
from . import auth
from . import documents
from . import health
from . import users
from . import workflows
from . import sessions

__all__ = [
    "auth",
    "documents", 
    "health",
    "users",
    "workflows",
    "sessions"
]