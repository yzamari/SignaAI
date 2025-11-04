/**
 * Base Entity Abstract Class
 * Implements common properties and behaviors for all domain entities
 * Follows DDD (Domain-Driven Design) principles
 */
export abstract class BaseEntity {
  protected readonly _id: string;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;

  constructor(id?: string) {
    this._id = id || this.generateId();
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  get id(): string {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected updateTimestamp(): void {
    this._updatedAt = new Date();
  }

  /**
   * Abstract method for ID generation
   * Each entity can implement its own ID generation strategy
   */
  protected abstract generateId(): string;

  /**
   * Abstract method for entity validation
   * Ensures business rules are enforced
   */
  public abstract validate(): boolean;

  /**
   * Template method for equality comparison
   * Subclasses can override specific comparison logic
   */
  public equals(entity: BaseEntity): boolean {
    if (entity === null || entity === undefined) {
      return false;
    }
    if (!(entity instanceof this.constructor)) {
      return false;
    }
    return this._id === entity._id;
  }

  /**
   * Convert entity to plain object
   * Useful for serialization
   */
  public abstract toJSON(): Record<string, any>;
}