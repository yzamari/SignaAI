import { BaseService } from '../../../../shared/core/BaseService';
import { UserRepository } from '../repositories/UserRepository';
import { User, UserRole } from '../models/User';
import { ITokenService } from '../interfaces/ITokenService';
import { IPasswordService } from '../interfaces/IPasswordService';
import { 
  UnauthorizedException, 
  ValidationException, 
  ConflictException,
  NotFoundException 
} from '../../../../shared/exceptions/BaseException';
import { EventBus, DomainEvent } from '../../../../shared/messaging/EventBus';
import { Injectable } from '../../../../shared/core/DependencyContainer';

/**
 * Authentication Request DTOs
 */
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthResponse {
  user: Partial<User>;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Domain Events for Authentication
 */
export class UserRegisteredEvent extends DomainEvent {
  constructor(userId: string, email: string, name: string) {
    super(userId, { email, name });
  }
}

export class UserLoggedInEvent extends DomainEvent {
  constructor(userId: string, email: string, ip?: string) {
    super(userId, { email, ip, timestamp: new Date() });
  }
}

export class UserLoggedOutEvent extends DomainEvent {
  constructor(userId: string) {
    super(userId, { timestamp: new Date() });
  }
}

/**
 * Authentication Service
 * Handles user authentication and authorization
 */
@Injectable
export class AuthenticationService extends BaseService {
  protected serviceName = 'AuthenticationService';
  private eventBus: EventBus;

  constructor(
    private userRepository: UserRepository,
    private tokenService: ITokenService,
    private passwordService: IPasswordService
  ) {
    super();
    this.eventBus = EventBus.getInstance();
  }

  /**
   * Register a new user
   */
  public async register(request: RegisterRequest): Promise<AuthResponse> {
    return this.executeOperation('register', async () => {
      // Validate input
      await this.validateRegistrationInput(request);

      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(request.email);
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash password
      const passwordHash = await this.passwordService.hash(request.password);

      // Create user entity
      const user = new User(
        request.email.toLowerCase(),
        passwordHash,
        request.name,
        request.role || UserRole.SENDER
      );

      if (request.phone) {
        user.setPhone(request.phone);
      }

      // Validate entity
      user.validate();

      // Save to repository
      const savedUser = await this.userRepository.create(user);

      // Generate tokens
      const { accessToken, refreshToken, expiresIn } = await this.generateAuthTokens(savedUser);

      // Update refresh token in database
      await this.userRepository.updateRefreshToken(savedUser.id, refreshToken);

      // Publish domain event
      await this.eventBus.publish(
        new UserRegisteredEvent(savedUser.id, savedUser.email, savedUser.name)
      );

      return {
        user: this.sanitizeUser(savedUser),
        accessToken,
        refreshToken,
        expiresIn
      };
    });
  }

  /**
   * Authenticate user with email and password
   */
  public async login(request: LoginRequest, ip?: string): Promise<AuthResponse> {
    return this.executeOperation('login', async () => {
      // Find user by email
      const user = await this.userRepository.findByEmail(request.email.toLowerCase());
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await this.passwordService.verify(
        request.password,
        user.passwordHash
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Update last login
      user.recordLogin();
      await this.userRepository.updateLastLogin(user.id);

      // Generate tokens
      const { accessToken, refreshToken, expiresIn } = await this.generateAuthTokens(user);

      // Update refresh token in database
      await this.userRepository.updateRefreshToken(user.id, refreshToken);

      // Publish domain event
      await this.eventBus.publish(
        new UserLoggedInEvent(user.id, user.email, ip)
      );

      return {
        user: this.sanitizeUser(user),
        accessToken,
        refreshToken,
        expiresIn
      };
    });
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshToken(request: RefreshTokenRequest): Promise<AuthResponse> {
    return this.executeOperation('refreshToken', async () => {
      // Verify refresh token
      const tokenPayload = await this.tokenService.verifyRefreshToken(request.refreshToken);
      
      if (!tokenPayload) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Find user by refresh token
      const user = await this.userRepository.findByRefreshToken(request.refreshToken);
      
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      // Generate new tokens
      const { accessToken, refreshToken, expiresIn } = await this.generateAuthTokens(user);

      // Update refresh token in database
      await this.userRepository.updateRefreshToken(user.id, refreshToken);

      return {
        user: this.sanitizeUser(user),
        accessToken,
        refreshToken,
        expiresIn
      };
    });
  }

  /**
   * Logout user
   */
  public async logout(userId: string): Promise<void> {
    return this.executeOperation('logout', async () => {
      // Clear refresh token
      await this.userRepository.updateRefreshToken(userId, null);

      // Publish domain event
      await this.eventBus.publish(new UserLoggedOutEvent(userId));
    });
  }

  /**
   * Verify access token
   */
  public async verifyToken(token: string): Promise<any> {
    return this.executeOperation('verifyToken', async () => {
      const payload = await this.tokenService.verifyAccessToken(token);
      
      if (!payload) {
        throw new UnauthorizedException('Invalid access token');
      }

      return payload;
    });
  }

  /**
   * Get user by ID
   */
  public async getUserById(userId: string): Promise<User | null> {
    return this.executeOperation('getUserById', async () => {
      const user = await this.userRepository.findById(userId);
      
      if (!user) {
        throw new NotFoundException('User', userId);
      }

      return user;
    });
  }

  /**
   * Update user password
   */
  public async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    return this.executeOperation('updatePassword', async () => {
      const user = await this.userRepository.findById(userId);
      
      if (!user) {
        throw new NotFoundException('User', userId);
      }

      // Verify current password
      const isPasswordValid = await this.passwordService.verify(
        currentPassword,
        user.passwordHash
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Validate new password
      this.validatePassword(newPassword);

      // Hash new password
      const newPasswordHash = await this.passwordService.hash(newPassword);

      // Update user
      user.updatePassword(newPasswordHash);
      await this.userRepository.update(userId, user);

      // Clear refresh token for security
      await this.userRepository.updateRefreshToken(userId, null);
    });
  }

  /**
   * Generate authentication tokens
   */
  private async generateAuthTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: this.getUserPermissions(user)
    };

    const accessToken = await this.tokenService.generateAccessToken(tokenPayload);
    const refreshToken = await this.tokenService.generateRefreshToken({ userId: user.id });

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600 // 1 hour
    };
  }

  /**
   * Get user permissions based on role
   */
  private getUserPermissions(user: User): string[] {
    const permissions: Record<UserRole, string[]> = {
      [UserRole.ADMIN]: ['*'],
      [UserRole.SENDER]: ['create_document', 'send_document', 'view_document', 'manage_workflow'],
      [UserRole.SIGNER]: ['sign_document', 'view_document'],
      [UserRole.VIEWER]: ['view_document']
    };

    return permissions[user.role] || [];
  }

  /**
   * Sanitize user data for response
   */
  private sanitizeUser(user: User): Partial<User> {
    const data = user.toJSON();
    delete (data as any).passwordHash;
    delete (data as any).refreshToken;
    return data;
  }

  /**
   * Validate registration input
   */
  private async validateRegistrationInput(request: RegisterRequest): Promise<void> {
    const errors: Record<string, string[]> = {};

    // Email validation
    if (!request.email || !this.isValidEmail(request.email)) {
      errors.email = ['Invalid email format'];
    }

    // Password validation
    if (!request.password) {
      errors.password = ['Password is required'];
    } else {
      const passwordErrors = this.validatePasswordStrength(request.password);
      if (passwordErrors.length > 0) {
        errors.password = passwordErrors;
      }
    }

    // Name validation
    if (!request.name || request.name.trim().length < 2) {
      errors.name = ['Name must be at least 2 characters'];
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException('Validation failed', errors);
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): string[] {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    return errors;
  }

  /**
   * Validate password
   */
  private validatePassword(password: string): void {
    const errors = this.validatePasswordStrength(password);
    if (errors.length > 0) {
      throw new ValidationException('Password validation failed', { password: errors });
    }
  }

  /**
   * Perform health check
   */
  protected async performHealthCheck(): Promise<Record<string, any>> {
    const userCount = await this.userRepository.count();
    const activeUsers = await this.userRepository.findActiveUsers();

    return {
      totalUsers: userCount,
      activeUsers: activeUsers.length,
      database: 'connected',
      tokenService: 'operational'
    };
  }
}