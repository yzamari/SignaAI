import bcrypt from 'bcrypt';
import { IPasswordService } from '../interfaces/ITokenService';
import { Injectable } from '../../../../shared/core/DependencyContainer';

/**
 * Bcrypt Password Service Implementation
 * Handles password hashing and verification using bcrypt
 */
@Injectable
export class BcryptPasswordService implements IPasswordService {
  private readonly saltRounds: number = 10;

  /**
   * Hash password using bcrypt
   */
  public async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Verify password against hash
   */
  public async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Generate random password
   */
  public generateRandomPassword(length: number = 12): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = uppercase + lowercase + numbers + symbols;
    let password = '';
    
    // Ensure at least one character from each category
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Check password strength
   */
  public checkStrength(password: string): { score: number; feedback: string[] } {
    let score = 0;
    const feedback: string[] = [];
    
    // Length check
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length < 8) {
      feedback.push('Password should be at least 8 characters long');
    }
    
    // Complexity checks
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Add lowercase letters');
    
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Add uppercase letters');
    
    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Add numbers');
    
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    else feedback.push('Add special characters');
    
    // Common patterns check
    if (!/(.)\1{2,}/.test(password)) score += 1;
    else feedback.push('Avoid repeating characters');
    
    if (!/^(password|123456|qwerty)/i.test(password)) score += 1;
    else feedback.push('Avoid common passwords');
    
    // Calculate final score (0-5)
    const finalScore = Math.min(5, Math.floor(score / 1.6));
    
    return {
      score: finalScore,
      feedback
    };
  }
}