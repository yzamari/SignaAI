import jwt from 'jsonwebtoken';
import { ITokenService } from '../interfaces/ITokenService';
import { Injectable } from '../../../../shared/core/DependencyContainer';

/**
 * JWT Token Service Implementation
 * Handles JWT token generation and verification
 */
@Injectable
export class JwtTokenService implements ITokenService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string = '1h';
  private readonly refreshTokenExpiry: string = '7d';
  private revokedTokens: Set<string> = new Set();

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'access-secret-key';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refresh-secret-key';
  }

  /**
   * Generate access token
   */
  public async generateAccessToken(payload: any): Promise<string> {
    return new Promise((resolve, reject) => {
      jwt.sign(
        payload,
        this.accessTokenSecret,
        {
          expiresIn: this.accessTokenExpiry,
          issuer: 'signa-ai',
          audience: 'signa-api'
        },
        (err, token) => {
          if (err || !token) {
            reject(err || new Error('Failed to generate access token'));
          } else {
            resolve(token);
          }
        }
      );
    });
  }

  /**
   * Generate refresh token
   */
  public async generateRefreshToken(payload: any): Promise<string> {
    return new Promise((resolve, reject) => {
      jwt.sign(
        payload,
        this.refreshTokenSecret,
        {
          expiresIn: this.refreshTokenExpiry,
          issuer: 'signa-ai',
          audience: 'signa-refresh'
        },
        (err, token) => {
          if (err || !token) {
            reject(err || new Error('Failed to generate refresh token'));
          } else {
            resolve(token);
          }
        }
      );
    });
  }

  /**
   * Verify access token
   */
  public async verifyAccessToken(token: string): Promise<any | null> {
    try {
      // Check if token is revoked
      if (await this.isTokenRevoked(token)) {
        return null;
      }

      return new Promise((resolve) => {
        jwt.verify(
          token,
          this.accessTokenSecret,
          {
            issuer: 'signa-ai',
            audience: 'signa-api'
          },
          (err, decoded) => {
            if (err) {
              resolve(null);
            } else {
              resolve(decoded);
            }
          }
        );
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify refresh token
   */
  public async verifyRefreshToken(token: string): Promise<any | null> {
    try {
      // Check if token is revoked
      if (await this.isTokenRevoked(token)) {
        return null;
      }

      return new Promise((resolve) => {
        jwt.verify(
          token,
          this.refreshTokenSecret,
          {
            issuer: 'signa-ai',
            audience: 'signa-refresh'
          },
          (err, decoded) => {
            if (err) {
              resolve(null);
            } else {
              resolve(decoded);
            }
          }
        );
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Decode token without verification
   */
  public decode(token: string): any | null {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }

  /**
   * Revoke token
   */
  public async revokeToken(token: string): Promise<void> {
    this.revokedTokens.add(token);
    
    // In production, this should be stored in Redis or a database
    // For now, we're using in-memory storage
    
    // Clean up expired tokens periodically
    if (this.revokedTokens.size > 1000) {
      this.cleanupRevokedTokens();
    }
  }

  /**
   * Check if token is revoked
   */
  public async isTokenRevoked(token: string): Promise<boolean> {
    return this.revokedTokens.has(token);
  }

  /**
   * Clean up expired revoked tokens
   */
  private cleanupRevokedTokens(): void {
    const now = Date.now() / 1000;
    
    for (const token of this.revokedTokens) {
      const decoded = this.decode(token);
      if (decoded && decoded.exp && decoded.exp < now) {
        this.revokedTokens.delete(token);
      }
    }
  }
}