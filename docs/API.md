# Tài Liệu Đặc Tả API (REST API v1)

**Phiên bản API:** 1.0.0  
**Giao thức:** HTTPS JSON  
**Base URL:** `/api/v1`

---

## 1. Chuẩn quy ước chung

### 1.1 Envelope phản hồi thành công
```json
{
  "data": { ... },
  "meta": {
    "cursor": "1052",
    "hasMore": true,
    "total": 5000,
    "asOf": "2026-11-20"
  }
}
```

### 1.2 Envelope phản hồi lỗi
```json
{
  "error": {
    "code": "BUDGET_EXCEEDED",
    "message": "Phí chuyển nhượng ước tính vượt quá giới hạn ngân sách CLB",
    "details": { ... }
  }
}
```

---

## 2. Danh mục các Endpoint

### 2.1 Hệ thống & Sức khỏe (Health Check)
- **`GET /api/v1/health`**
  - **Mô tả:** Kiểm tra trạng thái hoạt động của web server và kết nối cơ sở dữ liệu PostgreSQL.
  - **Quyền hạn:** Mọi người dùng (Public).

### 2.2 Xác thực & Phân quyền (UC01)
- **`POST /api/v1/auth/register`**
  - **Body:** `{ "username": "scout1", "email": "scout1@club.com", "password": "...", "role": "scout" }`
  - **Trả về:** `{ "accessToken": "...", "refreshToken": "...", "user": { ... } }` + Cookie `access_token`.
- **`POST /api/v1/auth/login`**
  - **Body:** `{ "usernameOrEmail": "...", "password": "..." }`
  - **Trả về:** Token và thông tin người dùng.
- **`POST /api/v1/auth/refresh`**
  - **Body:** `{ "refreshToken": "..." }`
  - **Mô tả:** Xoay vòng refresh token, thu hồi token cũ và sinh cặp token mới.
- **`POST /api/v1/auth/logout`**
  - **Mô tả:** Thu hồi refresh token và xóa cookie phiên.
- **`GET /api/v1/auth/me`**
  - **Header:** `Authorization: Bearer <accessToken>` hoặc Cookie
  - **Trả về:** Thông tin chi tiết của người dùng đang đăng nhập.

### 2.3 Tìm kiếm & Tra cứu Hồ sơ (UC02, UC03, UC04)
- **`GET /api/v1/search/suggest?q=nguyen&limit=8`**
  - **Mô tả:** Gợi ý nhanh cầu thủ và CLB không phân biệt dấu tiếng Việt.
- **`GET /api/v1/players`**
  - **Query Params:** `q`, `position`, `minAge`, `maxAge`, `minMarketValue`, `freeAgentWindow`, `minMinutes`, `sortBy`, `cursor`, `limit`.
  - **Phân quyền (BR06):** Khách vãng lai chỉ nhận `v_player_card_public` (trường lương bị ẩn); Scout/Admin nhận đầy đủ thông tin lương.
- **`GET /api/v1/players/{id}`**
  - **Mô tả:** Hồ sơ chi tiết cầu thủ kèm vector vai trò chiến thuật, lịch sử chấn thương 24 tháng và chuỗi giá trị thị trường.

### 2.4 Quản lý Nhu cầu Tuyển trạch (UC05)
- **`GET /api/v1/requirements`**
  - **Mô tả:** Lấy danh sách các nhu cầu tuyển trạch của người dùng.
- **`POST /api/v1/requirements`**
  - **Body:** `{ "position": "CM/CDM", "budget": 30000000, "salaryLimit": 4000000, "priority": 3, "matchingParams": { "s_min": 60, "min_minutes": 600 } }`
- **`GET /api/v1/requirements/{id}`**
- **`PATCH /api/v1/requirements/{id}`**
- **`DELETE /api/v1/requirements/{id}`**

### 2.5 Đánh giá & Matching Engine (UC06, UC07)
- **`POST /api/v1/match-runs`**
  - **Body:** `{ "requirementId": 1, "overrideParams": { ... } }`
  - **Mô tả:** Điều phối chạy Matching Engine V2 trong database, sinh câu giải thích và Pros/Cons ở tầng service.
  - **Trả về:** `{ "runId": "uuid" }`
- **`GET /api/v1/match-runs/{id}`**
  - **Trả về:** Kết quả xếp hạng, điểm Matching, điểm thành phần F/S/R, danh sách Pros/Cons, cờ cảnh báo và danh sách ứng viên bị loại.
- **`GET /api/v1/match-runs/{id}/alternatives?playerId=10&requirementId=1`**
  - **Mô tả:** Gợi ý 3 phương án thay thế có điểm tài chính cao hơn và độ tương đồng vai trò cao.
- **`GET /api/v1/compare?playerIds=1,2,3`**
  - **Mô tả:** Đối chiếu trực quan từ 2 đến 4 cầu thủ theo các tiêu chí chuyên môn và tài chính.

### 2.6 Quản lý Shortlist (UC08)
- **`GET /api/v1/shortlists?requirementId=`**
- **`POST /api/v1/shortlists`**
  - **Body:** `{ "playerId": 10, "requirementId": 1, "note": "Ưu tiên theo dõi" }`
  - **Ràng buộc:** Trả về lỗi `409 SHORTLIST_DUPLICATE` nếu mục tiêu đã tồn tại.
- **`PATCH /api/v1/shortlists/{id}`**
- **`DELETE /api/v1/shortlists/{id}`**
- **`GET /api/v1/shortlists/export`**
  - **Mô tả:** Xuất toàn bộ danh sách mục tiêu dạng tệp CSV.

### 2.7 Quản trị Hệ thống & Kiểm toán (UC11, UC12)
- **`GET /api/v1/admin/audit-logs`**
  - **Quyền hạn:** Chỉ dành cho Admin. Xem lịch sử thay đổi bất biến.
- **`GET /api/v1/admin/scoring-configs`**
  - **Mô tả:** Xem danh sách phiên bản cấu hình chấm điểm.
- **`POST /api/v1/admin/scoring-configs/{id}/activate`**
  - **Mô tả:** Kích hoạt phiên bản cấu hình tính điểm mới.
- **`POST /api/v1/admin/verify`**
  - **Body:** `{ "entityType": "player", "entityId": 10 }`
  - **Mô tả:** Chuyển trạng thái bản ghi từ `draft` sang `verified`.
