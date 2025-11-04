import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';
import * as crypto from 'crypto';
import sharp from 'sharp';

/**
 * Strategy Pattern for different signature processing methods
 * Open/Closed Principle - Open for extension, closed for modification
 */

/**
 * Abstract base strategy interface
 */
export interface ISignatureStrategy {
  processSignature(data: string, options?: any): Promise<SignatureResult>;
  validateSignature(data: string): Promise<boolean>;
  generateThumbnail(data: string): Promise<string>;
  calculateHash(data: string): string;
}

/**
 * Result of signature processing
 */
export interface SignatureResult {
  processedData: string;
  thumbnail: string;
  hash: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
}

/**
 * Base abstract class with common functionality
 * Template Method Pattern - defines algorithm structure
 */
export abstract class BaseSignatureStrategy implements ISignatureStrategy {
  protected readonly maxWidth = 800;
  protected readonly maxHeight = 200;
  protected readonly thumbnailWidth = 200;
  protected readonly thumbnailHeight = 50;

  /**
   * Template method for processing signature
   */
  async processSignature(data: string, options?: any): Promise<SignatureResult> {
    // Validate input
    const isValid = await this.validateSignature(data);
    if (!isValid) {
      throw new Error('Invalid signature data');
    }

    // Process specific to strategy
    const processedData = await this.processSpecific(data, options);
    
    // Generate thumbnail
    const thumbnail = await this.generateThumbnail(processedData);
    
    // Calculate hash for integrity
    const hash = this.calculateHash(processedData);
    
    // Get metadata
    const metadata = await this.extractMetadata(processedData);

    return {
      processedData,
      thumbnail,
      hash,
      metadata
    };
  }

  /**
   * Abstract method to be implemented by concrete strategies
   */
  protected abstract processSpecific(data: string, options?: any): Promise<string>;
  
  /**
   * Calculate SHA256 hash of signature data
   */
  calculateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Extract metadata from processed signature
   */
  protected abstract extractMetadata(data: string): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
  }>;

  /**
   * Default validation (can be overridden)
   */
  async validateSignature(data: string): Promise<boolean> {
    return data && data.length > 0;
  }

  /**
   * Generate thumbnail from signature data
   */
  abstract generateThumbnail(data: string): Promise<string>;
}

/**
 * Strategy for drawn signatures (canvas-based)
 */
export class DrawnSignatureStrategy extends BaseSignatureStrategy {
  protected async processSpecific(data: string, options?: any): Promise<string> {
    // Validate base64 image data
    if (!data.startsWith('data:image/')) {
      throw new Error('Invalid drawn signature format');
    }

    // Extract base64 data
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    // Process with sharp for optimization
    const processed = await sharp(buffer)
      .resize(this.maxWidth, this.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .png({ quality: 90, compressionLevel: 9 })
      .toBuffer();

    return `data:image/png;base64,${processed.toString('base64')}`;
  }

  async generateThumbnail(data: string): Promise<string> {
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const thumbnail = await sharp(buffer)
      .resize(this.thumbnailWidth, this.thumbnailHeight, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${thumbnail.toString('base64')}`;
  }

  protected async extractMetadata(data: string): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
  }> {
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'png',
      size: buffer.length
    };
  }

  async validateSignature(data: string): Promise<boolean> {
    if (!data.startsWith('data:image/')) {
      return false;
    }

    try {
      const base64Data = data.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const metadata = await sharp(buffer).metadata();
      return !!(metadata.width && metadata.height);
    } catch {
      return false;
    }
  }
}

/**
 * Strategy for typed signatures (text-based)
 */
export class TypedSignatureStrategy extends BaseSignatureStrategy {
  private readonly fonts = [
    'Dancing Script',
    'Pacifico',
    'Shadows Into Light',
    'Kalam',
    'Caveat'
  ];

  protected async processSpecific(data: string, options?: any): Promise<string> {
    const { text, font = 'Dancing Script', color = '#000000' } = options || {};
    
    if (!text) {
      throw new Error('Text is required for typed signature');
    }

    // Create canvas for text rendering
    const canvas = createCanvas(this.maxWidth, this.maxHeight);
    const ctx = canvas.getContext('2d');

    // Set background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, this.maxWidth, this.maxHeight);

    // Configure text
    ctx.fillStyle = color;
    ctx.font = `48px "${font}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw text
    ctx.fillText(text, this.maxWidth / 2, this.maxHeight / 2);

    // Convert to base64
    return canvas.toDataURL();
  }

  async generateThumbnail(data: string): Promise<string> {
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const thumbnail = await sharp(buffer)
      .resize(this.thumbnailWidth, this.thumbnailHeight)
      .png()
      .toBuffer();

    return `data:image/png;base64,${thumbnail.toString('base64')}`;
  }

  protected async extractMetadata(data: string): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
  }> {
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    return {
      width: this.maxWidth,
      height: this.maxHeight,
      format: 'png',
      size: buffer.length
    };
  }

  async validateSignature(data: string): Promise<boolean> {
    return data && (typeof data === 'string' || data.startsWith('data:image/'));
  }
}

/**
 * Strategy for uploaded signature images
 */
export class UploadedSignatureStrategy extends BaseSignatureStrategy {
  protected async processSpecific(data: string, options?: any): Promise<string> {
    // Handle both base64 and buffer inputs
    let buffer: Buffer;
    
    if (data.startsWith('data:image/')) {
      const base64Data = data.split(',')[1];
      buffer = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(data as any)) {
      buffer = data as any;
    } else {
      buffer = Buffer.from(data, 'base64');
    }

    // Process and optimize the image
    const processed = await sharp(buffer)
      .resize(this.maxWidth, this.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .removeAlpha()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png({ quality: 90, compressionLevel: 9 })
      .toBuffer();

    return `data:image/png;base64,${processed.toString('base64')}`;
  }

  async generateThumbnail(data: string): Promise<string> {
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const thumbnail = await sharp(buffer)
      .resize(this.thumbnailWidth, this.thumbnailHeight, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 }
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${thumbnail.toString('base64')}`;
  }

  protected async extractMetadata(data: string): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
  }> {
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: buffer.length
    };
  }
}

/**
 * Strategy for biometric signatures
 */
export class BiometricSignatureStrategy extends BaseSignatureStrategy {
  protected async processSpecific(data: string, options?: any): Promise<string> {
    const { points, pressure, velocity } = options || {};
    
    if (!points || points.length === 0) {
      throw new Error('Biometric points are required');
    }

    // Create canvas for biometric rendering
    const canvas = createCanvas(this.maxWidth, this.maxHeight);
    const ctx = canvas.getContext('2d');

    // Set background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, this.maxWidth, this.maxHeight);

    // Draw signature path with pressure variation
    ctx.strokeStyle = '#000000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currPoint = points[i];
      
      // Vary line width based on pressure
      ctx.lineWidth = pressure ? (pressure[i] || 1) * 3 : 2;
      
      ctx.beginPath();
      ctx.moveTo(prevPoint.x, prevPoint.y);
      ctx.lineTo(currPoint.x, currPoint.y);
      ctx.stroke();
    }

    return canvas.toDataURL();
  }

  async generateThumbnail(data: string): Promise<string> {
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const thumbnail = await sharp(buffer)
      .resize(this.thumbnailWidth, this.thumbnailHeight)
      .png()
      .toBuffer();

    return `data:image/png;base64,${thumbnail.toString('base64')}`;
  }

  protected async extractMetadata(data: string): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
  }> {
    const base64Data = data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    return {
      width: this.maxWidth,
      height: this.maxHeight,
      format: 'png',
      size: buffer.length
    };
  }

  async validateSignature(data: string): Promise<boolean> {
    return data && data.length > 0;
  }
}

/**
 * Strategy Factory - Factory Pattern for creating appropriate strategy
 */
export class SignatureStrategyFactory {
  private static strategies = new Map<string, ISignatureStrategy>([
    ['drawn', new DrawnSignatureStrategy()],
    ['typed', new TypedSignatureStrategy()],
    ['uploaded', new UploadedSignatureStrategy()],
    ['biometric', new BiometricSignatureStrategy()]
  ]);

  /**
   * Get strategy based on type
   */
  static getStrategy(type: string): ISignatureStrategy {
    const strategy = this.strategies.get(type.toLowerCase());
    if (!strategy) {
      throw new Error(`Unknown signature strategy type: ${type}`);
    }
    return strategy;
  }

  /**
   * Register custom strategy
   */
  static registerStrategy(type: string, strategy: ISignatureStrategy): void {
    this.strategies.set(type.toLowerCase(), strategy);
  }
}