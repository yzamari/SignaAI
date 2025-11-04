# Document Management API Documentation

## Overview

The Document Management API provides comprehensive functionality for uploading, processing, and managing documents in the SignaAI digital signature platform. This API supports PDF, DOCX, DOC, and various image formats with advanced security scanning, metadata extraction, and multi-language support.

## Authentication

All endpoints require JWT authentication via Bearer token:

```http
Authorization: Bearer <jwt_token>
```

## Base URL

```
/api/v1/documents
```

## Endpoints

### 1. Upload Document

Upload a document for signature processing with comprehensive validation and security scanning.

**Endpoint:** `POST /upload`

**Content-Type:** `multipart/form-data`

**Parameters:**
- `file` (required): Document file to upload
- `title` (optional): Custom document title (defaults to filename)
- `extract_metadata` (optional): Extract metadata immediately (default: true)

**Supported File Types:**
- PDF: `application/pdf` (max 50MB)
- DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (max 25MB)
- DOC: `application/msword` (max 25MB)
- Images: `image/jpeg`, `image/png`, `image/tiff`, `image/bmp`, `image/webp` (max 10-15MB)

**Request Example:**
```bash
curl -X POST "/api/v1/documents/upload" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@document.pdf" \
  -F "title=Contract Agreement" \
  -F "extract_metadata=true"
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Contract Agreement",
  "original_filename": "document.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "status": "uploaded",
  "language_detected": "en",
  "page_count": 5,
  "virus_scan_status": "clean",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "processing_completed_at": null
}
```

**Error Responses:**
- `400 Bad Request`: File validation failed or security threats detected
- `401 Unauthorized`: Invalid or missing authentication token
- `413 Payload Too Large`: File size exceeds limits
- `415 Unsupported Media Type`: File type not supported
- `500 Internal Server Error`: Upload processing failed

### 2. List Documents

Retrieve user's documents with pagination, filtering, and search capabilities.

**Endpoint:** `GET /`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `per_page` (optional): Items per page, max 100 (default: 20)
- `status` (optional): Filter by document status
- `search` (optional): Search in title and filename

**Available Status Values:**
- `uploaded`: Recently uploaded, awaiting processing
- `processing`: Currently being processed
- `ready`: Ready for signature workflow
- `signed`: Completed with signatures
- `error`: Processing failed
- `deleted`: Soft deleted documents

**Request Example:**
```bash
curl -X GET "/api/v1/documents/?page=1&per_page=10&status=ready&search=contract" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "documents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Contract Agreement",
      "original_filename": "contract.pdf",
      "file_size": 2048576,
      "mime_type": "application/pdf",
      "status": "ready",
      "language_detected": "en",
      "page_count": 5,
      "virus_scan_status": "clean",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "processing_completed_at": "2024-01-15T10:32:00Z"
    }
  ],
  "total": 25,
  "page": 1,
  "per_page": 10,
  "has_more": true
}
```

### 3. Get Document Details

Retrieve detailed information about a specific document.

**Endpoint:** `GET /{document_id}`

**Request Example:**
```bash
curl -X GET "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Contract Agreement",
  "original_filename": "contract.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "status": "ready",
  "language_detected": "en",
  "page_count": 5,
  "virus_scan_status": "clean",
  "metadata": {
    "extracted_metadata": {
      "extraction_status": "success",
      "document_type": "pdf",
      "language": {
        "primary_language": "en",
        "confidence": 0.95,
        "rtl_content": false
      },
      "structure": {
        "page_count": 5,
        "is_encrypted": false
      },
      "content": {
        "total_text_length": 2500,
        "has_text_content": true
      }
    }
  },
  "processing_error": null,
  "signature_field_count": 3,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "processing_completed_at": "2024-01-15T10:32:00Z"
}
```

**Error Responses:**
- `404 Not Found`: Document not found or access denied
- `401 Unauthorized`: Invalid authentication

### 4. Update Document

Update document metadata (currently supports title only).

**Endpoint:** `PUT /{document_id}`

**Query Parameters:**
- `title` (required): New document title

**Request Example:**
```bash
curl -X PUT "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000?title=Updated%20Contract" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Updated Contract",
  "original_filename": "contract.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "status": "ready",
  "language_detected": "en",
  "page_count": 5,
  "virus_scan_status": "clean",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T11:00:00Z",
  "processing_completed_at": "2024-01-15T10:32:00Z"
}
```

### 5. Delete Document

Permanently delete a document and its associated files.

**Endpoint:** `DELETE /{document_id}`

**Request Example:**
```bash
curl -X DELETE "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "message": "Document deleted successfully"
}
```

**Error Responses:**
- `404 Not Found`: Document not found or access denied
- `500 Internal Server Error`: Deletion failed

### 6. Download Document

Get a secure, time-limited download URL for the original document.

**Endpoint:** `GET /{document_id}/download`

**Request Example:**
```bash
curl -X GET "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000/download" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "download_url": "https://storage.example.com/documents/secure-url?token=abc123",
  "filename": "contract.pdf",
  "expires_in": 3600
}
```

### 7. Document Preview

Generate a thumbnail/preview image of a document page.

**Endpoint:** `GET /{document_id}/preview`

**Query Parameters:**
- `page` (optional): Page number to preview (default: 1)

**Request Example:**
```bash
curl -X GET "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000/preview?page=1" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
- Content-Type: `image/png`
- Binary image data (PNG format)
- Cache-Control: `public, max-age=3600`

### 8. Process Document

Trigger document processing for metadata extraction and signature field detection.

**Endpoint:** `POST /{document_id}/process`

**Query Parameters:**
- `extract_metadata` (optional): Extract comprehensive metadata (default: true)
- `detect_signature_fields` (optional): Detect signature fields via AI (default: false, coming soon)

**Request Example:**
```bash
curl -X POST "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000/process?extract_metadata=true" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "message": "Document processing completed",
  "status": "ready",
  "metadata_extracted": true,
  "signature_detection_queued": false,
  "processing_completed_at": "2024-01-15T10:32:00Z"
}
```

### 9. Get Signature Fields

Retrieve signature fields for a document.

**Endpoint:** `GET /{document_id}/signature-fields`

**Request Example:**
```bash
curl -X GET "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000/signature-fields" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
[
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "document_id": "550e8400-e29b-41d4-a716-446655440000",
    "field_type": "signature",
    "page_number": 1,
    "x_position": 0.1,
    "y_position": 0.8,
    "width": 0.3,
    "height": 0.1,
    "is_required": true,
    "field_label": "Client Signature",
    "detection_method": "manual",
    "detection_confidence": 1.0,
    "signer_role": "client",
    "created_at": "2024-01-15T11:00:00Z"
  }
]
```

### 10. Create Signature Field

Add a signature field to a document.

**Endpoint:** `POST /{document_id}/signature-fields`

**Request Body:**
```json
{
  "field_type": "signature",
  "page_number": 1,
  "x_position": 0.1,
  "y_position": 0.8,
  "width": 0.3,
  "height": 0.1,
  "is_required": true,
  "field_label": "Client Signature",
  "signer_role": "client"
}
```

**Field Types:**
- `signature`: Digital signature field
- `initial`: Initial field
- `date`: Date field
- `text`: Text input field
- `checkbox`: Checkbox field

**Request Example:**
```bash
curl -X POST "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000/signature-fields" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "field_type": "signature",
    "page_number": 1,
    "x_position": 0.1,
    "y_position": 0.8,
    "width": 0.3,
    "height": 0.1,
    "is_required": true,
    "field_label": "Client Signature",
    "signer_role": "client"
  }'
```

**Response (201 Created):**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "field_type": "signature",
  "page_number": 1,
  "x_position": 0.1,
  "y_position": 0.8,
  "width": 0.3,
  "height": 0.1,
  "is_required": true,
  "field_label": "Client Signature",
  "detection_method": "manual",
  "detection_confidence": 1.0,
  "signer_role": "client",
  "created_at": "2024-01-15T11:30:00Z"
}
```

### 11. Delete Signature Field

Remove a signature field from a document.

**Endpoint:** `DELETE /{document_id}/signature-fields/{field_id}`

**Request Example:**
```bash
curl -X DELETE "/api/v1/documents/550e8400-e29b-41d4-a716-446655440000/signature-fields/660e8400-e29b-41d4-a716-446655440001" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "message": "Signature field deleted successfully"
}
```

## Data Models

### Document Status Lifecycle

```
uploaded → processing → ready → signed
    ↓          ↓         ↓        ↓
   error ←——————————————————————————
```

### Position Coordinates

All position values are relative to page dimensions (0.0 to 1.0):
- `x_position`: Horizontal position (0.0 = left edge, 1.0 = right edge)
- `y_position`: Vertical position (0.0 = top edge, 1.0 = bottom edge)
- `width`: Field width as fraction of page width
- `height`: Field height as fraction of page height

## Security Features

### File Validation
- **Magic Number Detection**: Validates actual file type vs. declared MIME type
- **Size Limits**: Per-type file size restrictions
- **Extension Validation**: Ensures file extension matches content type
- **Content Validation**: Verifies file can be opened and processed

### Security Scanning
- **Malware Detection**: Scans for embedded executables and suspicious content
- **PDF Security**: Detects JavaScript, embedded files, and form exploits
- **Compression Analysis**: Identifies potential zip bombs
- **Macro Detection**: Flags macro-enabled documents

### Data Protection
- **File Integrity**: SHA-256 hashing for tamper detection
- **Secure Storage**: S3-compatible storage with encryption
- **Access Control**: JWT-based authentication and user ownership validation
- **Audit Logging**: Comprehensive activity tracking

## Error Codes

### Client Errors (4xx)
- `400 Bad Request`: Invalid request parameters or file validation failed
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Access denied to resource
- `404 Not Found`: Document or resource not found
- `413 Payload Too Large`: File size exceeds limits
- `415 Unsupported Media Type`: File type not supported
- `422 Unprocessable Entity`: Request validation failed

### Server Errors (5xx)
- `500 Internal Server Error`: General server error
- `503 Service Unavailable`: Processing service temporarily unavailable
- `507 Insufficient Storage`: Storage quota exceeded

## Rate Limits

- Upload: 10 files per minute per user
- API Calls: 1000 requests per hour per user
- Download URLs: 100 per hour per user

## Language Support

The API supports multi-language document processing with automatic language detection:

### Supported Languages
- **English** (en): Full OCR and text analysis
- **Arabic** (ar): RTL text processing, signature keyword detection
- **Hebrew** (he): RTL text processing, Israeli legal compliance
- **Mixed Language**: Documents with multiple languages

### Language Detection Features
- Character-based analysis for RTL languages
- Confidence scoring for detection accuracy
- Cultural formatting support (dates, numbers)

## Usage Examples

### Complete Upload Workflow

```bash
# 1. Upload document
RESPONSE=$(curl -X POST "/api/v1/documents/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@contract.pdf" \
  -F "title=Service Contract" \
  -F "extract_metadata=true")

DOC_ID=$(echo $RESPONSE | jq -r '.id')

# 2. Check processing status
curl -X GET "/api/v1/documents/$DOC_ID" \
  -H "Authorization: Bearer $TOKEN"

# 3. Add signature fields
curl -X POST "/api/v1/documents/$DOC_ID/signature-fields" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "field_type": "signature",
    "page_number": 1,
    "x_position": 0.1,
    "y_position": 0.8,
    "width": 0.3,
    "height": 0.1,
    "field_label": "Client Signature"
  }'

# 4. Get preview
curl -X GET "/api/v1/documents/$DOC_ID/preview?page=1" \
  -H "Authorization: Bearer $TOKEN" \
  --output preview.png
```

### Search and Filter

```bash
# Search for contracts in ready status
curl -X GET "/api/v1/documents/?search=contract&status=ready&page=1&per_page=10" \
  -H "Authorization: Bearer $TOKEN"

# Get all PDFs
curl -X GET "/api/v1/documents/?search=pdf" \
  -H "Authorization: Bearer $TOKEN"
```

## Best Practices

1. **File Upload**:
   - Always validate file types on client-side before upload
   - Show upload progress for better UX
   - Handle upload errors gracefully

2. **Authentication**:
   - Store JWT tokens securely
   - Implement token refresh mechanism
   - Handle 401 errors by redirecting to login

3. **Error Handling**:
   - Parse error responses for user-friendly messages
   - Implement retry logic for temporary failures
   - Log errors for debugging

4. **Performance**:
   - Use pagination for document lists
   - Implement caching for previews
   - Prefetch next page of results

5. **Security**:
   - Always use HTTPS in production
   - Validate file contents before processing
   - Monitor for unusual activity patterns

## Support

For technical support and integration assistance:
- Email: api-support@signaai.com
- Documentation: https://docs.signaai.com
- Status Page: https://status.signaai.com