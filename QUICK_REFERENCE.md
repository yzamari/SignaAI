# SignaAI Codebase - Quick Reference Guide

## Key Files by Function

### Overlay Generation & Visualization
- **Core Overlay Logic**: `/home/user/SignaAI/backend/services/document_processing_service.py` (lines 242-302)
  - `_generate_overlay_images()` - Draws colored rectangles on images
  - `_get_field_color()` - Maps field types to colors
  
- **OCR Visualization**: `/home/user/SignaAI/backend/services/ocr_field_detection/api.py` (lines 207-306)
  - `add_visualizations()` - Converts OCR results to visual overlays using OpenCV

### Field Detection & OCR
- **OCR Detection Engine**: `/home/user/SignaAI/backend/services/ocr_field_detection/ocr_detector.py`
  - `detect_fillable_fields_from_bytes()` - Main OCR detection method
  - `detect_lines_and_boxes()` - Detects form structure
  - `preprocess_image()` - Prepares images for OCR
  
- **Text Filtering**: `/home/user/SignaAI/backend/services/ocr_field_detection/enhanced_text_remover.py`
  - Removes text while preserving form structure

### API Endpoints
- **Document Processing**: `/home/user/SignaAI/backend/routers/document_processing.py`
  - `POST /api/v1/documents/upload-and-process` - Main upload/process endpoint
  - `GET /api/v1/documents/workflow/{id}/pages` - Get document pages
  - `GET/POST/PUT/DELETE /api/v1/documents/workflow/{id}/fields` - Field management

### Frontend Components
- **Field Management UI**: `/home/user/SignaAI/signa-app/src/components/FieldManagementPDFViewer.tsx`
  - Main component for field visualization and interaction
  
- **PDF Viewing**: `/home/user/SignaAI/signa-app/src/components/PDFViewer.tsx`
  - Basic PDF viewer with OCR integration
  
- **Signature Capture**: `/home/user/SignaAI/signa-app/src/components/SignatureOverlay.tsx`
  - Modal for signature/initial capture (draw, type, upload modes)

### Database & Models
- **Field Model (TypeScript)**: `/home/user/SignaAI/backend/services/document-service/src/models/Field.ts`
  - Complete field domain model with validation
  
- **Workflow Schema**: `/home/user/SignaAI/backend/schemas/workflow.py`
  - Field type enums and validation schemas
  
- **Database Schema**: `/home/user/SignaAI/backend/src/db/database.ts`
  - Table definitions for documents, workflows, fields, signers

## Coordinate System

```
PDF Page
┌─────────────────────────────────┐
│ (0,0)                           │
│   ┌─────────────────────┐       │
│   │ Field Overlay       │       │ Height of page
│   │ (x, y, w, h)        │       │
│   │ Color-coded         │       │
│   │ Semi-transparent    │       │
│   └─────────────────────┘       │
│                                 │
└─────────────────────────────────┘
  Width of page

Units: Pixels
DPI: 200 (standard for all conversions)
Origin: Top-left (0,0)
```

## Field Types & Colors

| Type | Color | RGB | Size (default) |
|------|-------|-----|----------------|
| Signature | Blue | (0, 0, 255) | 200x60 |
| Initial | Light Blue | (0, 128, 255) | 80x40 |
| Date | Orange | (255, 165, 0) | 120x30 |
| Text | Green | (0, 255, 0) | 160x30 |
| Checkbox | Purple | (128, 0, 128) | 20x20 |
| Name | Magenta | (255, 0, 255) | - |
| Email | Yellow | (255, 255, 0) | - |
| Phone | Cyan | (0, 255, 255) | - |

## Data Structures

### DocumentField (Python)
```python
@dataclass
class DocumentField:
    id: str                           # e.g., "ocr-1-0"
    type: str                         # signature, date, text, etc.
    page: int                         # 1-based page number
    x: float                          # Left position in pixels
    y: float                          # Top position in pixels
    width: float                      # Width in pixels
    height: float                     # Height in pixels
    label: Optional[str]              # Display name
    required: bool                    # Is field mandatory?
    confidence: Optional[float]       # OCR confidence (0-1)
    detected_by_ocr: bool             # Auto-detected or manual?
    signer_id: Optional[str]          # UUID of signer
    value: Optional[str]              # Current/filled value
    filled_at: Optional[datetime]     # When was it filled?
```

### OCRField (TypeScript/Frontend)
```typescript
export interface OCRField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'initial';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  confidence: number;
  required: boolean;
  value?: string;
  signatureData?: string;
}
```

## Processing Pipeline

```
┌─ Upload PDF
│
├─ PDF to Images (200 DPI)
│  └─> PIL Image objects
│
├─ OCR Field Detection (async)
│  ├─> Tesseract OCR
│  ├─> OpenCV line detection
│  ├─> Text filtering
│  └─> Returns: fields with bounding boxes
│
├─ Overlay Image Generation
│  ├─> For each page:
│  │  ├─ Copy page image
│  │  ├─ Draw field rectangles
│  │  ├─ Add labels
│  │  └─ Save as RGBA PNG
│  └─> Returns: overlay images
│
├─ Data Storage
│  ├─ Save original PDF
│  ├─ Save page images
│  ├─ Save fields.json
│  └─ Create database records
│
└─ Response to Frontend
   ├─ Page images (base64)
   ├─ Field metadata
   ├─ Processing stats
   └─> Ready for editing/signing
```

## Important Settings & Constants

| Setting | Value | Location |
|---------|-------|----------|
| OCR DPI | 200 | `ocr_detector.py:110` |
| PDF DPI | 200 | `document_processing_service.py:201` |
| Overlay Alpha | 50 | `document_processing_service.py:268` |
| Border Width | 2 | `document_processing_service.py:269` |
| OCR Endpoint | `http://localhost:5113` | `document_processing_service.py:69` |
| Frontend Port | 5114 | `signa-app/package.json` |
| Backend Port | 5000 | `main.py` |

## Performance Targets

| Operation | Time | Dependencies |
|-----------|------|--------------|
| PDF → Images | 2-5s | pdf2image, document size |
| OCR Detection | 3-10s | Document complexity |
| Overlay Generation | <1s/page | Number of fields |
| Full Processing | 5-15s | All above combined |

## Common Tasks

### Add Support for New Field Type
1. Add to `FieldType` enum in `/backend/schemas/workflow.py`
2. Add color mapping to `_get_field_color()` in `document_processing_service.py`
3. Add template to `FIELD_TEMPLATES` in `FieldManagementPDFViewer.tsx`
4. Update database schema if needed

### Improve OCR Accuracy
1. Adjust DPI in `ocr_detector.py` (currently 200)
2. Tune image preprocessing parameters in `preprocess_image()`
3. Adjust connectivity thresholds in `EnhancedTextRemover`
4. Add more test documents to training set

### Customize Overlay Colors
1. Modify `_get_field_color()` in `document_processing_service.py` (backend)
2. Update field templates in `FieldManagementPDFViewer.tsx` (frontend)
3. Ensure colors remain distinctive for accessibility

### Handle Field Updates
1. Update field in database via PUT endpoint
2. Call `POST .../regenerate-overlays` endpoint (currently TODO)
3. Frontend re-renders with updated positions
4. Save updated coordinates

## Debugging Tips

### OCR Issues
- Check `/tmp/ocr_test_results.json` for detailed results
- Run `test_ocr_clean.py` for testing
- Check image preprocessing in `ocr_detector.py`

### Overlay Position Issues
- Verify DPI consistency (200 standard)
- Check coordinate mapping in frontend calculations
- Ensure page dimensions match between OCR and rendering
- Look for zoom/scaling issues in frontend

### Performance Issues
- Monitor PDF file size (max 10MB by default)
- Check OCR service response times
- Profile image processing stages
- Consider parallel page processing

## Testing Files
- `capture-document-overlay-manual.py` - Manual overlay capture
- `capture-overlay-screenshots.py` - Screenshot automation
- `ocr_comprehensive_test.py` - OCR testing
- `test-e2e-sender-flow.py` - End-to-end flow

## Environment Variables

```env
OCR_SERVICE_URL=http://localhost:5113
DOCUMENT_STORAGE_PATH=/tmp/signaai_docs
MAX_FILE_SIZE_MB=10
DATABASE_URL=./signaai.db
SECRET_KEY=super-secret-key-for-production-2024
GEMINI_API_KEY=your-gemini-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
```

## Port Assignments

| Service | Port | Technology |
|---------|------|-----------|
| Frontend (signa-app) | 5114 | Next.js |
| Main Backend | 5000 | FastAPI |
| API Gateway | 5100 | Express |
| Auth Service | 5001 | Express |
| Document Service | 5002 | Express |
| Signature Service | 5003 | Express |
| Notification Service | 5004 | Express |
| Workflow Service | 5005 | Express |
| OCR Service | 5113 | FastAPI |

