# Signature Workflow API Documentation - Sprint 4

## Overview

The SignaAI Signature Workflow API provides comprehensive functionality for managing digital signature workflows with multi-channel notifications, real-time progress monitoring, and Israeli Electronic Signature Law compliance.

### Features
- **Sequential and Parallel Workflows**: Support for both signing order types
- **Multi-Channel Notifications**: Email, SMS, and WhatsApp invitations
- **Real-Time Monitoring**: WebSocket-based progress updates
- **Biometric Analysis**: Advanced signature capture with pressure and timing data
- **Legal Compliance**: Israeli Electronic Signature Law requirements
- **Deadline Management**: Automated reminders and escalation

---

## Authentication

All workflow management endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

**Exception**: The signer action endpoint (`POST /sign/{token}`) uses invitation tokens instead of user authentication.

---

## Workflow Management Endpoints

### Create Workflow

Creates a new signature workflow for a document.

```http
POST /api/v1/workflows/
Content-Type: application/json
Authorization: Bearer <token>

{
  "document_id": "uuid",
  "signers": [
    {
      "email": "signer@example.com",
      "full_name": "John Doe",
      "phone": "+1234567890",
      "role": "client"
    }
  ],
  "workflow_type": "parallel",
  "title": "Contract Signature",
  "custom_message": "Please sign this contract",
  "deadline": "2025-01-01T12:00:00Z",
  "require_email_verification": true,
  "require_phone_verification": false,
  "send_invitations_immediately": true,
  "notification_channels": ["email", "sms"]
}
```

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `document_id` | string (UUID) | Yes | Document to be signed |
| `signers` | array | Yes | List of signers (min 1) |
| `workflow_type` | string | No | "sequential" or "parallel" (default: "parallel") |
| `title` | string | No | Workflow title |
| `custom_message` | string | No | Message for signers (max 1000 chars) |
| `deadline` | string (ISO 8601) | No | Signing deadline |
| `require_email_verification` | boolean | No | Require email verification (default: true) |
| `require_phone_verification` | boolean | No | Require phone verification (default: false) |
| `send_invitations_immediately` | boolean | No | Send invitations on creation (default: true) |
| `notification_channels` | array | No | Channels to use: ["email", "sms", "whatsapp"] |

#### Signer Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Valid email address |
| `full_name` | string | Yes | Signer's full name |
| `phone` | string | No | Phone number for SMS/WhatsApp |
| `role` | string | No | Signer role (default: "signer") |

#### Response

```json
{
  "id": "workflow-uuid",
  "document_id": "document-uuid",
  "created_by": "user-uuid",
  "workflow_type": "parallel",
  "status": "active",
  "title": "Contract Signature",
  "custom_message": "Please sign this contract",
  "deadline": "2025-01-01T12:00:00Z",
  "require_email_verification": true,
  "require_phone_verification": false,
  "created_at": "2024-08-26T10:00:00Z",
  "updated_at": "2024-08-26T10:00:00Z",
  "completed_at": null
}
```

---

### Get Workflow Details

Retrieves detailed workflow information including signers and progress.

```http
GET /api/v1/workflows/{workflow_id}
Authorization: Bearer <token>
```

#### Response

```json
{
  "id": "workflow-uuid",
  "document_id": "document-uuid",
  "created_by": "user-uuid",
  "workflow_type": "sequential",
  "status": "active",
  "title": "Contract Signature",
  "custom_message": "Please sign this contract",
  "deadline": "2025-01-01T12:00:00Z",
  "require_email_verification": true,
  "require_phone_verification": false,
  "created_at": "2024-08-26T10:00:00Z",
  "updated_at": "2024-08-26T10:00:00Z",
  "completed_at": null,
  "signers": [
    {
      "id": "signer-uuid",
      "workflow_id": "workflow-uuid",
      "email": "john@example.com",
      "phone": "+1234567890",
      "full_name": "John Doe",
      "role": "client",
      "signing_order": 1,
      "status": "signed",
      "invitation_sent_at": "2024-08-26T10:01:00Z",
      "document_viewed_at": "2024-08-26T10:30:00Z",
      "signed_at": "2024-08-26T10:45:00Z",
      "signer_comments": "Approved",
      "created_at": "2024-08-26T10:00:00Z"
    }
  ],
  "progress_percentage": 33.33,
  "next_action": "Waiting for Jane Smith to sign"
}
```

---

### Start Workflow

Starts a draft workflow and sends initial invitations.

```http
POST /api/v1/workflows/{workflow_id}/start
Authorization: Bearer <token>
```

#### Response

```json
{
  "message": "Workflow started successfully",
  "status": "active",
  "invitations_sent": 3
}
```

---

### Cancel Workflow

Cancels an active workflow.

```http
POST /api/v1/workflows/{workflow_id}/cancel
Content-Type: application/json
Authorization: Bearer <token>

{
  "reason": "Contract terms changed"
}
```

#### Response

```json
{
  "message": "Workflow cancelled successfully"
}
```

---

### List Workflows

Lists user's workflows with filtering and pagination.

```http
GET /api/v1/workflows/?status=active&page=1&per_page=20
Authorization: Bearer <token>
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by workflow status |
| `document_id` | string (UUID) | Filter by document |
| `page` | integer | Page number (default: 1) |
| `per_page` | integer | Items per page (1-100, default: 20) |

#### Response

```json
[
  {
    "id": "workflow-uuid",
    "document_id": "document-uuid",
    "created_by": "user-uuid",
    "workflow_type": "parallel",
    "status": "active",
    "title": "Contract Signature",
    "custom_message": "Please sign this contract",
    "deadline": "2025-01-01T12:00:00Z",
    "require_email_verification": true,
    "require_phone_verification": false,
    "created_at": "2024-08-26T10:00:00Z",
    "updated_at": "2024-08-26T10:00:00Z",
    "completed_at": null
  }
]
```

---

## Real-Time Progress Monitoring

### Get Workflow Progress

Retrieves detailed progress information for real-time monitoring.

```http
GET /api/v1/workflows/{workflow_id}/progress
Authorization: Bearer <token>
```

#### Response

```json
{
  "workflow_id": "workflow-uuid",
  "status": "active",
  "progress": {
    "total_signers": 3,
    "completed_signers": 1,
    "pending_signers": 2,
    "declined_signers": 0,
    "completion_percentage": 33.33
  },
  "timing": {
    "created_at": "2024-08-26T10:00:00Z",
    "elapsed_seconds": 2700,
    "deadline_info": {
      "deadline": "2025-01-01T12:00:00Z",
      "time_remaining_seconds": 8640000,
      "is_overdue": false,
      "urgency_level": "normal"
    }
  },
  "signers": [
    {
      "id": "signer-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "status": "signed",
      "signing_order": 1,
      "invited_at": "2024-08-26T10:01:00Z",
      "viewed_at": "2024-08-26T10:30:00Z",
      "signed_at": "2024-08-26T10:45:00Z"
    }
  ]
}
```

### WebSocket Real-Time Updates

Connect to receive live workflow updates.

```javascript
const ws = new WebSocket('ws://localhost:8000/api/v1/workflows/ws/{workflow_id}?token={jwt_token}');

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Workflow update:', update);
};
```

#### Update Message Types

**Initial State**
```json
{
  "type": "initial_state",
  "workflow_id": "workflow-uuid",
  "status": "active",
  "progress": 33.33,
  "signers": 3,
  "completed": 1,
  "pending": 2
}
```

**Workflow Started**
```json
{
  "type": "workflow_started",
  "workflow_id": "workflow-uuid",
  "status": "active",
  "message": "Workflow started and invitations sent"
}
```

**Signer Action**
```json
{
  "type": "signer_action",
  "workflow_id": "workflow-uuid",
  "signer_id": "signer-uuid",
  "signer_name": "John Doe",
  "action": "signed",
  "status": "active",
  "progress": 66.67
}
```

**Workflow Completed**
```json
{
  "type": "workflow_completed",
  "workflow_id": "workflow-uuid",
  "status": "completed",
  "completion_time": "2024-08-26T12:00:00Z"
}
```

---

## Signer Interaction Endpoints

### Process Signer Action

Handles signer actions (view, sign, decline) using invitation tokens.

```http
POST /api/v1/workflows/sign/{invitation_token}
Content-Type: application/json

{
  "action": "signed",
  "signatures": [
    {
      "field_id": "field-uuid",
      "signature_data": "data:image/png;base64,iVBORw0KGgo...",
      "signature_type": "drawn",
      "biometric_data": {
        "totalStrokes": 5,
        "totalSigningTime": 2500,
        "averageStrokeLength": 45.2,
        "signatureComplexity": 0.75,
        "pressureVariation": 0.3,
        "velocityProfile": [12.5, 8.3, 15.7, 6.2, 9.8],
        "pauseBetweenStrokes": [150, 80, 200, 120],
        "boundingBox": {
          "width": 180,
          "height": 60,
          "aspectRatio": 3.0
        }
      }
    }
  ],
  "device_info": {
    "userAgent": "Mozilla/5.0...",
    "platform": "MacIntel",
    "touchSupported": true,
    "pressureSupported": true
  },
  "comments": "Document approved"
}
```

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | "viewed", "signed", or "declined" |
| `signatures` | array | No | Signature data (required for "signed" action) |
| `device_info` | object | No | Device information for audit trail |
| `comments` | string | No | Signer comments (max 500 chars) |

#### Signature Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field_id` | string (UUID) | Yes | Signature field ID |
| `signature_data` | string | Yes | Base64-encoded signature image |
| `signature_type` | string | No | "drawn", "typed", "uploaded" (default: "drawn") |
| `biometric_data` | object | No | Biometric analysis data |

#### Biometric Data Object

| Field | Type | Description |
|-------|------|-------------|
| `totalStrokes` | number | Number of signature strokes |
| `totalSigningTime` | number | Total time in milliseconds |
| `averageStrokeLength` | number | Average stroke length in pixels |
| `signatureComplexity` | number | Complexity score (0.0-1.0) |
| `pressureVariation` | number | Pressure variation (0.0-1.0) |
| `velocityProfile` | array | Velocity measurements over time |
| `pauseBetweenStrokes` | array | Pause durations in milliseconds |
| `boundingBox` | object | Signature bounding box dimensions |

#### Response

```json
{
  "message": "Action 'signed' processed successfully",
  "workflow_status": "active",
  "signer_status": "signed"
}
```

---

## Status Codes and Error Handling

### HTTP Status Codes

- **200 OK**: Successful request
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required or invalid
- **403 Forbidden**: Access denied
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflict (e.g., workflow already started)
- **422 Unprocessable Entity**: Validation errors
- **500 Internal Server Error**: Server error

### Error Response Format

```json
{
  "detail": "Error description",
  "type": "validation_error",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Common Errors

**Invalid Workflow Type**
```json
{
  "detail": "Workflow type must be 'sequential' or 'parallel'",
  "type": "validation_error"
}
```

**Document Not Ready**
```json
{
  "detail": "Document not ready for signature. Status: processing",
  "type": "business_logic_error"
}
```

**Deadline Passed**
```json
{
  "detail": "Signing deadline has passed",
  "type": "business_logic_error"
}
```

**Invalid Invitation Token**
```json
{
  "detail": "Invalid invitation token",
  "type": "authentication_error"
}
```

---

## Notification System

### Multi-Channel Support

The system supports multiple notification channels with automatic fallback:

1. **Email**: Primary channel with HTML templates
2. **SMS**: Text messages via Twilio
3. **WhatsApp**: Business API integration
4. **Push**: Future implementation

### Language Support

Templates available in:
- **English** (`en`): Default language
- **Hebrew** (`he`): RTL support with Israeli compliance
- **Arabic** (`ar`): RTL support for regional markets

### Notification Templates

**Signature Invitation**: Sent when workflow starts
**Reminder**: Automated deadline reminders
**Completion**: Confirmation when signer completes
**Escalation**: Overdue notifications to creator

---

## Israeli Electronic Signature Law Compliance

### Four Legal Requirements

1. **Identity Verification**: Multi-factor authentication and biometric data
2. **Signature Uniqueness**: Biometric analysis with complexity scoring
3. **Document Integrity**: Cryptographic hashing and tamper detection
4. **Audit Trail**: Comprehensive logging with IP, timestamps, and device info

### Biometric Analysis Requirements

- **Minimum Complexity Score**: 0.3 for signature uniqueness
- **Pressure Variation**: Required for biometric authenticity
- **Timing Analysis**: Natural signing behavior validation
- **Stroke Analysis**: Minimum 3 strokes for verification

### Compliance Endpoints

Use the biometric data from signature capture to ensure legal compliance:

```javascript
// Validate Israeli law compliance
if (biometricData.signatureComplexity >= 0.3 &&
    biometricData.pressureVariation >= 0.1 &&
    biometricData.totalStrokes >= 3 &&
    biometricData.totalSigningTime >= 1000 &&
    biometricData.totalSigningTime <= 30000) {
  // Signature meets Israeli Electronic Signature Law requirements
}
```

---

## Rate Limits and Quotas

- **Workflow Creation**: 100 per hour per user
- **Progress Queries**: 1000 per hour per user
- **WebSocket Connections**: 10 concurrent per user
- **Signer Actions**: No limit (public endpoint)

---

## SDK and Integration Examples

### JavaScript/TypeScript

```typescript
import { SignaAIClient } from '@signaai/client';

const client = new SignaAIClient({
  apiKey: 'your-api-key',
  baseURL: 'https://api.signaai.com'
});

// Create workflow
const workflow = await client.workflows.create({
  document_id: 'doc-uuid',
  signers: [
    {
      email: 'signer@example.com',
      full_name: 'John Doe',
      role: 'client'
    }
  ],
  workflow_type: 'sequential'
});

// Monitor progress
client.workflows.subscribe(workflow.id, (update) => {
  console.log('Progress:', update.progress.completion_percentage);
});
```

### Python

```python
from signaai import Client

client = Client(api_key='your-api-key')

# Create workflow
workflow = client.workflows.create(
    document_id='doc-uuid',
    signers=[
        {
            'email': 'signer@example.com',
            'full_name': 'John Doe',
            'role': 'client'
        }
    ],
    workflow_type='parallel'
)

# Get progress
progress = client.workflows.get_progress(workflow.id)
print(f"Completion: {progress.progress.completion_percentage}%")
```

---

## Webhooks (Future Implementation)

Configure webhooks to receive workflow updates:

```json
{
  "url": "https://your-app.com/webhooks/signature",
  "events": ["workflow.started", "signer.signed", "workflow.completed"],
  "secret": "webhook-secret"
}
```

---

## Support and Resources

- **API Reference**: Available at `/api/docs`
- **OpenAPI Schema**: Available at `/api/openapi.json`
- **Status Page**: Monitor API availability
- **Support**: support@signaai.com
- **Documentation**: https://docs.signaai.com

---

*This documentation covers Sprint 4 implementation of the SignaAI Signature Workflow API with comprehensive Israeli Electronic Signature Law compliance and multi-channel notification support.*