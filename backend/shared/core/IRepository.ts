/**
 * Generic Repository Interface
 * Defines contract for data access layer
 * Follows Repository Pattern to abstract data persistence
 */
export interface IRepository<T> {
  /**
   * Find entity by ID
   */
  findById(id: string): Promise<T | null>;

  /**
   * Find all entities matching criteria
   */
  findAll(criteria?: Partial<T>): Promise<T[]>;

  /**
   * Find single entity matching criteria
   */
  findOne(criteria: Partial<T>): Promise<T | null>;

  /**
   * Create new entity
   */
  create(entity: T): Promise<T>;

  /**
   * Update existing entity
   */
  update(id: string, entity: Partial<T>): Promise<T | null>;

  /**
   * Delete entity by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if entity exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Count entities matching criteria
   */
  count(criteria?: Partial<T>): Promise<number>;

  /**
   * Paginated find with sorting
   */
  findPaginated(
    criteria?: Partial<T>,
    page?: number,
    limit?: number,
    sort?: { field: string; order: 'asc' | 'desc' }
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    totalPages: number;
  }>;
}

/**
 * Unit of Work Interface
 * Manages transactions across multiple repositories
 */
export interface IUnitOfWork {
  /**
   * Begin transaction
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback transaction
   */
  rollback(): Promise<void>;

  /**
   * Execute operation in transaction
   */
  executeInTransaction<T>(operation: () => Promise<T>): Promise<T>;
}