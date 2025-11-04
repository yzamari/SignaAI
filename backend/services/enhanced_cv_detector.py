"""
Enhanced Computer Vision Structure Detection Module
Improved detection algorithms for better signature field identification
Includes adaptive thresholding, multi-scale detection, and ML-based filtering
"""

import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
import logging
from PIL import Image
import io
from sklearn.cluster import DBSCAN
import json

logger = logging.getLogger(__name__)


@dataclass
class EnhancedStructure:
    """Enhanced structure with additional metadata and scoring"""
    type: str
    x: int
    y: int
    width: int
    height: int
    confidence: float
    metadata: Dict = field(default_factory=dict)
    features: Dict = field(default_factory=dict)
    
    def to_dict(self):
        return {
            'type': self.type,
            'x': int(self.x),
            'y': int(self.y),
            'width': int(self.width),
            'height': int(self.height),
            'confidence': float(self.confidence),
            'metadata': {k: float(v) if isinstance(v, (np.number, np.bool_)) else v for k, v in self.metadata.items()},
            'features': {k: bool(v) if isinstance(v, np.bool_) else v for k, v in self.features.items()}
        }
    
    def intersects(self, other, margin=10):
        """Check if this structure intersects with another (with margin)"""
        return not (self.x + self.width + margin < other.x or 
                   other.x + other.width + margin < self.x or
                   self.y + self.height + margin < other.y or
                   other.y + other.height + margin < self.y)


class EnhancedCVDetector:
    """Enhanced CV detector with improved algorithms"""
    
    def __init__(self):
        self.config = {
            'min_line_length': 50,
            'max_line_gap': 30,
            'horizontal_threshold': 5,
            'signature_zone_start': 0.5,  # Start looking at 50% of page
            'min_line_darkness': 100,  # Max pixel value for dark line
            'min_line_contrast': 50,   # Min contrast with background
        }
        
    def detect_all_structures(self, image: np.ndarray, page_num: int = 1) -> Dict[str, List[EnhancedStructure]]:
        """
        Comprehensive structure detection with multiple techniques
        """
        logger.info(f"=== ENHANCED CV DETECTION - Page {page_num} ===")
        
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        height, width = gray.shape
        logger.info(f"Image dimensions: {width}x{height}")
        
        # Multi-scale preprocessing
        structures = {
            'signature_lines': self.detect_signature_lines_advanced(gray),
            'form_boxes': self.detect_form_boxes_advanced(gray),
            'text_blocks': self.detect_text_blocks(gray),
            'blank_regions': self.detect_blank_regions(gray),
            'underlines': self.detect_underlines_ml(gray),
            'signature_zones': self.detect_signature_zones(gray)
        }
        
        # Post-processing: merge overlapping structures
        structures = self.merge_overlapping_structures(structures)
        
        # Log summary
        total = sum(len(items) for items in structures.values())
        logger.info(f"Total structures detected: {total}")
        for struct_type, items in structures.items():
            if items:
                logger.info(f"  {struct_type}: {len(items)}")
        
        return structures
    
    def detect_signature_lines_advanced(self, gray: np.ndarray) -> List[EnhancedStructure]:
        """
        Advanced signature line detection using multiple techniques
        """
        lines = []
        height, width = gray.shape
        
        # Method 1: Adaptive threshold for varying lighting
        adaptive = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            11, 2
        )
        
        # Method 2: Morphological operations to connect broken lines
        kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (50, 1))
        morph = cv2.morphologyEx(adaptive, cv2.MORPH_CLOSE, kernel_h)
        morph = cv2.dilate(morph, kernel_h, iterations=1)
        
        # Method 3: Progressive Probabilistic Hough Transform
        edges = cv2.Canny(morph, 30, 90, apertureSize=3)
        
        detected_lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi/180,
            threshold=40,
            minLineLength=self.config['min_line_length'],
            maxLineGap=self.config['max_line_gap']
        )
        
        if detected_lines is not None:
            # Process and filter lines
            for line in detected_lines:
                x1, y1, x2, y2 = line[0]
                
                # Calculate line properties
                angle = np.abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
                length = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
                
                # Check if horizontal
                if angle < self.config['horizontal_threshold'] or angle > (180 - self.config['horizontal_threshold']):
                    # Additional validation
                    mid_y = (y1 + y2) // 2
                    line_region = gray[max(0, mid_y-2):min(height, mid_y+2), min(x1,x2):max(x1,x2)]
                    
                    if line_region.size > 0:
                        # Check darkness and contrast
                        mean_val = np.mean(line_region)
                        surrounding = gray[max(0, mid_y-10):min(height, mid_y+10), min(x1,x2):max(x1,x2)]
                        surrounding_mean = np.mean(surrounding)
                        contrast = abs(surrounding_mean - mean_val)
                        
                        # Score the line
                        score = self.score_signature_line(
                            x1, y1, x2, y2, 
                            mean_val, contrast, 
                            length, width, height
                        )
                        
                        if score > 0.5:
                            structure = EnhancedStructure(
                                type='signature_line',
                                x=min(x1, x2),
                                y=min(y1, y2) - 20,  # Above the line
                                width=int(length),
                                height=40,
                                confidence=score,
                                metadata={
                                    'angle': angle,
                                    'darkness': mean_val,
                                    'contrast': contrast,
                                    'y_percent': (mid_y / height) * 100
                                },
                                features={
                                    'is_in_signature_zone': mid_y > height * self.config['signature_zone_start'],
                                    'is_dark_enough': mean_val < self.config['min_line_darkness'],
                                    'has_good_contrast': contrast > self.config['min_line_contrast']
                                }
                            )
                            lines.append(structure)
        
        # Method 4: Horizontal projection analysis for missed lines
        projection_lines = self.detect_by_projection(gray)
        lines.extend(projection_lines)
        
        # Remove duplicates
        lines = self.remove_duplicate_lines(lines)
        
        return lines
    
    def detect_by_projection(self, gray: np.ndarray) -> List[EnhancedStructure]:
        """
        Detect lines using horizontal projection profile
        """
        lines = []
        height, width = gray.shape
        
        # Focus on signature area (bottom 50%)
        sig_start = int(height * self.config['signature_zone_start'])
        sig_area = gray[sig_start:, :]
        
        # Invert for dark lines
        inverted = 255 - sig_area
        
        # Calculate horizontal projection
        h_projection = np.sum(inverted, axis=1) / width
        
        # Find peaks (potential lines)
        mean_proj = np.mean(h_projection)
        std_proj = np.std(h_projection)
        threshold = mean_proj + 1.5 * std_proj
        
        # Find continuous regions above threshold
        above_threshold = h_projection > threshold
        
        # Find start and end of each peak
        diff = np.diff(np.concatenate(([False], above_threshold, [False])).astype(int))
        starts = np.where(diff == 1)[0]
        ends = np.where(diff == -1)[0]
        
        for start, end in zip(starts, ends):
            if end - start < 10:  # Line thickness threshold
                y_pos = sig_start + (start + end) // 2
                
                # Verify it's actually a line
                line_strip = gray[y_pos-2:y_pos+2, :]
                if line_strip.size > 0:
                    mean_val = np.mean(line_strip)
                    if mean_val < self.config['min_line_darkness']:
                        structure = EnhancedStructure(
                            type='signature_line',
                            x=100,
                            y=y_pos - 20,
                            width=width - 200,
                            height=40,
                            confidence=0.7,
                            metadata={
                                'detection_method': 'projection',
                                'y_percent': (y_pos / height) * 100,
                                'projection_strength': float(np.max(h_projection[start:end]))
                            },
                            features={
                                'is_in_signature_zone': True,
                                'from_projection': True
                            }
                        )
                        lines.append(structure)
        
        return lines
    
    def detect_underlines_ml(self, gray: np.ndarray) -> List[EnhancedStructure]:
        """
        Machine learning-inspired underline detection
        """
        underlines = []
        height, width = gray.shape
        
        # Use Sobel operator for edge detection
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        
        # Focus on horizontal edges
        horizontal_edges = np.abs(sobely)
        
        # Threshold
        threshold = np.percentile(horizontal_edges, 95)
        strong_edges = horizontal_edges > threshold
        
        # Find connected components
        num_labels, labels = cv2.connectedComponents(strong_edges.astype(np.uint8))
        
        for label in range(1, num_labels):
            mask = labels == label
            points = np.where(mask)
            
            if len(points[0]) > 50:  # Minimum size
                y_coords = points[0]
                x_coords = points[1]
                
                # Check if mostly horizontal
                y_range = np.max(y_coords) - np.min(y_coords)
                x_range = np.max(x_coords) - np.min(x_coords)
                
                if x_range > 100 and y_range < 10:  # Horizontal line criteria
                    structure = EnhancedStructure(
                        type='underline',
                        x=int(np.min(x_coords)),
                        y=int(np.mean(y_coords)) - 20,
                        width=int(x_range),
                        height=40,
                        confidence=0.65,
                        metadata={
                            'detection_method': 'ml_edges',
                            'y_percent': (np.mean(y_coords) / height) * 100
                        },
                        features={
                            'from_ml': True
                        }
                    )
                    underlines.append(structure)
        
        return underlines
    
    def detect_form_boxes_advanced(self, gray: np.ndarray) -> List[EnhancedStructure]:
        """
        Advanced form box detection with shape analysis
        """
        boxes = []
        
        # Multiple preprocessing techniques
        binary = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_MEAN_C,
            cv2.THRESH_BINARY_INV,
            11, 2
        )
        
        # Find contours
        contours, _ = cv2.findContours(
            binary,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        for contour in contours:
            # Approximate polygon
            perimeter = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
            
            # Check if rectangle (4 vertices)
            if len(approx) == 4:
                x, y, w, h = cv2.boundingRect(approx)
                
                # Filter by size and aspect ratio
                aspect_ratio = w / h if h > 0 else 0
                area = w * h
                
                if (20 < w < 500 and 15 < h < 100 and 
                    0.5 < aspect_ratio < 20 and 
                    area > 300):
                    
                    # Calculate rectangularity
                    contour_area = cv2.contourArea(contour)
                    rectangularity = contour_area / area if area > 0 else 0
                    
                    if rectangularity > 0.7:
                        structure = EnhancedStructure(
                            type='form_box',
                            x=x,
                            y=y,
                            width=w,
                            height=h,
                            confidence=rectangularity,
                            metadata={
                                'aspect_ratio': aspect_ratio,
                                'area': area,
                                'rectangularity': rectangularity
                            },
                            features={
                                'is_checkbox': w < 30 and h < 30 and abs(w - h) < 5,
                                'is_text_field': w > 100 and h < 50
                            }
                        )
                        boxes.append(structure)
        
        return boxes
    
    def detect_text_blocks(self, gray: np.ndarray) -> List[EnhancedStructure]:
        """
        Detect text blocks using morphological operations
        """
        text_blocks = []
        
        # Binarize
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # Connect text with morphology
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 5))
        connected = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(
            connected,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            if w > 50 and h > 15:  # Minimum text block size
                # Analyze text density
                roi = binary[y:y+h, x:x+w]
                density = np.sum(roi > 0) / (w * h) if w * h > 0 else 0
                
                if 0.1 < density < 0.8:  # Text density range
                    structure = EnhancedStructure(
                        type='text_block',
                        x=x,
                        y=y,
                        width=w,
                        height=h,
                        confidence=0.7,
                        metadata={
                            'density': density,
                            'area': w * h
                        },
                        features={
                            'is_paragraph': h > 50,
                            'is_title': h > 30 and w > 200 and density < 0.3
                        }
                    )
                    text_blocks.append(structure)
        
        return text_blocks
    
    def detect_blank_regions(self, gray: np.ndarray) -> List[EnhancedStructure]:
        """
        Detect blank regions suitable for signatures
        """
        blank_regions = []
        height, width = gray.shape
        
        # Focus on signature area
        sig_start = int(height * self.config['signature_zone_start'])
        
        # Grid-based analysis
        grid_size = 50
        min_blank_width = 150
        min_blank_height = 40
        
        for y in range(sig_start, height - min_blank_height, grid_size):
            for x in range(0, width - min_blank_width, grid_size):
                # Extract region
                region = gray[y:y+min_blank_height, x:x+min_blank_width]
                
                # Calculate statistics
                mean_val = np.mean(region)
                std_val = np.std(region)
                
                # Check if blank (high mean, low std)
                if mean_val > 200 and std_val < 20:
                    structure = EnhancedStructure(
                        type='blank_region',
                        x=x,
                        y=y,
                        width=min_blank_width,
                        height=min_blank_height,
                        confidence=0.6,
                        metadata={
                            'mean_intensity': mean_val,
                            'std_intensity': std_val,
                            'y_percent': (y / height) * 100
                        },
                        features={
                            'is_signature_suitable': True,
                            'in_signature_zone': y > sig_start
                        }
                    )
                    blank_regions.append(structure)
        
        # Cluster nearby blank regions
        if blank_regions:
            blank_regions = self.cluster_structures(blank_regions)
        
        return blank_regions
    
    def detect_signature_zones(self, gray: np.ndarray) -> List[EnhancedStructure]:
        """
        Detect complete signature zones (combination of line + blank area)
        """
        zones = []
        height, width = gray.shape
        
        # Get all detected structures
        lines = self.detect_signature_lines_advanced(gray)
        blanks = self.detect_blank_regions(gray)
        
        # Match lines with nearby blank areas
        for line in lines:
            # Look for blank area above the line
            for blank in blanks:
                if (abs(blank.y + blank.height - line.y) < 50 and
                    blank.x < line.x + line.width and
                    blank.x + blank.width > line.x):
                    
                    # Create signature zone
                    zone = EnhancedStructure(
                        type='signature_zone',
                        x=min(line.x, blank.x),
                        y=blank.y,
                        width=max(line.x + line.width, blank.x + blank.width) - min(line.x, blank.x),
                        height=line.y + line.height - blank.y,
                        confidence=max(line.confidence, blank.confidence),
                        metadata={
                            'has_line': True,
                            'has_blank': True,
                            'y_percent': (blank.y / height) * 100
                        },
                        features={
                            'complete_signature_field': True
                        }
                    )
                    zones.append(zone)
        
        return zones
    
    def score_signature_line(self, x1, y1, x2, y2, darkness, contrast, length, img_width, img_height):
        """
        Score a potential signature line based on multiple factors
        """
        score = 0.0
        
        # Length score (longer is better)
        length_ratio = length / img_width
        if length_ratio > 0.1:
            score += 0.3 * min(length_ratio / 0.5, 1.0)
        
        # Position score (bottom half is better)
        y_position = ((y1 + y2) / 2) / img_height
        if y_position > 0.5:
            score += 0.3 * ((y_position - 0.5) / 0.5)
        
        # Darkness score
        if darkness < 100:
            score += 0.2
        
        # Contrast score
        if contrast > 50:
            score += 0.2
        
        return score
    
    def remove_duplicate_lines(self, lines: List[EnhancedStructure]) -> List[EnhancedStructure]:
        """
        Remove duplicate/overlapping lines
        """
        if not lines:
            return lines
        
        # Sort by y position
        lines.sort(key=lambda l: l.y)
        
        filtered = []
        for line in lines:
            # Check if too close to existing line
            is_duplicate = False
            for existing in filtered:
                if (abs(line.y - existing.y) < 20 and
                    abs(line.x - existing.x) < 50):
                    # Keep the one with higher confidence
                    if line.confidence > existing.confidence:
                        filtered.remove(existing)
                        filtered.append(line)
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                filtered.append(line)
        
        return filtered
    
    def cluster_structures(self, structures: List[EnhancedStructure]) -> List[EnhancedStructure]:
        """
        Cluster nearby structures using DBSCAN
        """
        if len(structures) < 2:
            return structures
        
        # Extract positions
        positions = np.array([[s.x, s.y] for s in structures])
        
        # Cluster
        clustering = DBSCAN(eps=100, min_samples=1).fit(positions)
        
        # Merge clusters
        merged = []
        for cluster_id in set(clustering.labels_):
            cluster_indices = np.where(clustering.labels_ == cluster_id)[0]
            cluster_structs = [structures[i] for i in cluster_indices]
            
            if len(cluster_structs) == 1:
                merged.append(cluster_structs[0])
            else:
                # Merge into single structure
                min_x = min(s.x for s in cluster_structs)
                min_y = min(s.y for s in cluster_structs)
                max_x = max(s.x + s.width for s in cluster_structs)
                max_y = max(s.y + s.height for s in cluster_structs)
                
                merged_struct = EnhancedStructure(
                    type=cluster_structs[0].type,
                    x=min_x,
                    y=min_y,
                    width=max_x - min_x,
                    height=max_y - min_y,
                    confidence=max(s.confidence for s in cluster_structs),
                    metadata={'merged_count': len(cluster_structs)},
                    features={'is_merged': True}
                )
                merged.append(merged_struct)
        
        return merged
    
    def merge_overlapping_structures(self, structures: Dict[str, List[EnhancedStructure]]) -> Dict[str, List[EnhancedStructure]]:
        """
        Merge overlapping structures across types
        """
        # Merge signature_lines with underlines
        if 'signature_lines' in structures and 'underlines' in structures:
            all_lines = structures['signature_lines'] + structures['underlines']
            merged_lines = self.remove_duplicate_lines(all_lines)
            structures['signature_lines'] = merged_lines
            structures['underlines'] = []
        
        return structures
    
    def create_visualization(self, image: np.ndarray, structures: Dict[str, List[EnhancedStructure]]) -> np.ndarray:
        """
        Create annotated visualization of detected structures
        """
        vis = image.copy()
        if len(vis.shape) == 2:
            vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
        
        # Color scheme
        colors = {
            'signature_line': (0, 255, 0),      # Green
            'form_box': (255, 0, 0),            # Blue
            'text_block': (0, 0, 255),          # Red
            'blank_region': (255, 255, 0),      # Cyan
            'underline': (0, 255, 255),         # Yellow
            'signature_zone': (255, 0, 255)     # Magenta
        }
        
        # Draw each structure
        for struct_type, items in structures.items():
            color = colors.get(struct_type, (128, 128, 128))
            
            for struct in items:
                # Draw rectangle
                cv2.rectangle(
                    vis,
                    (struct.x, struct.y),
                    (struct.x + struct.width, struct.y + struct.height),
                    color,
                    2
                )
                
                # Add confidence label
                label = f"{struct.confidence:.2f}"
                cv2.putText(
                    vis,
                    label,
                    (struct.x, max(10, struct.y - 5)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.4,
                    color,
                    1
                )
        
        # Add legend
        y_offset = 30
        for struct_type, color in colors.items():
            cv2.rectangle(vis, (10, y_offset - 15), (30, y_offset - 5), color, -1)
            cv2.putText(
                vis,
                struct_type,
                (40, y_offset - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1
            )
            y_offset += 25
        
        return vis
    
    def export_to_json(self, structures: Dict[str, List[EnhancedStructure]]) -> str:
        """
        Export structures to JSON format
        """
        export_data = {}
        for struct_type, items in structures.items():
            export_data[struct_type] = [item.to_dict() for item in items]
        
        return json.dumps(export_data, indent=2)


# Convenience functions
def process_document_enhanced(image_path_or_bytes, page_num: int = 1):
    """
    Process document with enhanced CV detection
    """
    # Load image
    if isinstance(image_path_or_bytes, str):
        image = cv2.imread(image_path_or_bytes)
    elif isinstance(image_path_or_bytes, bytes):
        nparr = np.frombuffer(image_path_or_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    else:
        image = image_path_or_bytes
    
    # Process
    detector = EnhancedCVDetector()
    structures = detector.detect_all_structures(image, page_num)
    
    # Create visualization
    vis = detector.create_visualization(image, structures)
    
    # Export data
    json_data = detector.export_to_json(structures)
    
    return structures, vis, json_data