import { Request, Response, NextFunction } from 'express';
import { AuthenticationService } from '../services/AuthenticationService';
import { BaseException } from '../../../../shared/exceptions/BaseException';
import { Injectable } from '../../../../shared/core/DependencyContainer';

/**
 * Authentication Controller
 * Handles HTTP requests for authentication endpoints
 */
@Injectable
export class AuthController {
  constructor(private authService: AuthenticationService) {}

  /**
   * Register new user
   * POST /auth/register
   */
  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.register(req.body);
      
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  /**
   * User login
   * POST /auth/login
   */
  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientIp = req.ip || req.connection.remoteAddress;
      const result = await this.authService.login(req.body, clientIp);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  /**
   * Refresh access token
   * POST /auth/refresh
   */
  public refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.refreshToken(req.body);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  /**
   * User logout
   * POST /auth/logout
   */
  public logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      
      if (userId) {
        await this.authService.logout(userId);
      }
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  /**
   * Get current user profile
   * GET /auth/profile
   */
  public getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
        return;
      }
      
      const user = await this.authService.getUserById(userId);
      
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }
      
      // Remove sensitive data
      const userData = user.toJSON();
      delete (userData as any).passwordHash;
      delete (userData as any).refreshToken;
      
      res.json({
        success: true,
        data: userData
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  /**
   * Update password
   * PUT /auth/password
   */
  public updatePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { currentPassword, newPassword } = req.body;
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
        return;
      }
      
      await this.authService.updatePassword(userId, currentPassword, newPassword);
      
      res.json({
        success: true,
        message: 'Password updated successfully'
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  /**
   * Verify token
   * POST /auth/verify
   */
  public verifyToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body;
      
      if (!token) {
        res.status(400).json({
          success: false,
          error: 'Token is required'
        });
        return;
      }
      
      const payload = await this.authService.verifyToken(token);
      
      res.json({
        success: true,
        data: {
          valid: !!payload,
          payload
        }
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  /**
   * Health check
   * GET /auth/health
   */
  public healthCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const health = await this.authService.healthCheck();
      
      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  /**
   * Handle errors
   */
  private handleError(error: any, res: Response, next: NextFunction): void {
    if (error instanceof BaseException) {
      error.log();
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        details: error.toJSON()
      });
    } else {
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}