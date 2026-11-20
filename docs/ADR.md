# Architectural Decision Records (ADR)

**Dự án:** Hệ thống thông tin hồ sơ cầu thủ, hợp đồng và hỗ trợ quyết định chuyển nhượng  
**Ngày chốt:** 20/11/2026

---

## D1: Kiến trúc Monolith API-First trên Next.js App Router
- **Bối cảnh:** Cần xây dựng hệ thống web app + API dùng chung cho Web và Mobile.
- **Quyết định:** Sử dụng Next.js App Router đảm nhiệm cả Web UI và lớp REST API `/api/v1`.
- **Lý do:** Một codebase, một quy trình deploy, giảm chi phí vận hành so với việc tách riêng NestJS/Fastify song song.
- **Phương án bị loại:** API backend riêng biệt (tăng độ phức tạp quản lý và devops cho đồ án).

## D2: SQL-First với `pg` (node-postgres), không sử dụng ORM
- **Bối cảnh:** Database PostgreSQL 16 đã được thiết kế tinh vi gồm 35 bảng, ~40 hàm PL/pgSQL, 8 view và hệ thống trigger audit/guard.
- **Quyết định:** Tương tác trực tiếp bằng `pg` driver, viết query SQL rõ ràng, không dùng Prisma/Drizzle.
- **Lý do:** Tránh ma sát lớn với exclusion constraints, trigger, domains và các hàm tính toán phức tạp.

## D3: Cơ chế Xác thực Custom Auth (Argon2id/Bcrypt + JWT 15' + Xoay vòng Refresh Token)
- **Bối cảnh:** Schema DB đã có bảng `app_user` và `refresh_token` lưu hash SHA-256.
- **Quyết định:** Tự triển khai auth theo schema hiện có. JWT access token có hạn 15 phút, refresh token xoay vòng lưu bảng `refresh_token`.
- **Lý do:** Kiểm soát tuyệt đối RBAC và ngữ cảnh audit (`SET LOCAL app.user_id`), không phụ thuộc vào Supabase Auth.

## D4: Matching Engine V2 tại Postgres Functions (Source of Truth)
- **Bối cảnh:** Cần đảm bảo tính nhất quán tuyệt đối của kết quả tính điểm chuyển nhượng.
- **Quyết định:** Toàn bộ công thức F/S/R và xếp hạng đặt trong PostgreSQL functions (`fn_run_match`, `fn_matching`,...). Lớp service chỉ điều phối và tạo câu giải thích tự nhiên.
- **Lý do:** Tránh lệch logic giữa hai nơi cài đặt, tận dụng tối đa hiệu năng set-based của database.

## D5: Mobile App phát triển bằng Expo (React Native)
- **Bối cảnh:** Mobile là yêu cầu bắt buộc nghiệm thu (UC02, UC03, UC04, UC08, UC09).
- **Quyết định:** Sử dụng Expo Router, chia sẻ schema Zod và TypeScript types qua `packages/shared`.
- **Lý do:** Tối ưu tái sử dụng code, build APK nội bộ dễ dàng qua EAS.

## D6: Hạ tầng Managed Postgres (Supabase) + Vercel Hosting
- **Bối cảnh:** Cần giải pháp cloud tin cậy, chi phí thấp, có backup tự động.
- **Quyết định:** Supabase chỉ làm PostgreSQL + Storage; Vercel triển khai Web và API. Client không truy cập Supabase trực tiếp.
- **Lý do:** Đảm bảo bảo mật (G5), không lộ anon key gây lộ dữ liệu lương.

## D7: Tác vụ nền qua Route Handler `/api/v1/jobs/run`
- **Bối cảnh:** Vercel serverless không hỗ trợ daemon process chạy dài hạn.
- **Quyết định:** Tác vụ nền (quét hợp đồng, refresh score, audit) được kích hoạt qua route handler bảo vệ bằng `CRON_SECRET`, lập lịch bằng `pg_cron` của Supabase hoặc Vercel Cron.
- **Lý do:** Đơn giản hóa kiến trúc, không cần thuê thêm worker server.

## D8: Dữ liệu mô phỏng Deterministic gắn nhãn `simulated`
- **Bối cảnh:** Không có bộ dữ liệu Kaggle thật có đủ các trường tài chính (lương, phí).
- **Quyết định:** Viết generator nội bộ có PRNG seed cố định, mọi bản ghi tài chính sinh ra bắt buộc gắn nhãn `reliability_label = 'simulated'`.
- **Lý do:** Đáp ứng quy mô demo (5.000 cầu thủ, 200 CLB, 8.000 hợp đồng) mà không vi phạm quy tắc đạo đức dữ liệu BR03.

## D9: Kiểm chứng Migration trên Staging không cần Docker Desktop local
- **Bối cảnh:** Máy lập trình viên chạy Windows chưa cài đặt Docker Desktop/WSL2.
- **Quyết định:** Tách migrations rõ ràng và kiểm thử bằng `npx supabase db push --dry-run` kết hợp script `npm run db:check`.
- **Lý do:** Tránh cài đặt phần mềm nặng máy, vẫn bảo đảm tính tái lập môi trường.
