# PulseCheck REST API Reference

PulseCheck provides a RESTful API for managing monitoring targets, triggering on-demand health probes, computing reliability metrics, retrieving check history, and coordinating scheduled check cycles.

---

## Base URL

When running locally, endpoints are rooted at:
```
http://localhost:3000/api
```

---

## Authentication

| Scope | Method | Scheme | Header |
| :--- | :--- | :--- | :--- |
| **Interactive Dashboard Routes** | `GET`, `POST`, `DELETE` | None (Local / Single-Tenant) | None required |
| **Scheduled Monitoring Cron** | `POST /api/cron/check` | Bearer Token | `Authorization: Bearer <CRON_SECRET>` |

---

## Endpoints

### 1. List All Endpoints

Retrieves all registered monitoring targets ordered by creation time ascending.

- **Method:** `GET`
- **Path:** `/api/endpoints`
- **Authentication:** None
- **Response:** `200 OK`
```json
[
  {
    "id": 1,
    "name": "GitHub Status API",
    "url": "https://www.githubstatus.com/api/v2/status.json",
    "latencyThresholdMs": 500,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```
*Note: This route returns endpoint definitions only and intentionally does not include `latestCheck`.*

---

### 2. Register New Endpoint

Registers a new target URL for health monitoring.

- **Method:** `POST`
- **Path:** `/api/endpoints`
- **Authentication:** None
- **Headers:** `Content-Type: application/json`
- **Request Body:**
```json
{
  "name": "Production Payment Gateway",
  "url": "https://api.example.com/health",
  "latencyThresholdMs": 750
}
```
| Field | Type | Required | Constraints |
| :--- | :--- | :--- | :--- |
| `name` | string | Yes | 1 to 100 characters, trimmed |
| `url` | string | Yes | Valid HTTP or HTTPS URL, max 2048 characters |
| `latencyThresholdMs` | integer | No | Positive integer, default: 500, max: 60000 |

- **Success Response:** `201 Created`
```json
{
  "id": 2,
  "name": "Production Payment Gateway",
  "url": "https://api.example.com/health",
  "latencyThresholdMs": 750,
  "createdAt": "2026-10-02T12:00:00.000Z"
}
```
- **Error Responses:**
  - `400 Bad Request`: Validation failure (e.g. invalid URL, threshold $\le 0$ or $> 60000$, missing name).
  ```json
  { "error": "URL must use http or https protocol" }
  ```
  - `409 Conflict`: An endpoint with the same URL already exists.
  ```json
  { "error": "An endpoint with this URL already exists" }
  ```
  - `500 Internal Server Error`: Unexpected database failure.

---

### 3. Delete Endpoint

Deletes an endpoint by ID and automatically purges all associated historical check observations via database cascading deletion (`ON DELETE CASCADE`).

- **Method:** `DELETE`
- **Path:** `/api/endpoints/:id`
- **Authentication:** None
- **Path Parameters:**
  - `id`: Positive integer endpoint ID.
- **Success Response:** `204 No Content`
  - Body: *Empty*
- **Error Responses:**
  - `400 Bad Request`: Invalid or non-numeric endpoint ID.
  ```json
  { "error": "Invalid endpoint ID" }
  ```
  - `404 Not Found`: Endpoint does not exist.
  ```json
  { "error": "Endpoint not found" }
  ```
  - `500 Internal Server Error`: Database failure.

---

### 4. Trigger On-Demand Health Probe

Immediately dispatches an active HTTP probe against the target URL, persists the observation to PostgreSQL, and returns the result.

- **Method:** `POST`
- **Path:** `/api/endpoints/:id/check`
- **Authentication:** None
- **Path Parameters:**
  - `id`: Positive integer endpoint ID.
- **Success Response:** `200 OK`
```json
{
  "endpoint": {
    "id": 1,
    "name": "GitHub Status API",
    "url": "https://www.githubstatus.com/api/v2/status.json",
    "latencyThresholdMs": 500,
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "check": {
    "id": 42,
    "endpointId": 1,
    "checkedAt": "2026-10-02T12:00:05.123Z",
    "statusCode": 200,
    "latencyMs": 142,
    "success": true,
    "status": "up",
    "errorType": null,
    "errorMessage": null
  }
}
```
*Important: Target failures (HTTP 500, timeout, DNS resolution failure) represent operational monitoring outcomes and return `200 OK` with `check.status = 'down'` and diagnostic details. They do not trigger application 500 errors.*

- **Error Responses:**
  - `400 Bad Request`: Invalid endpoint ID.
  - `404 Not Found`: Endpoint not found in database.
  - `500 Internal Server Error`: Platform or database persistence failure.

---

### 5. Get Rolling 24-Hour Metrics

Calculates rolling 24-hour availability and performance metrics for an endpoint.

- **Method:** `GET`
- **Path:** `/api/endpoints/:id/metrics`
- **Authentication:** None
- **Path Parameters:**
  - `id`: Positive integer endpoint ID.
- **Success Response:** `200 OK`
```json
{
  "uptime": 99.2,
  "errorRate": 0.8,
  "averageLatencyMs": 185,
  "p95LatencyMs": 340,
  "totalChecks": 120
}
```
*Zero-check state: If an endpoint has not been probed yet (`totalChecks === 0`), the endpoint returns:*
```json
{
  "uptime": 0,
  "errorRate": 0,
  "averageLatencyMs": null,
  "p95LatencyMs": null,
  "totalChecks": 0
}
```
- **Error Responses:**
  - `400 Bad Request`: Invalid endpoint ID.
  - `404 Not Found`: Endpoint not found.
  - `500 Internal Server Error`: Database query failure.

---

### 6. Get Recent Check History

Retrieves the most recent check observations for an endpoint, ordered newest first (`checked_at DESC`).

- **Method:** `GET`
- **Path:** `/api/endpoints/:id/history`
- **Authentication:** None
- **Path Parameters:**
  - `id`: Positive integer endpoint ID.
- **Query Parameters:**
  - `limit`: Optional integer (default: 50, maximum: 100).
- **Success Response:** `200 OK`
```json
[
  {
    "id": 42,
    "endpointId": 1,
    "checkedAt": "2026-10-02T12:00:05.123Z",
    "statusCode": 200,
    "latencyMs": 142,
    "success": true,
    "status": "up",
    "errorType": null,
    "errorMessage": null
  },
  {
    "id": 41,
    "endpointId": 1,
    "checkedAt": "2026-10-02T11:55:00.000Z",
    "statusCode": null,
    "latencyMs": 5008,
    "success": false,
    "status": "down",
    "errorType": "timeout",
    "errorMessage": "Request timed out after 5000ms"
  }
]
```
- **Error Responses:**
  - `400 Bad Request`: Invalid endpoint ID.
  - `404 Not Found`: Endpoint not found.
  - `500 Internal Server Error`: Database query failure.

---

### 7. Trigger Scheduled Monitoring Run

Executes a complete scheduled monitoring cycle across all registered endpoints using a bounded sliding worker queue ($\le 5$ concurrency). Authenticated via timing-safe Bearer token comparison.

- **Method:** `POST`
- **Path:** `/api/cron/check`
- **Authentication:** `Authorization: Bearer <CRON_SECRET>`
- **Headers:**
  - `Authorization: Bearer <CRON_SECRET>`
- **Success Response (Completed Run):** `200 OK`
```json
{
  "total": 5,
  "succeeded": 5,
  "failed": 0,
  "durationMs": 482,
  "timestamp": "2026-10-02T12:00:00.000Z"
}
```
- **Success Response (Overlapping Run Skipped):** `200 OK`
```json
{
  "success": true,
  "skipped": true,
  "reason": "Previous scheduled check run is still active"
}
```
- **Error Responses:**
  - `401 Unauthorized`: Missing `Authorization` header, missing `Bearer ` prefix, wrong token length, or incorrect token.
  ```json
  { "error": "Unauthorized" }
  ```
  - `405 Method Not Allowed`: Request dispatched using `GET`, `PUT`, or `DELETE`.
  - `500 Internal Server Error`: Server-side `CRON_SECRET` environment variable is unconfigured, or fatal database crash occurred.
  ```json
  { "error": "Internal server error" }
  ```
