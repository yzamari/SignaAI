# SignaAI Codebase - Comprehensive Overview

## 1. Overall Architecture

SignaAI is a document processing and digital signature application with a hybrid architecture combining:

- **Frontend**: Next.js 15 React application (TypeScript)
- **Backend**: Microservices architecture with Python (FastAPI) and TypeScript (Express/Node.js)
- **Database**: SQLite3 with optional PostgreSQL support
- **OCR Processing**: Dedicated service using Tesseract OCR + OpenCV + Python image processing

### Directory Structure
```
/home/user/SignaAI/
├── signa-app/                          # Next.js frontend (port 5114)
│   ├── src/
│   │   ├── app/                        # Next.js app directory
│   │   │   ├── auth/                   # Authentication pages
│   │   │   ├── documents/              # Document listing
│   │   │   ├── upload/                 # Document upload
│   │   │   ├── sign/                   # Signing interface
│   │   │   └── ...
│   │   ├── components/                 # React components
│   │   │   ├── FieldManagementPDFViewer.tsx   # Main overlay management
│   │   │   ├── PDFViewer.tsx                  # Basic PDF viewer
│   │   │   ├── SignatureOverlay.tsx           # Signature modal
│   │   │   ├── ImageDocumentViewer.tsx        # Image viewer
│   │   │   └── ...
│   │   └── lib/                        # Utilities and API client
│   └── package.json
│
├── backend/                            # Python FastAPI backend
│   ├── main.py                         # Main FastAPI app (port 5000)
│   ├── routers/
│   │   └── document_processing.py      # Document processing endpoints
│   ├── services/
│   │   ├── document_processing_service.py    # Core overlay generation
│   │   ├── ocr_field_detection/             # OCR service (port 5113)
│   │   │   ├── api.py                       # OCR API endpoints
│   │   │   ├── ocr_detector.py              # OCR detection logic
│   │   │   ├── enhanced_text_remover.py     # Text filtering
│   │   │   └── line_validator.py            # Line detection
│   │   ├── workflow_service.py
│   │   ├── auth_service.py
│   │   └── notification_service.py
│   ├── services/
│   │   ├── api-gateway/                # TypeScript API Gateway (port 5100)
│   │   ├── auth-service/               # TypeScript Auth Service (port 5001)
│   │   ├── document-service/           # TypeScript Document Service (port 5002)
│   │   │   └── src/models/
│   │   │       ├── Field.ts            # Field domain model
│   │   │       ├── Document.ts         # Document model
│   │   │       └── DocumentMetadata.ts
│   │   ├── signature-service/          # TypeScript Signature Service (port 5003)
│   │   ├── workflow-service/           # TypeScript Workflow Service (port 5005)
│   │   └── notification-service/       # TypeScript Notification Service (port 5004)
│   ├── schemas/
│   │   └── workflow.py                 # Pydantic schemas
│   ├── requirements.txt                # Python dependencies
│   └── package.json                    # TypeScript dependencies
│
├── capture-*.py                        # E2E testing/screenshot scripts
└── test-*.py                           # Test scripts
```

---

## 2. Overlay-Related Code Locations

Overlay functionality is distributed across multiple components:

### 2.1 Backend Overlay Generation
**File**: `/home/user/SignaAI/backend/services/document_processing_service.py`

Key Class: `DocumentProcessingService`

**Key Methods**:
- `process_document()` - Main entry point that orchestrates the entire process
- `_generate_overlay_images()` - Generates visual overlays on document images
- `_get_field_color()` - Maps field types to colors for visualization

**Overlay Generation Logic** (lines 242-288):
```python
def _generate_overlay_images(
    self,
    page_images: List[Image.Image],
    fields: List[DocumentField]
) -> List[Image.Image]:
    """
    1. Creates a copy of each page image
    2. Uses PIL ImageDraw to draw colored rectangles for each field
    3. Adds field labels with backgrounds
    4. Returns images with semi-transparent overlays (RGBA with alpha=50)
    """
```

**Field Colors Mapping** (lines 290-302):
- Signature: Blue (0, 0, 255)
- Initial: Light Blue (0, 128, 255)
- Date: Orange (255, 165, 0)
- Text: Green (0, 255, 0)
- Checkbox: Purple (128, 0, 128)
- Name: Magenta (255, 0, 255)
- Email: Yellow (255, 255, 0)
- Phone: Cyan (0, 255, 255)

### 2.2 OCR Visualization Overlays
**File**: `/home/user/SignaAI/backend/services/ocr_field_detection/api.py`

Function: `add_visualizations()` (lines 207-306)

**Purpose**: Adds base64-encoded overlay images to OCR results

**Features**:
- Converts detected fields to overlays using OpenCV
- Draws rectangles and labels on PDF page images
- Returns both original and overlayed images in base64 format
- Calculates field coverage percentage and field type counts

### 2.3 Frontend Field Management with Overlays
**File**: `/home/user/SignaAI/signa-app/src/components/FieldManagementPDFViewer.tsx`

Main Component: `FieldManagementPDFViewer`

**Key Features**:
- Displays PDF pages with interactive overlay fields
- Allows dragging fields to reposition them
- Provides field editing and deletion
- Shows field visibility toggle
- Implements zoom controls
- Supports field templates for different types

**Field Templates** (lines 72-118):
```typescript
- signature: 200x60px, green
- initial: 80x40px, blue
- date: 120x30px, orange
- text: 160x30px, purple
- checkbox: 20x20px, red
```

### 2.4 Signature Overlay Modal
**File**: `/home/user/SignaAI/signa-app/src/components/SignatureOverlay.tsx`

**Purpose**: Modal dialog for capturing signatures/initials

**Three Modes**:
1. Draw - Signature canvas drawing
2. Type - Text-based signature
3. Upload - Image upload

---

## 3. Overlay Positioning and Rendering

### 3.1 Coordinate System

**Backend** (`DocumentField` dataclass):
```python
@dataclass
class DocumentField:
    x: float        # Absolute pixel coordinates (left edge)
    y: float        # Absolute pixel coordinates (top edge)
    width: float    # Field width in pixels
    height: float   # Field height in pixels
    page: int       # Page number (1-based)
    confidence: Optional[float]  # OCR confidence 0-1
```

**Frontend** (`OCRField` interface):
```typescript
export interface OCRField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'initial';
  x: number;        // Pixel position
  y: number;        // Pixel position
  width: number;    // Pixel dimensions
  height: number;   // Pixel dimensions
  page: number;     // Page number
  confidence: number;
  required: boolean;
}
```

### 3.2 Rendering Process

**Backend Flow**:
1. PDF uploaded → OCR service detects fields
2. Fields returned with bounding boxes (x, y, width, height)
3. PDF converted to images at 200 DPI (via pdf2image)
4. PIL.ImageDraw used to overlay rectangles at field coordinates
5. Semi-transparent fills (RGBA with alpha channel)
6. Images converted to base64 and returned to frontend

**Frontend Flow**:
1. Images received as base64 data URLs
2. Rendered in iframe or canvas elements
3. Overlay canvas positioned absolutely over image
4. Mouse events capture field interactions
5. Dragging updates field coordinates in real-time
6. Changes reflected in overlay rendering

### 3.3 DPI and Scaling

**Critical Detail**: Different DPI settings affect coordinate accuracy

- **OCR Detector**: Uses 200 DPI for PDF-to-image conversion
- **PDF Rendering**: Images scaled to fit viewport
- **Coordinate Mapping**: Frontend must account for scaling when updating field positions

Example from `ocr_detector.py` (line 110):
```python
images = self._convert_pdf_bytes_to_images(pdf_bytes, dpi=200)
```

---

## 4. Fields Being Filled in Overlays

### 4.1 Field Types

Defined in `/home/user/SignaAI/backend/schemas/workflow.py`:

```python
class FieldType(str, Enum):
    SIGNATURE = "signature"
    INITIAL = "initial"
    DATE = "date"
    TEXT = "text"
    CHECKBOX = "checkbox"
    NAME = "name"
    EMAIL = "email"
    PHONE = "phone"
```

### 4.2 Field Properties

From `DocumentField` dataclass (backend) and `Field` model (TypeScript):

**Core Properties**:
- `id`: Unique identifier (UUID format)
- `type`: Field type (see above)
- `page`: Page number where field appears
- `x, y, width, height`: Positioning information
- `label`: Display label/name for the field
- `required`: Whether field is mandatory
- `confidence`: OCR detection confidence (0-1)
- `signer_id`: UUID of signer assigned to field
- `value`: Current value filled in field
- `filled_at`: Timestamp when field was filled

**Validation Properties** (TypeScript Field model):
- `validationRules`: Array of validation rules
- `placeholder`: Placeholder text for empty fields
- `description`: Field description
- `readonly`: Whether field can be edited
- `defaultValue`: Default value if not filled
- `options`: For select/radio fields
- `order`: Field ordering/sequence

### 4.3 Field Status Tracking

**Document State**:
```python
"fields": [
    {
        "id": "ocr-1-0",
        "type": "signature",
        "page": 1,
        "x": 100.5,
        "y": 200.5,
        "width": 200.0,
        "height": 60.0,
        "label": "Customer Signature",
        "required": True,
        "confidence": 0.95,
        "detected_by_ocr": True,
        "signer_id": "user-123",
        "value": None,  # Not yet filled
        "filled_at": None
    }
]
```

---

## 5. PDF Processing and Document Handling

### 5.1 Document Processing Flow

**File**: `/home/user/SignaAI/backend/services/document_processing_service.py`

**Main Pipeline** (`process_document()` method, lines 78-171):

```
1. OCR Field Detection
   └─> Call OCR service at http://localhost:5113/detect-fields
   └─> Returns: analysis_results with detected fields per page

2. PDF to Images Conversion
   └─> pdf2image.convert_from_bytes() at 200 DPI
   └─> Returns: List of PIL.Image objects

3. OCR Results Processing
   └─> Convert OCR results to DocumentField objects
   └─> Extract bounding boxes for each detected field

4. Overlay Image Generation
   └─> Draw field rectangles on page images
   └─> Add labels with backgrounds
   └─> Return RGBA images with transparency

5. Document Data Storage
   └─> Save original PDF
   └─> Save page images (original + overlay)
   └─> Save fields metadata as JSON
   └─> Store in database (workflow/document records)
```

### 5.2 API Endpoints for Document Processing

**File**: `/home/user/SignaAI/backend/routers/document_processing.py`

Key Endpoints:

**1. Upload and Process Document**
```
POST /api/v1/documents/upload-and-process
Content-Type: multipart/form-data
- file: PDF file
- workflow_id: (optional) existing workflow UUID

Response:
{
  "document_id": string,
  "workflow_id": string,
  "status": "processed",
  "processing_time_seconds": float,
  "total_pages": int,
  "total_fields": int,
  "ocr_fields_count": int,
  "manual_fields_count": int,
  "pages": [
    {
      "page_number": int,
      "width": int,
      "height": int,
      "original_image": "data:image/png;base64,...",
      "overlay_image": "data:image/png;base64,...",
      "fields_count": int,
      "field_ids": [string]
    }
  ],
  "fields": [DocumentField objects]
}
```

**2. Get Document Pages**
```
GET /api/v1/documents/workflow/{workflow_id}/pages
Query Parameters:
- include_images: boolean (default: true)

Response:
{
  "pages": [Page objects with images],
  "total": int
}
```

**3. Get Workflow Fields**
```
GET /api/v1/documents/workflow/{workflow_id}/fields
Query Parameters:
- page: int (optional)
- field_type: string (optional)

Response:
{
  "fields": [Field objects],
  "total": int
}
```

**4. Field Management Endpoints**
```
POST /api/v1/documents/workflow/{workflow_id}/fields
  → Add new field

PUT /api/v1/documents/workflow/{workflow_id}/fields/{field_id}
  → Update field position/properties

DELETE /api/v1/documents/workflow/{workflow_id}/fields/{field_id}
  → Remove field

POST /api/v1/documents/workflow/{workflow_id}/regenerate-overlays
  → Regenerate all overlay images
```

### 5.3 Database Schema

**File**: `/home/user/SignaAI/backend/src/db/database.ts`

**Key Tables**:

1. **documents**
   - id, title, file_path, status, owner_id
   - created_at, updated_at

2. **workflows**
   - id, document_id, type, deadline, status
   - created_at, updated_at

3. **signature_fields** (Field records in workflows)
   - id, workflow_id, signer_id
   - type, page, x, y, width, height
   - value, required
   - created_at

4. **signers**
   - id, workflow_id, name, email, phone
   - status, signed_at, signature_data, token

### 5.4 OCR Service Details

**File**: `/home/user/SignaAI/backend/services/ocr_field_detection/ocr_detector.py`

**Detection Algorithm**:

```python
class OCRFieldDetector:
    def detect_fillable_fields_from_bytes(self):
        """
        1. Convert PDF bytes to images (200 DPI)
        2. For each page:
           a. Preprocess image (grayscale, binarization, denoising)
           b. Detect lines and boxes using enhanced text removal
           c. Filter out letter strokes using connectivity analysis
           d. Convert visual fields to fillable form fields
        3. Return structured field data
        """
```

**Text Removal Techniques**:
- `EnhancedTextRemover`: Uses connectivity analysis to distinguish form lines from text
- `LineValidator`: Validates detected lines
- Filters out small components that are likely letter strokes
- Maintains actual form structure (boxes, lines for signatures/text)

**Output Format**:
```python
{
  "analysis_results": [
    {
      "page": 1,
      "fields": [
        {
          "type": "text_input" | "checkbox" | "signature",
          "confidence": 0.0-1.0,
          "bounding_box": {
            "x": float,
            "y": float,
            "width": float,
            "height": float
          },
          "label": string (optional)
        }
      ],
      "original_image": "data:image/png;base64,...",
      "overlayed_image": "data:image/png;base64,...",
      "overlay_summary": {
        "total_fields": int,
        "field_types": {...},
        "coverage_percentage": float
      }
    }
  ],
  "total_fields": int,
  "processing_time_ms": float,
  "visualization_summary": {...}
}
```

---

## 6. Key Technologies and Dependencies

### Frontend (Next.js/React)
```json
{
  "next": "15.5.3",
  "react": "19.1.0",
  "framer-motion": "^12.23.13",
  "react-signature-canvas": "^1.1.0-alpha.2",
  "lucide-react": "^0.544.0",
  "zustand": "^5.0.8"
}
```

### Backend (Python)
```
fastapi==0.104.1
uvicorn==0.24.0
pdf2image==1.16.x  (implicitly required)
PIL/Pillow==9.x+   (implicitly required)
opencv-python==4.x+ (implicitly required)
pytesseract==0.3.x (implicitly required)
```

### Backend (TypeScript/Node)
```json
{
  "express": "^5.1.0",
  "typescript": "^5.9.2",
  "sqlite3": "^5.1.7",
  "jsonwebtoken": "^9.0.2"
}
```

---

## 7. Data Flow Diagram

```
User Uploads PDF
        ↓
[Frontend] File input → FormData
        ↓
POST /api/v1/documents/upload-and-process
        ↓
[Document Processing Service]
    ↓
    1. Call OCR Service (port 5113)
    ↓
    [OCR Detector Service]
    - PDF to images (200 DPI)
    - Detect fields with CV
    - Add visualizations
    ↓
    2. Process OCR Results
    ↓
    3. Convert PDF to images (200 DPI)
    ↓
    4. Generate Overlay Images
    - Draw colored rectangles
    - Add labels
    - Create semi-transparent fills
    ↓
    5. Store Data
    - Save PDF
    - Save images
    - Store fields metadata
    - Create database records
    ↓
Response with Document Data
    ↓
[Frontend] Receive:
- Page images (original + overlay)
- Field metadata
- Images as base64 data URLs
    ↓
Render PDF Viewer with Overlays
- Display page images
- Overlay field boxes
- Enable field editing
- Allow signing
```

---

## 8. Important Notes

### Overlay Quality Considerations
1. **DPI Matters**: All components use 200 DPI for consistency
2. **Coordinate Accuracy**: Fields positioned in absolute pixel coordinates
3. **Transparency**: Overlays use alpha channel for visibility
4. **Scaling**: Frontend must handle zoom levels and viewport resizing
5. **Field Coverage**: OCR can detect field areas, but accuracy depends on document quality

### Known Limitations/TODOs
- Overlay regeneration not fully implemented (marked as TODO in code)
- Field position updates require manual coordinate recalculation
- No automatic field repositioning when page is rotated/scaled
- Text label positioning hardcoded relative to field bounds

### Performance Characteristics
- PDF to image conversion: ~2-5 seconds for multi-page documents
- OCR field detection: ~3-10 seconds depending on document complexity
- Overlay generation: <1 second per page
- Total processing time: typically 5-15 seconds

---

## 9. Frontend Component Architecture

### FieldManagementPDFViewer Component
Main file: `/home/user/SignaAI/signa-app/src/components/FieldManagementPDFViewer.tsx`

**Key State Variables**:
- `fields`: Array of fields with full metadata
- `selectedField`: Currently selected field ID
- `draggedField`: Field being dragged
- `fieldsVisible`: Toggle field visibility
- `currentPage`: Current page being viewed
- `zoom`: Current zoom level
- `ocrResults`: Results from OCR service
- `viewerDimensions`: Viewport size for calculations

**Key Props**:
- `file` or `url`: PDF source
- `onFieldsChanged`: Callback when fields modified
- `onFieldSigned`: Callback when field signed
- `enableSigning`: Allow signature capture
- `enableEditing`: Allow field editing
- `readonly`: View-only mode

**Interactions Handled**:
- Drag to move fields
- Click to select field
- Resize field boundaries
- Add new fields from templates
- Edit field properties
- Delete fields
- Zoom in/out
- Toggle field visibility
- Capture screenshots

---

## 10. Summary

SignaAI implements a comprehensive overlay system for document field management:

1. **OCR Detection**: Uses computer vision to identify form fields
2. **Visualization**: Creates color-coded overlays showing field positions
3. **Interaction**: Frontend allows dragging, editing, and signing fields
4. **Storage**: Maintains precise field coordinates and metadata
5. **Flexibility**: Supports manual field addition and repositioning
6. **Quality**: Uses consistent DPI and coordinate systems throughout

The architecture separates concerns effectively with dedicated services for OCR detection, document processing, and frontend visualization.
