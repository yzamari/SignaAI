/**
 * Geometry-related type definitions.
 * Defines types for positioning, bounds, and geometric calculations.
 */

/**
 * Point representing a coordinate in 2D space
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Size representing width and height dimensions
 */
export interface Size {
    width: number;
    height: number;
}

/**
 * Rectangle representing a bounded area
 */
export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Circle representing a circular area
 */
export interface Circle {
    center: Point;
    radius: number;
}

/**
 * Polygon representing a multi-sided shape
 */
export interface Polygon {
    points: Point[];
}

/**
 * Bounding box with additional properties
 */
export interface BoundingBox extends Rectangle {
    rotation?: number;
    page?: number;
    confidence?: number;
}

/**
 * Transformation matrix for geometric transformations
 */
export interface TransformMatrix {
    a: number; // horizontal scaling
    b: number; // horizontal skewing
    c: number; // vertical skewing
    d: number; // vertical scaling
    e: number; // horizontal translation
    f: number; // vertical translation
}

/**
 * Margin or padding specification
 */
export interface EdgeInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/**
 * Anchor point for positioning
 */
export enum AnchorPoint {
    TOP_LEFT = 'top-left',
    TOP_CENTER = 'top-center',
    TOP_RIGHT = 'top-right',
    CENTER_LEFT = 'center-left',
    CENTER = 'center',
    CENTER_RIGHT = 'center-right',
    BOTTOM_LEFT = 'bottom-left',
    BOTTOM_CENTER = 'bottom-center',
    BOTTOM_RIGHT = 'bottom-right'
}

/**
 * Alignment options
 */
export enum Alignment {
    LEFT = 'left',
    CENTER = 'center',
    RIGHT = 'right',
    JUSTIFY = 'justify'
}

/**
 * Vertical alignment options
 */
export enum VerticalAlignment {
    TOP = 'top',
    MIDDLE = 'middle',
    BOTTOM = 'bottom'
}

/**
 * Scaling modes for resizing
 */
export enum ScalingMode {
    FILL = 'fill',
    FIT = 'fit',
    STRETCH = 'stretch',
    CENTER = 'center'
}

/**
 * Geometric utility class for calculations
 */
export class GeometryUtils {
    /**
     * Creates a rectangle from two points
     * @param point1 First point
     * @param point2 Second point
     * @returns Rectangle encompassing both points
     */
    static rectangleFromPoints(point1: Point, point2: Point): Rectangle {
        const x = Math.min(point1.x, point2.x);
        const y = Math.min(point1.y, point2.y);
        const width = Math.abs(point2.x - point1.x);
        const height = Math.abs(point2.y - point1.y);
        return { x, y, width, height };
    }

    /**
     * Calculates the center point of a rectangle
     * @param rect Rectangle
     * @returns Center point
     */
    static getCenterPoint(rect: Rectangle): Point {
        return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2
        };
    }

    /**
     * Calculates the area of a rectangle
     * @param rect Rectangle
     * @returns Area in square units
     */
    static getArea(rect: Rectangle): number {
        return rect.width * rect.height;
    }

    /**
     * Calculates the perimeter of a rectangle
     * @param rect Rectangle
     * @returns Perimeter in units
     */
    static getPerimeter(rect: Rectangle): number {
        return 2 * (rect.width + rect.height);
    }

    /**
     * Checks if a point is inside a rectangle
     * @param point Point to check
     * @param rect Rectangle
     * @returns True if point is inside rectangle
     */
    static isPointInRectangle(point: Point, rect: Rectangle): boolean {
        return point.x >= rect.x &&
               point.x <= rect.x + rect.width &&
               point.y >= rect.y &&
               point.y <= rect.y + rect.height;
    }

    /**
     * Checks if two rectangles intersect
     * @param rect1 First rectangle
     * @param rect2 Second rectangle
     * @returns True if rectangles intersect
     */
    static rectanglesIntersect(rect1: Rectangle, rect2: Rectangle): boolean {
        return !(rect1.x + rect1.width < rect2.x ||
                rect2.x + rect2.width < rect1.x ||
                rect1.y + rect1.height < rect2.y ||
                rect2.y + rect2.height < rect1.y);
    }

    /**
     * Calculates the intersection of two rectangles
     * @param rect1 First rectangle
     * @param rect2 Second rectangle
     * @returns Intersection rectangle or null if no intersection
     */
    static getIntersection(rect1: Rectangle, rect2: Rectangle): Rectangle | null {
        if (!this.rectanglesIntersect(rect1, rect2)) {
            return null;
        }

        const x = Math.max(rect1.x, rect2.x);
        const y = Math.max(rect1.y, rect2.y);
        const width = Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - x;
        const height = Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - y;

        return { x, y, width, height };
    }

    /**
     * Calculates the union of two rectangles
     * @param rect1 First rectangle
     * @param rect2 Second rectangle
     * @returns Union rectangle encompassing both
     */
    static getUnion(rect1: Rectangle, rect2: Rectangle): Rectangle {
        const x = Math.min(rect1.x, rect2.x);
        const y = Math.min(rect1.y, rect2.y);
        const width = Math.max(rect1.x + rect1.width, rect2.x + rect2.width) - x;
        const height = Math.max(rect1.y + rect1.height, rect2.y + rect2.height) - y;

        return { x, y, width, height };
    }

    /**
     * Expands a rectangle by a given amount
     * @param rect Rectangle to expand
     * @param amount Amount to expand by
     * @returns Expanded rectangle
     */
    static expandRectangle(rect: Rectangle, amount: number): Rectangle {
        return {
            x: rect.x - amount,
            y: rect.y - amount,
            width: rect.width + 2 * amount,
            height: rect.height + 2 * amount
        };
    }

    /**
     * Shrinks a rectangle by a given amount
     * @param rect Rectangle to shrink
     * @param amount Amount to shrink by
     * @returns Shrunk rectangle
     */
    static shrinkRectangle(rect: Rectangle, amount: number): Rectangle {
        const newWidth = Math.max(0, rect.width - 2 * amount);
        const newHeight = Math.max(0, rect.height - 2 * amount);
        
        return {
            x: rect.x + amount,
            y: rect.y + amount,
            width: newWidth,
            height: newHeight
        };
    }

    /**
     * Calculates the distance between two points
     * @param point1 First point
     * @param point2 Second point
     * @returns Distance between points
     */
    static getDistance(point1: Point, point2: Point): number {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculates the angle between two points in radians
     * @param point1 First point
     * @param point2 Second point
     * @returns Angle in radians
     */
    static getAngle(point1: Point, point2: Point): number {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.atan2(dy, dx);
    }

    /**
     * Rotates a point around another point
     * @param point Point to rotate
     * @param center Center of rotation
     * @param angle Angle in radians
     * @returns Rotated point
     */
    static rotatePoint(point: Point, center: Point, angle: number): Point {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = point.x - center.x;
        const dy = point.y - center.y;

        return {
            x: center.x + dx * cos - dy * sin,
            y: center.y + dx * sin + dy * cos
        };
    }

    /**
     * Scales a rectangle by a factor
     * @param rect Rectangle to scale
     * @param scale Scale factor
     * @param anchor Anchor point for scaling
     * @returns Scaled rectangle
     */
    static scaleRectangle(rect: Rectangle, scale: number, anchor: AnchorPoint = AnchorPoint.TOP_LEFT): Rectangle {
        const newWidth = rect.width * scale;
        const newHeight = rect.height * scale;
        
        let newX = rect.x;
        let newY = rect.y;

        // Adjust position based on anchor point
        switch (anchor) {
            case AnchorPoint.TOP_CENTER:
                newX = rect.x + (rect.width - newWidth) / 2;
                break;
            case AnchorPoint.TOP_RIGHT:
                newX = rect.x + rect.width - newWidth;
                break;
            case AnchorPoint.CENTER_LEFT:
                newY = rect.y + (rect.height - newHeight) / 2;
                break;
            case AnchorPoint.CENTER:
                newX = rect.x + (rect.width - newWidth) / 2;
                newY = rect.y + (rect.height - newHeight) / 2;
                break;
            case AnchorPoint.CENTER_RIGHT:
                newX = rect.x + rect.width - newWidth;
                newY = rect.y + (rect.height - newHeight) / 2;
                break;
            case AnchorPoint.BOTTOM_LEFT:
                newY = rect.y + rect.height - newHeight;
                break;
            case AnchorPoint.BOTTOM_CENTER:
                newX = rect.x + (rect.width - newWidth) / 2;
                newY = rect.y + rect.height - newHeight;
                break;
            case AnchorPoint.BOTTOM_RIGHT:
                newX = rect.x + rect.width - newWidth;
                newY = rect.y + rect.height - newHeight;
                break;
        }

        return { x: newX, y: newY, width: newWidth, height: newHeight };
    }

    /**
     * Normalizes a rectangle to ensure positive width and height
     * @param rect Rectangle to normalize
     * @returns Normalized rectangle
     */
    static normalizeRectangle(rect: Rectangle): Rectangle {
        let { x, y, width, height } = rect;

        if (width < 0) {
            x += width;
            width = -width;
        }

        if (height < 0) {
            y += height;
            height = -height;
        }

        return { x, y, width, height };
    }

    /**
     * Constrains a rectangle within bounds
     * @param rect Rectangle to constrain
     * @param bounds Bounding rectangle
     * @returns Constrained rectangle
     */
    static constrainRectangle(rect: Rectangle, bounds: Rectangle): Rectangle {
        let { x, y, width, height } = rect;

        // Constrain position
        x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width));
        y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - height));

        // Constrain size if rectangle is larger than bounds
        if (width > bounds.width) {
            width = bounds.width;
            x = bounds.x;
        }

        if (height > bounds.height) {
            height = bounds.height;
            y = bounds.y;
        }

        return { x, y, width, height };
    }

    /**
     * Converts degrees to radians
     * @param degrees Angle in degrees
     * @returns Angle in radians
     */
    static degreesToRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    /**
     * Converts radians to degrees
     * @param radians Angle in radians
     * @returns Angle in degrees
     */
    static radiansToDegrees(radians: number): number {
        return radians * (180 / Math.PI);
    }

    /**
     * Creates edge insets from a single value
     * @param value Uniform inset value
     * @returns EdgeInsets with all sides equal
     */
    static uniformEdgeInsets(value: number): EdgeInsets {
        return { top: value, right: value, bottom: value, left: value };
    }

    /**
     * Creates edge insets from horizontal and vertical values
     * @param horizontal Horizontal inset (left and right)
     * @param vertical Vertical inset (top and bottom)
     * @returns EdgeInsets
     */
    static symmetricEdgeInsets(horizontal: number, vertical: number): EdgeInsets {
        return { top: vertical, right: horizontal, bottom: vertical, left: horizontal };
    }
}

/**
 * Type guard functions
 */
export const isPoint = (obj: any): obj is Point => {
    return typeof obj === 'object' && obj !== null &&
           typeof obj.x === 'number' && typeof obj.y === 'number';
};

export const isRectangle = (obj: any): obj is Rectangle => {
    return typeof obj === 'object' && obj !== null &&
           typeof obj.x === 'number' && typeof obj.y === 'number' &&
           typeof obj.width === 'number' && typeof obj.height === 'number';
};

export const isSize = (obj: any): obj is Size => {
    return typeof obj === 'object' && obj !== null &&
           typeof obj.width === 'number' && typeof obj.height === 'number';
};

/**
 * Common geometry constants
 */
export const GEOMETRY_CONSTANTS = {
    EPSILON: 1e-10,
    PI: Math.PI,
    TWO_PI: 2 * Math.PI,
    HALF_PI: Math.PI / 2,
    DEG_TO_RAD: Math.PI / 180,
    RAD_TO_DEG: 180 / Math.PI
} as const;