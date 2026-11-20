# Đặc Tả Yêu Cầu Hệ Thống (SRS)

**Dự án:** Hệ thống thông tin hồ sơ cầu thủ, hợp đồng và hỗ trợ quyết định chuyển nhượng  
**Phiên bản:** 1.0 (Hợp nhất theo Matching Engine V2)

---

## 1. Giới thiệu & Bối cảnh bài toán
Thị trường chuyển nhượng bóng đá hiện đại có quy mô hàng chục tỷ USD mỗi năm với hàng chục nghìn cầu thủ và CLB tham gia. Các cán bộ chuyên môn (Scout, Giám đốc kỹ thuật) phải xử lý lượng dữ liệu phân tán: hồ sơ, thời hạn hợp đồng, lương bổng, lịch sử chấn thương và ràng buộc tài chính của CLB.

Hệ thống cung cấp giải pháp tích hợp giữa bách khoa toàn thư hồ sơ cầu thủ và công cụ hỗ trợ ra quyết định (Decision Support System) dựa trên luật (rule-based) có khả năng định lượng, minh bạch và giải thích rõ ràng.

---

## 2. Các tác nhân hệ thống (Actors)
1. **Khách vãng lai (Guest):** Tra cứu thông tin hồ sơ cầu thủ cơ bản. **Tuyệt đối không xem được mức lương chi tiết (BR06).**
2. **Cán bộ tuyển trạch (Scout):** Tra cứu chuyên sâu, xem dữ liệu tài chính có nhãn độ tin cậy, thiết lập hồ sơ nhu cầu CLB, chạy Matching Engine V2, quản lý Shortlist và nhận cảnh báo biến động.
3. **Quản trị viên dữ liệu (Data Admin):** Quản lý danh mục master data (CLB, cầu thủ, hợp đồng, chỉ số), duyệt dữ liệu (draft &rarr; verified), cấu hình tham số Matching Engine và giám sát Audit Log.
4. **Tác vụ nền (Scheduler/Worker):** Quét hợp đồng sắp đáo hạn (12/6/3 tháng), cập nhật percentile và điểm vai trò.

---

## 3. Danh mục 13 Usecase (UC01 – UC13)
- **UC01 — Xác thực & Phân quyền:** Đăng ký, đăng nhập, cấp phát JWT 15 phút, xoay vòng refresh token, kiểm soát vai trò RBAC.
- **UC02 — Tìm kiếm nhanh (Suggest):** Auto-complete &ge; 2 ký tự, tìm kiếm mờ (fuzzy) và không phân biệt dấu tiếng Việt (`unaccent`).
- **UC03 — Sàng lọc đa chiều:** Lọc theo vị trí, độ tuổi, giá trị thị trường, thời hạn hợp đồng, số phút thi đấu và giải đấu; phân trang theo cursor.
- **UC04 — Xem hồ sơ chi tiết:** Xem hồ sơ cầu thủ, vector vai trò chiến thuật, lịch sử chấn thương 24 tháng, chuỗi giá trị thị trường và tình trạng hợp đồng.
- **UC05 — Quản lý nhu cầu CLB:** Thiết lập yêu cầu vị trí, ngân sách phí (B > 0), trần quỹ lương (W_cap > 0), độ tuổi và ngưỡng chuyên môn.
- **UC06 — Đánh giá & Hỗ trợ quyết định chuyển nhượng:** Điều phối chạy Matching Engine V2, xếp hạng ứng viên, đưa ra câu giải thích và các luận điểm Pros/Cons.
- **UC07 — So sánh trực quan:** Đối chiếu song song từ 2 đến 4 cầu thủ, làm nổi bật điểm mạnh nhất từng hàng.
- **UC08 — Quản lý Shortlist / Watchlist:** Thêm/bớt mục tiêu, gắn ghi chú tuyển trạch, kiểm soát chống trùng lặp, tính tổng ngân sách dự kiến và xuất file CSV.
- **UC09 — Thông báo biến động:** Cảnh báo hợp đồng sắp hết hạn (12/6/3 tháng), biến động giá trị và trạng thái chấn thương.
- **UC10 — Quản lý dữ liệu Master:** Thao tác CRUD thực thể, xóa mềm (`deleted_at`), quy trình kiểm duyệt (draft &rarr; verified).
- **UC11 — Cấu hình tham số chấm điểm:** Quản lý phiên bản ma trận trọng số và tham số Matching Engine; cấm sửa cấu hình đã áp dụng.
- **UC12 — Nhật ký kiểm toán (Audit Log):** Ghi vết tự động mọi thao tác tạo, sửa, xóa, duyệt dữ liệu; bảng log bất biến (chỉ thêm, cấm sửa/xóa).
- **UC13 — Nhập/Xuất dữ liệu:** Nhập dữ liệu hàng loạt qua CSV 2 bước (preview &rarr; commit), xuất báo cáo danh sách mục tiêu.

---

## 4. Quy tắc nghiệp vụ tổng hợp (Business Rules BR01 – BR09)
- **BR01 — Cơ hội Free Agent:** Cầu thủ có hợp đồng còn &le; 6 tháng hoặc hết hạn chưa ký mới được xem là cơ hội chuyển nhượng tự do.
- **BR02 — Ràng buộc hợp đồng duy nhất:** Một cầu thủ tại một thời điểm chỉ có tối đa một hợp đồng chính có hiệu lực; hợp đồng cho mượn phải chỉ định CLB chủ quản gốc. Ràng buộc bằng `btree_gist` exclusion constraint.
- **BR03 — Nhãn độ tin cậy tài chính:** Mọi dữ liệu lương và phí phải gắn nhãn độ tin cậy (`rumor`, `reputable_media`, `official`, `financial_report`, `simulated`) và nguồn dữ liệu.
- **BR04 — Chuẩn hóa trọng số 100%:** Tổng trọng số 3 trụ cột bằng 100%; tổng trọng số chỉ số con trong từng vai trò chiến thuật bằng 100%.
- **BR05 — Bất biến Audit Log:** Mọi thao tác ghi dữ liệu master phải ghi lại vào `audit_log` kèm `actor_id` và `ip_address`; log không thể bị sửa hoặc xóa.
- **BR06 — Bảo mật mức lương:** Mức lương chi tiết chỉ hiển thị cho người dùng đã xác thực (Scout, Admin); Guest chỉ xem view `v_player_card_public`.
- **BR07 — Chống trùng lặp thông báo:** Một sự kiện biến động chỉ tạo ra tối đa một thông báo cho mỗi người dùng theo dõi.
- **BR08 — Tuổi tính động:** Tuổi cầu thủ luôn được tính động từ ngày sinh (`date_of_birth`) tại thời điểm truy vấn.
- **BR09 — Thang đo phân cấp khuyến nghị:**
  - **> 80 điểm:** Khuyến nghị cao (High Recommendation).
  - **50 – 79 điểm:** Cần cân nhắc (Consideration).
  - **< 50 điểm:** Rủi ro cao (High Risk).

---

## 5. Thuật toán Matching Engine V2 Unified
- **Công thức tổng hợp:**
  $$\text{Matching} = w_F \cdot F + w_S \cdot S + w_R \cdot R$$
  *(Mặc định $w_F = 0.40, w_S = 0.40, w_R = 0.20$)*
- **Trụ cột F — Khả thi tài chính:**
  $$F = 0.45 \cdot F_{\text{fee}} + 0.35 \cdot F_{\text{wage}} + 0.20 \cdot F_{\text{con}}$$
  - Điểm 40 khi dùng đúng 100% ngân sách/trần lương.
  - Vượt quá dung sai $\tau$ bị loại cứng bởi bộ lọc sơ bộ.
- **Trụ cột S — Tương thích đội hình & Vai trò:**
  - Chuẩn hóa 18 chỉ số theo bách phân vị (Percentile) trong nhóm vị trí.
  - Điểm tin cậy phút thi đấu: $S_{\text{minute}} = \min(100, 100 \cdot \text{Min} / 2000)$.
  - Điểm vai trò: $\text{Score\_Role} = \min(0.20 \cdot S_{\text{minute}} + 0.80 \sum w_i P_i, S_{\text{minute}} + 20, 100)$.
  - Lấy điểm cao nhất trong các vai trò yêu cầu; gắn cờ `ROLE_TIE` khi chênh lệch 2 vai trò đầu < 3 điểm.
- **Trụ cột R — Rủi ro & Bán lại:**
  $$R = 0.50 \cdot R_{\text{inj}} + 0.50 \cdot R_{\text{resale}}$$
  - $R_{\text{inj}}$ phạt nặng trường hợp chấn thương tái phát cùng vùng (+10) và ca nghỉ $\ge$ 90 ngày (+15).
  - $R_{\text{resale}}$ đánh giá dựa trên độ tuổi sau thời gian nắm giữ 3 năm và xu hướng tăng trưởng giá trị thị trường.
- **Thứ tự ưu tiên khi bằng điểm:** $S \rightarrow F \rightarrow$ Mức phí thấp hơn.

---

## 6. Yêu cầu phi chức năng (NFR)
- **Hiệu năng:** Tra cứu gợi ý nhanh < 200ms; sàng lọc trên 50.000 bản ghi < 2s; chạy Matching Engine 100 cầu thủ < 10s.
- **Bảo mật:** Mật khẩu mã hóa Bcrypt/Argon2id; access token JWT ngắn hạn 15 phút; refresh token lưu dạng hash SHA-256; phòng chống SQL Injection qua parameterized query.
- **Khả chuyển & Đa nền tảng:** Kiến trúc API-First phục vụ đồng thời Web App (Next.js) và Mobile App (Expo).
