/**
 * Token Service Interface
 * Defines contract for JWT token operations
 */
export interface ITokenService {
  /**
   * Generate access token
   */
  generateAccessToken(payload: any): Promise<string>;

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload: any): Promise<string>;

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): Promise<any | null>;

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): Promise<any | null>;

  /**
   * Decode token without verification
   */
  decode(token: string): any | null;

  /**
   * Revoke token
   */
  revokeToken(token: string): Promise<void>;

  /**
   * Check if token is revoked
   */
  isTokenRevoked(token: string): Promise<boolean>;
}

/**
 * Password Service Interface
 * Defines contract for password operations
 */
export interface IPasswordService {
  /**
   * Hash password
   */
  hash(password: string): Promise<string>;

  /**
   * Verify password against hash
   */
  verify(password: string, hash: string): Promise<boolean>;

  /**
   * Generate random password
   */
  generateRandomPassword(length?: number): string;

  /**
   * Check password strength
   */
  checkStrength(password: string): {
    score: number;
    feedback: string[];
  };
}