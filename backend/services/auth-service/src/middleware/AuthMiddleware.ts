import { Request, Response, NextFunction } from 'express';
import { ITokenService } from '../interfaces/ITokenService';
import { UnauthorizedException, ForbiddenException } from '../../../../shared/exceptions/BaseException';
import { UserRole } from '../models/User';
import { Injectable } from '../../../../shared/core/DependencyContainer';

/**
 * Extended Request interface with user information
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    permissions: string[];
  };
}

/**
 * Authentication Middleware
 * Handles request authentication and authorization
 */
@Injectable
export class AuthMiddleware {
  constructor(private tokenService: ITokenService) {}

  /**
   * Authenticate request
   * Verifies JWT token and attaches user info to request
   */
  public authenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const token = this.extractToken(req);

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const payload = await this.tokenService.verifyAccessToken(token);

      if (!payload) {
        throw new UnauthorizedException('Invalid token');
      }

      // Attach user info to request
      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions || []
      };

      next();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        res.status(401).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(401).json({
          success: false,
          error: 'Authentication failed'
        });
      }
    }
  };

  /**
   * Authorize based on roles
   * Factory method to create role-based authorization middleware
   */
  public authorize = (allowedRoles: UserRole[]) => {
    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        if (!req.user) {
          throw new UnauthorizedException('User not authenticated');
        }

        const hasRole = allowedRoles.includes(req.user.role);

        if (!hasRole) {
          throw new ForbiddenException(
            `Access denied. Required roles: ${allowedRoles.join(', ')}`
          );
        }

        next();
      } catch (error) {
        if (error instanceof ForbiddenException) {
          res.status(403).json({
            success: false,
            error: error.message
          });
        } else if (error instanceof UnauthorizedException) {
          res.status(401).json({
            success: false,
            error: error.message
          });
        } else {
          res.status(403).json({
            success: false,
            error: 'Authorization failed'
          });
        }
      }
    };
  };

  /**
   * Authorize based on permissions
   * Factory method to create permission-based authorization middleware
   */
  public requirePermission = (requiredPermission: string) => {
    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        if (!req.user) {
          throw new UnauthorizedException('User not authenticated');
        }

        const hasPermission = 
          req.user.permissions.includes('*') ||
          req.user.permissions.includes(requiredPermission);

        if (!hasPermission) {
          throw new ForbiddenException(
            `Access denied. Required permission: ${requiredPermission}`
          );
        }

        next();
      } catch (error) {
        if (error instanceof ForbiddenException) {
          res.status(403).json({
            success: false,
            error: error.message
          });
        } else if (error instanceof UnauthorizedException) {
          res.status(401).json({
            success: false,
            error: error.message
          });
        } else {
          res.status(403).json({
            success: false,
            error: 'Authorization failed'
          });
        }
      }
    };
  };

  /**
   * Optional authentication
   * Attempts to authenticate but doesn't fail if no token
   */
  public optionalAuthenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const token = this.extractToken(req);

      if (token) {
        const payload = await this.tokenService.verifyAccessToken(token);

        if (payload) {
          req.user = {
            userId: payload.userId,
            email: payload.email,
            role: payload.role,
            permissions: payload.permissions || []
          };
        }
      }

      next();
    } catch (error) {
      // Continue without authentication
      next();
    }
  };

  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
      }
    }

    // Check query parameter
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    // Check cookies
    if (req.cookies && req.cookies.access_token) {
      return req.cookies.access_token;
    }

    return null;
  }
}

/**
 * Middleware factory functions
 */
export class AuthMiddlewareFactory {
  private static middleware: AuthMiddleware;

  public static initialize(tokenService: ITokenService): void {
    this.middleware = new AuthMiddleware(tokenService);
  }

  public static authenticate(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return this.middleware.authenticate;
  }

  public static authorize(roles: UserRole[]): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return this.middleware.authorize(roles);
  }

  public static requirePermission(permission: string): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return this.middleware.requirePermission(permission);
  }

  public static optionalAuth(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return this.middleware.optionalAuthenticate;
  }
}