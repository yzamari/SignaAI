import { IRepository } from './IRepository';
import { BaseEntity } from './BaseEntity';

/**
 * Abstract Base Repository
 * Provides common implementation for repository operations
 * Follows Template Method pattern for customizable behavior
 */
export abstract class BaseRepository<T extends BaseEntity> implements IRepository<T> {
  protected abstract tableName: string;

  constructor(protected database: any) {}

  /**
   * Hook method for entity transformation after fetch
   */
  protected abstract mapToEntity(row: any): T;

  /**
   * Hook method for entity transformation before save
   */
  protected abstract mapToDatabase(entity: T): any;

  public async findById(id: string): Promise<T | null> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE id = ?`;
      const row = await this.database.get(query, [id]);
      return row ? this.mapToEntity(row) : null;
    } catch (error) {
      this.handleError('findById', error);
      return null;
    }
  }

  public async findAll(criteria?: Partial<T>): Promise<T[]> {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const params: any[] = [];

      if (criteria) {
        const conditions = this.buildWhereClause(criteria);
        if (conditions.clause) {
          query += ` WHERE ${conditions.clause}`;
          params.push(...conditions.params);
        }
      }

      const rows = await this.database.all(query, params);
      return rows.map((row: any) => this.mapToEntity(row));
    } catch (error) {
      this.handleError('findAll', error);
      return [];
    }
  }

  public async findOne(criteria: Partial<T>): Promise<T | null> {
    try {
      const conditions = this.buildWhereClause(criteria);
      const query = `SELECT * FROM ${this.tableName} WHERE ${conditions.clause} LIMIT 1`;
      const row = await this.database.get(query, conditions.params);
      return row ? this.mapToEntity(row) : null;
    } catch (error) {
      this.handleError('findOne', error);
      return null;
    }
  }

  public async create(entity: T): Promise<T> {
    try {
      const data = this.mapToDatabase(entity);
      const fields = Object.keys(data);
      const placeholders = fields.map(() => '?').join(', ');
      const values = fields.map(field => data[field]);

      const query = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
      await this.database.run(query, values);

      return entity;
    } catch (error) {
      this.handleError('create', error);
      throw error;
    }
  }

  public async update(id: string, updates: Partial<T>): Promise<T | null> {
    try {
      const data = this.mapToDatabase(updates as T);
      delete data.id; // Remove ID from updates
      
      const fields = Object.keys(data);
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => data[field]);
      values.push(id);

      const query = `UPDATE ${this.tableName} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      await this.database.run(query, values);

      return this.findById(id);
    } catch (error) {
      this.handleError('update', error);
      return null;
    }
  }

  public async delete(id: string): Promise<boolean> {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE id = ?`;
      const result = await this.database.run(query, [id]);
      return result.changes > 0;
    } catch (error) {
      this.handleError('delete', error);
      return false;
    }
  }

  public async exists(id: string): Promise<boolean> {
    try {
      const query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE id = ?`;
      const result = await this.database.get(query, [id]);
      return result.count > 0;
    } catch (error) {
      this.handleError('exists', error);
      return false;
    }
  }

  public async count(criteria?: Partial<T>): Promise<number> {
    try {
      let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
      const params: any[] = [];

      if (criteria) {
        const conditions = this.buildWhereClause(criteria);
        if (conditions.clause) {
          query += ` WHERE ${conditions.clause}`;
          params.push(...conditions.params);
        }
      }

      const result = await this.database.get(query, params);
      return result.count;
    } catch (error) {
      this.handleError('count', error);
      return 0;
    }
  }

  public async findPaginated(
    criteria?: Partial<T>,
    page: number = 1,
    limit: number = 10,
    sort?: { field: string; order: 'asc' | 'desc' }
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const total = await this.count(criteria);
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;

      let query = `SELECT * FROM ${this.tableName}`;
      const params: any[] = [];

      if (criteria) {
        const conditions = this.buildWhereClause(criteria);
        if (conditions.clause) {
          query += ` WHERE ${conditions.clause}`;
          params.push(...conditions.params);
        }
      }

      if (sort) {
        query += ` ORDER BY ${sort.field} ${sort.order.toUpperCase()}`;
      }

      query += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = await this.database.all(query, params);
      const data = rows.map((row: any) => this.mapToEntity(row));

      return {
        data,
        total,
        page,
        totalPages
      };
    } catch (error) {
      this.handleError('findPaginated', error);
      return {
        data: [],
        total: 0,
        page: 1,
        totalPages: 0
      };
    }
  }

  /**
   * Build WHERE clause from criteria object
   */
  protected buildWhereClause(criteria: any): { clause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(criteria)) {
      if (value !== undefined && value !== null) {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }

    return {
      clause: conditions.join(' AND '),
      params
    };
  }

  /**
   * Centralized error handling
   */
  protected handleError(operation: string, error: any): void {
    console.error(`Repository error in ${operation} for ${this.tableName}:`, error);
  }
}