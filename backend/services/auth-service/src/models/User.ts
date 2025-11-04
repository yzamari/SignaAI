import { BaseEntity } from '../../../../shared/core/BaseEntity';
import { ValidationException } from '../../../../shared/exceptions/BaseException';
import { v4 as uuidv4 } from 'uuid';

/**
 * User Role Enum
 * Defines available user roles in the system
 */
export enum UserRole {
  ADMIN = 'admin',
  SENDER = 'sender',
  SIGNER = 'signer',
  VIEWER = 'viewer'
}

/**
 * User Entity
 * Represents a user in the authentication domain
 */
export class User extends BaseEntity {
  private _email: string;
  private _passwordHash: string;
  private _name: string;
  private _role: UserRole;
  private _phone?: string;
  private _isActive: boolean;
  private _lastLoginAt?: Date;
  private _emailVerified: boolean;
  private _refreshToken?: string;

  constructor(
    email: string,
    passwordHash: string,
    name: string,
    role: UserRole = UserRole.SENDER,
    id?: string
  ) {
    super(id);
    this._email = email;
    this._passwordHash = passwordHash;
    this._name = name;
    this._role = role;
    this._isActive = true;
    this._emailVerified = false;
  }

  // Getters
  get email(): string {
    return this._email;
  }

  get passwordHash(): string {
    return this._passwordHash;
  }

  get name(): string {
    return this._name;
  }

  get role(): UserRole {
    return this._role;
  }

  get phone(): string | undefined {
    return this._phone;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get lastLoginAt(): Date | undefined {
    return this._lastLoginAt;
  }

  get emailVerified(): boolean {
    return this._emailVerified;
  }

  get refreshToken(): string | undefined {
    return this._refreshToken;
  }

  // Setters with business logic
  public setPhone(phone: string): void {
    if (phone && !this.validatePhoneNumber(phone)) {
      throw new ValidationException('Invalid phone number', { phone: ['Invalid format'] });
    }
    this._phone = phone;
    this.updateTimestamp();
  }

  public updatePassword(passwordHash: string): void {
    this._passwordHash = passwordHash;
    this.updateTimestamp();
  }

  public updateRole(role: UserRole): void {
    this._role = role;
    this.updateTimestamp();
  }

  public activate(): void {
    this._isActive = true;
    this.updateTimestamp();
  }

  public deactivate(): void {
    this._isActive = false;
    this.updateTimestamp();
  }

  public recordLogin(): void {
    this._lastLoginAt = new Date();
    this.updateTimestamp();
  }

  public verifyEmail(): void {
    this._emailVerified = true;
    this.updateTimestamp();
  }

  public setRefreshToken(token: string | undefined): void {
    this._refreshToken = token;
    this.updateTimestamp();
  }

  /**
   * Check if user has specific role or higher
   */
  public hasRole(role: UserRole): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      [UserRole.VIEWER]: 1,
      [UserRole.SIGNER]: 2,
      [UserRole.SENDER]: 3,
      [UserRole.ADMIN]: 4
    };

    return roleHierarchy[this._role] >= roleHierarchy[role];
  }

  /**
   * Check if user can perform action
   */
  public canPerform(action: string): boolean {
    if (!this._isActive) return false;
    
    const permissions: Record<UserRole, string[]> = {
      [UserRole.ADMIN]: ['*'],
      [UserRole.SENDER]: ['create_document', 'send_document', 'view_document', 'manage_workflow'],
      [UserRole.SIGNER]: ['sign_document', 'view_document'],
      [UserRole.VIEWER]: ['view_document']
    };

    const userPermissions = permissions[this._role];
    return userPermissions.includes('*') || userPermissions.includes(action);
  }

  protected generateId(): string {
    return uuidv4();
  }

  public validate(): boolean {
    const errors: Record<string, string[]> = {};

    if (!this._email || !this.validateEmail(this._email)) {
      errors.email = ['Invalid email format'];
    }

    if (!this._name || this._name.trim().length < 2) {
      errors.name = ['Name must be at least 2 characters'];
    }

    if (!this._passwordHash) {
      errors.password = ['Password is required'];
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException('User validation failed', errors);
    }

    return true;
  }

  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private validatePhoneNumber(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  public toJSON(): Record<string, any> {
    return {
      id: this._id,
      email: this._email,
      name: this._name,
      role: this._role,
      phone: this._phone,
      isActive: this._isActive,
      emailVerified: this._emailVerified,
      lastLoginAt: this._lastLoginAt?.toISOString(),
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString()
    };
  }

  /**
   * Factory method to create user from database row
   */
  public static fromDatabase(data: any): User {
    const user = new User(
      data.email,
      data.password_hash,
      data.name,
      data.role as UserRole,
      data.id
    );

    if (data.phone) user.setPhone(data.phone);
    if (data.is_active !== undefined) {
      data.is_active ? user.activate() : user.deactivate();
    }
    if (data.email_verified) user.verifyEmail();
    if (data.last_login_at) user._lastLoginAt = new Date(data.last_login_at);
    if (data.refresh_token) user._refreshToken = data.refresh_token;
    
    return user;
  }
}