# Kế Hoạch & Báo Cáo Kiểm Thử (Test Plan)

**Dự án:** Hệ thống thông tin hồ sơ cầu thủ, hợp đồng và hỗ trợ quyết định chuyển nhượng  
**Khung kiểm thử:** Vitest + PostgreSQL Integration Tests

---

## 1. Ma trận 25 ca kiểm thử Matching Engine V2

| Nhóm | Mã ca | Nội dung kiểm thử | Kết quả kỳ vọng |
|---|---|---|---|
| **Tài chính F (7)** | TC-F-01 | Phí chuyển nhượng = 0 (Free Agent) | $F_{\text{fee}} = 100$ |
| | TC-F-02 | Phí = 70% ngân sách ($u = 0.70$) | $F_{\text{fee}} = 100 \times (1 - 0.6 \times 0.7) = 58.0$ |
| | TC-F-03 | Phí = 100% ngân sách ($u = 1.0$) | $F_{\text{fee}} = 40.0$ |
| | TC-F-04 | Phí = $B \times (1 + \tau_{\text{fee}})$ ($u = 1.10$) | $F_{\text{fee}} = 0.0$ |
| | TC-F-05 | Phí vượt trần dung sai ($u > 1.10$) | Loại cứng khỏi danh sách (Exclusion) |
| | TC-F-06 | Lương = 100% trần lương ($v = 1.0$) | $F_{\text{wage}} = 40.0$ |
| | TC-F-07 | Lương vượt trần quá dung sai $\tau$ | Loại cứng khỏi danh sách |
| **Hợp đồng (2)** | TC-C-01 | Thời hạn còn lại trong [2, 4] năm | $F_{\text{con}} = 100$ |
| | TC-C-02 | Lệch ngoài khoảng ưu tiên (1 năm / 0.5 năm / 5 năm) | $F_{\text{con}} = 70$ / $55$ / $70$ |
| **Trọng số (4)** | TC-W-01 | Tổng trọng số 3 trụ cột = 1.0 | Giữ nguyên tỷ lệ cấu hình |
| | TC-W-02 | Tổng trọng số $\neq 1.0$ | Tự động chuẩn hóa theo tỷ lệ |
| | TC-W-03 | Tổng trọng số = 0 | Báo lỗi cấu hình không hợp lệ |
| | TC-W-04 | Trọng số có giá trị âm | Chặn kích hoạt cấu hình |
| **Vai trò & Ma trận (2)**| TC-M-01 | Tổng trọng số chỉ số của vai trò $\neq 100\%$ | Hàm `fn_validate_matrix` phát hiện lỗi |
| | TC-M-02 | Xử lý giá trị ties khi tính bách phân vị | Bách phân vị không bị lệch cận trên |
| **Phút thi đấu (3)** | TC-P-01 | Thi đấu $\ge 2000$ phút | $S_{\text{minute}} = 100$ |
| | TC-P-02 | Thi đấu 600 phút ($S_{\text{minute}} = 30$) | Trần điểm vai trò tối đa $\le 50$ |
| | TC-P-03 | Thi đấu 0 phút | $S_{\text{minute}} = 0$, không gán điểm 100 |
| **Rủi ro (2)** | TC-R-01 | Chấn thương 29.4 ngày, không tái phát | $R_{\text{inj}} = 83.7$ |
| | TC-R-02 | Phạt chấn thương tái phát và ca nghỉ $\ge$ 90 ngày | Trừ thêm điểm phạt tương ứng 10 và 15 |
| **Dữ liệu thiếu (4)** | TC-D-01 | Thiếu 1 trụ cột (F hoặc S hoặc R) | Matching Score = NULL, không tự chia lại trọng số |
| | TC-D-02 | Thiếu tracking data di chuyển | Tự động phân bổ trọng số bù sang Press/PrgC |
| | TC-D-03 | Thiếu lịch sử chấn thương | Gán điểm tạm 70 kèm cờ cảnh báo |
| | TC-D-04 | Thiếu chuỗi giá trị thị trường (< 4 mốc) | Gắn cờ cảnh báo `PRICE_SERIES_INCOMPLETE` |
| **Case Study M (1)** | TC-CS-01 | Kiểm thử toàn diện cầu thủ M | F: 62.9, S: 81.4, R: 80.2 &rarr; Matching: ~73.8-75.6 |

---

## 2. Lệnh thực thi kiểm thử
```bash
# Chạy bộ unit tests
npm run test

# Kiểm tra tính toàn vẹn cơ sở dữ liệu
npm run db:check
```
