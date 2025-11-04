import { BaseRepository } from '../../../../shared/core/BaseRepository';
import { User, UserRole } from '../models/User';
import { DatabaseException } from '../../../../shared/exceptions/BaseException';

/**
 * User Repository Interface
 * Extends base repository with user-specific operations
 */
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findByRefreshToken(token: string): Promise<User | null>;
  findActiveUsers(): Promise<User[]>;
  updateLastLogin(userId: string): Promise<void>;
  updateRefreshToken(userId: string, token: string | null): Promise<void>;
}

/**
 * User Repository Implementation
 * Handles data persistence for User entities
 */
export class UserRepository extends BaseRepository<User> implements IUserRepository {
  protected tableName = 'users';

  protected mapToEntity(row: any): User {
    return User.fromDatabase(row);
  }

  protected mapToDatabase(user: User): any {
    const data = user.toJSON();
    return {
      id: data.id,
      email: data.email,
      password_hash: user.passwordHash,
      name: data.name,
      role: data.role,
      phone: data.phone || null,
      is_active: data.isActive ? 1 : 0,
      email_verified: data.emailVerified ? 1 : 0,
      last_login_at: data.lastLoginAt || null,
      refresh_token: user.refreshToken || null,
      created_at: data.createdAt,
      updated_at: data.updatedAt
    };
  }

  /**
   * Find user by email address
   */
  public async findByEmail(email: string): Promise<User | null> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE email = ? LIMIT 1`;
      const row = await this.database.get(query, [email.toLowerCase()]);
      return row ? this.mapToEntity(row) : null;
    } catch (error) {
      throw new DatabaseException('findByEmail', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Find user by refresh token
   */
  public async findByRefreshToken(token: string): Promise<User | null> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE refresh_token = ? LIMIT 1`;
      const row = await this.database.get(query, [token]);
      return row ? this.mapToEntity(row) : null;
    } catch (error) {
      throw new DatabaseException('findByRefreshToken', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Find all active users
   */
  public async findActiveUsers(): Promise<User[]> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE is_active = 1`;
      const rows = await this.database.all(query);
      return rows.map((row: any) => this.mapToEntity(row));
    } catch (error) {
      throw new DatabaseException('findActiveUsers', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Update user's last login timestamp
   */
  public async updateLastLogin(userId: string): Promise<void> {
    try {
      const query = `UPDATE ${this.tableName} SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`;
      await this.database.run(query, [userId]);
    } catch (error) {
      throw new DatabaseException('updateLastLogin', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Update user's refresh token
   */
  public async updateRefreshToken(userId: string, token: string | null): Promise<void> {
    try {
      const query = `UPDATE ${this.tableName} SET refresh_token = ? WHERE id = ?`;
      await this.database.run(query, [token, userId]);
    } catch (error) {
      throw new DatabaseException('updateRefreshToken', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Find users by role
   */
  public async findByRole(role: UserRole): Promise<User[]> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE role = ?`;
      const rows = await this.database.all(query, [role]);
      return rows.map((row: any) => this.mapToEntity(row));
    } catch (error) {
      throw new DatabaseException('findByRole', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Search users by name or email
   */
  public async search(searchTerm: string): Promise<User[]> {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE name LIKE ? OR email LIKE ?
        ORDER BY name ASC
        LIMIT 50
      `;
      const term = `%${searchTerm}%`;
      const rows = await this.database.all(query, [term, term]);
      return rows.map((row: any) => this.mapToEntity(row));
    } catch (error) {
      throw new DatabaseException('search', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Check if email exists
   */
  public async emailExists(email: string): Promise<boolean> {
    try {
      const query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE email = ?`;
      const result = await this.database.get(query, [email.toLowerCase()]);
      return result.count > 0;
    } catch (error) {
      throw new DatabaseException('emailExists', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}