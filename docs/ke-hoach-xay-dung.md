# Kế hoạch xây dựng hệ thống

**Dự án:** Hệ thống thông tin hồ sơ cầu thủ, hợp đồng và hỗ trợ quyết định chuyển nhượng
**Phiên bản kế hoạch:** 1.1 — 20/11/2026 (đã chốt quyết định với chủ dự án)
**Căn cứ:** `Project 3 - Mô tả bài toán...docx`, `Matching_Engine_v2.docx`, `ma_tran_trong_so_vai_tro_chien_thuat.xlsx`, `football_transfer_db.sql`, `ERD.png`, `flow diagram.drawio (1).png`

---

## 1. Mục tiêu của bản kế hoạch

Chuyển bộ tài liệu đặc tả hiện có thành một hệ thống chạy được, có thể demo và bảo vệ trước hội đồng:

1. Web App (Next.js) + API tập trung dùng chung cho Web và Mobile.
2. Mobile App (Expo) cho các use case bắt buộc.
3. Matching Engine rule-based F/S/R đúng đặc tả V2, có thể giải thích từng điểm.
4. Dữ liệu demo đủ quy mô: ≥ 5.000 cầu thủ, ≥ 200 CLB, ≥ 8.000 hợp đồng, ≥ 3 mùa giải.
5. Bộ kiểm thử + tài liệu (SRS, ERD, API, test report) làm phụ lục báo cáo.

**Giả định nguồn lực:** 1 lập trình viên full-stack, ~30 giờ/tuần, tổng ~14 tuần + 1,5 tuần dự phòng.

**Phạm vi đã chốt (20/11/2026):** Mobile **bắt buộc** (Expo); deploy **Supabase + Vercel**; **không có dataset Kaggle → sinh dữ liệu mô phỏng có nhãn**; auth dùng phương án nhanh nhất là **custom auth theo schema sẵn có**; **nộp kèm đầy đủ tài liệu** (SRS, ERD, OpenAPI, test report).

---

## 2. Hiện trạng tài sản trong workspace

| Tài sản | Nội dung | Trạng thái | Dùng cho giai đoạn |
|---|---|---|---|
| `Project 3 ... .docx` | Bài toán, actors, 13 UC, BR01–BR09, NFR, tiêu chí nghiệm thu | Hoàn chỉnh | Nguồn yêu cầu chuẩn (SRS) |
| `Matching_Engine_v2.docx` | Đặc tả F/S/R, percentile, smoothing, thiếu dữ liệu, 25+ ca kiểm thử gợi ý | Hoàn chỉnh | Nguồn logic chấm điểm |
| `ma_tran_trong_so_vai_tro_chien_thuat.xlsx` | 18 chỉ số × 35 vai trò, trọng số chuẩn hóa | Đã sinh vào SQL | Seed tham chiếu |
| `football_transfer_db.sql` | 35 bảng, 4 extension, trigger audit/guard, ~40 hàm, 8 view, seed ma trận + config | **Tài sản lớn nhất, dùng lại gần như toàn bộ** | Nền dữ liệu |
| `football-transfer-db/supabase` | `config.toml` + 1 migration functions/views, project đã link | Thiếu migration schema/seed → không `db reset` được | Cần vá ở P0 |
| `ERD.png` | ERD phiên bản cũ (10 bảng) | Lỗi thời so với SQL | Vẽ lại từ SQL |
| `flow diagram.drawio (1).png` | Luồng Scout: nhập nhu cầu → lọc → chấm điểm → shortlist | Chỉ 1 luồng | Tham khảo UX |

**Kết luận:** phần khó nhất (schema + công thức + ma trận trọng số) đã có sẵn trong SQL. Kế hoạch tập trung vào **làm cho DB tái lập được**, **bổ sung lớp điều phối Matching còn thiếu**, rồi mới xây API/UI.

---

## 3. Khoảng trống phải xử lý (gap log)

| # | Gap | Ảnh hưởng | Xử lý | Phase |
|---|---|---|---|---|
| G1 | Chỉ có migration functions; schema + seed nằm trong 1 file SQL thủ công | Không tái lập được môi trường, không CI được | Tách thành `schema` + `functions_views` + `seed.sql`; migrations phải chạy được từ DB rỗng | P0 |
| G2 | **Thiếu lớp điều phối Matching**: chưa có hàm/luồng truy vấn ứng viên, ghi `match_run`/`match_result`/`match_exclusion`, sinh Pros/Cons, gợi ý thay thế | UC06 chưa chạy end-to-end dù đã có các hàm con | Migration `004_matching_pipeline`: `fn_candidates`, `fn_run_match`, `fn_alternatives`; Pros/Cons sinh ở tầng service | P5 |
| G3 | Chưa có dữ liệu thật/demo (chỉ có bảng tham chiếu) | Không test được hiệu năng, không demo được | Generator deterministic + nhãn `simulated` | P2/P3 |
| G4 | Xung đột mô hình auth: schema dùng `app_user` + `refresh_token` riêng, project lại là Supabase (có `auth.users`) | Dễ dựng 2 hệ auth song song | Chốt: **giữ custom auth theo schema**, Supabase chỉ dùng làm Postgres + Storage | P0 |
| G5 | Chưa có RLS/policy; nếu lộ anon key là lộ dữ liệu lương | Rủi ro bảo mật, vi phạm BR06 | Không cho client truy cập DB trực tiếp; chỉ server dùng connection string; anon key không dùng | P1 |
| G6 | `position_group.GK.is_scorable = false` nhưng seed vẫn có 2 vai trò GK + 6 chỉ số GK | Hành vi không rõ ràng | Chốt: GK ngoài phạm vi chấm điểm (trả `UNSUPPORTED_POSITION`), UI hiển thị thông báo; giữ seed cho hướng phát triển | P5 |
| G7 | ERD.png lệch SQL | Sai phụ lục báo cáo | Sinh ERD từ DB (dbdiagram/erd tool) | P8 |
| G8 | Chưa có code app, test, CI, OpenAPI | — | Toàn bộ kế hoạch dưới đây | P0–P8 |
| G9 | Tồn tại song song `player_stats` (cơ bản) và `player_season_metrics` (nâng cao) | Dễ nhập trùng/lệch | Quy ước: `player_stats` = nguồn hiển thị; `player_season_metrics` = nguồn tính percentile/role score | P2 |
| G10 | Công thức F trong `Project 3 §7.2` (bậc thang, ≤70% ngân sách = 100) khác `Matching_Engine_v2 §2.2` (tuyến tính, dùng đúng hạn mức = 40) | Lệch kết quả, lệch báo cáo | Áp dụng **V2 là chuẩn vận hành** (đúng nguyên tắc tài liệu hợp nhất); ghi rõ trong SRS | P0 |
| G11 | BR02 (một hợp đồng chính hiệu lực; cho mượn có CLB gốc) chỉ được chặn một phần bằng exclusion constraint | Sai trạng thái cầu thủ | Bổ sung kiểm tra ở service + view `v_player_current_contract` | P2 |
| G12 | File SQL là UTF-8 không BOM; PowerShell mặc định đọc ANSI gây mojibake khi xem | Mất dấu tiếng Việt khi thao tác bằng script | Quy ước đọc/ghi UTF-8 trong mọi script; `.editorconfig` charset utf-8 | P0 |

---

## 4. Quyết định kiến trúc (chốt trước khi code)

| Mã | Quyết định | Lý do | Phương án bị loại |
|---|---|---|---|
| D1 | **Monolith API-first**: Next.js App Router vừa là Web UI vừa là API `/api/v1`; worker riêng cho tác vụ nền | Một codebase, một deploy, đủ tách tầng; tránh dựng NestJS/Fastify song song | API service riêng (tăng chi phí vận hành, không cần cho đồ án) |
| D2 | **SQL-first + `pg` (node-postgres)**, không ORM | DB đã là đặc tả: 35 bảng, 40 hàm, 8 view, trigger audit. ORM sẽ phải bọc lại toàn bộ `$queryRaw` | Prisma/Drizzle (ma sát lớn với hàm/view/exclusion constraint) |
| D3 | **Custom auth**: argon2id + JWT access 15' + refresh token xoay vòng (bảng `refresh_token`, lưu SHA-256) | Khớp schema hiện có, kiểm soát RBAC và audit context | Supabase Auth (phải migrate `app_user`, lệch audit trigger) |
| D4 | **Matching Engine = Postgres functions (source of truth)**, service chỉ điều phối và diễn giải | Công thức đã nằm trong SQL; tránh 2 nơi cài đặt lệch nhau | Cài lại bằng TS (phải đồng bộ 2 nơi) |
| D5 | **Mobile = Expo (React Native) — bắt buộc, làm sau Web** | Tái dùng zod schema + type qua `packages/shared`; đã xác nhận mobile là yêu cầu nghiệm thu | Flutter (không chia sẻ type), PWA (không đáp ứng "Mobile App") |
| D6 | **Supabase managed Postgres + Storage, Web deploy Vercel** | Đã chốt; miễn phí, có backup, không tự vận hành DB | VPS tự dựng Postgres |
| D7 | **Job nền = route handler `/api/v1/jobs/run` bảo vệ bằng `CRON_SECRET`**, lịch chạy bằng `pg_cron` + `pg_net` của Supabase (hoặc Vercel Cron) | Vercel không chạy process nền dài hạn; không phát sinh thêm host | Worker riêng trên Railway/Render (thêm dịch vụ phải vận hành) |
| D8 | **Sinh dữ liệu demo bằng generator có seed cố định**, thêm nhãn tin cậy `simulated` | Không có Kaggle; cần phân biệt dữ liệu giả với dữ liệu thật, không vi phạm BR03 | Gắn nhãn `official` cho dữ liệu sinh (sai bản chất), hoặc không gắn nhãn |
| D9 | **Không cần Docker local**: kiểm chứng migration bằng một Supabase project staging riêng + `npx supabase db push --dry-run`; máy hiện chưa có Docker/Supabase CLI | Tránh cài Docker Desktop/WSL2 nặng máy; vẫn giữ được môi trường tái lập | Docker Desktop + `supabase start` (nặng, chưa cần cho đồ án) |

---

## 5. Kiến trúc thành phần

```
┌──────────────────────┐        ┌──────────────────────┐
│ Web (Next.js RSC)    │        │ Mobile (Expo Router) │
│ - Data Grid, chart   │        │ - Card swipe, push   │
└──────────┬───────────┘        └──────────┬───────────┘
           │  HTTPS /api/v1 (JSON)         │
           └──────────────┬────────────────┘
                          ▼
        ┌─────────────────────────────────────────┐
        │ API layer (route handlers)              │
        │ rate-limit → auth → RBAC → zod → svc    │
        └───────┬───────────────────┬─────────────┘
                │                   │
     ┌──────────▼─────────┐  ┌──────▼──────────────┐
     │ Services           │  │ Job runner          │
     │ auth, catalog,     │  │ /api/v1/jobs/run    │
     │ requirement,       │  │ - quét hợp đồng     │
     │ matching, admin,   │  │ - domain_event →    │
     │ import/export      │  │   notification +FCM │
     │                    │  │ - refresh percentile│
     └──────────┬─────────┘  └──────┬──────────────┘
                │  pg pool (server-only) │
                ▼                        ▼
        ┌──────────────────────────────────────────┐
        │ PostgreSQL 16 (Supabase)                 │
        │ 35 bảng · 8 view · ~40 hàm · trigger     │
        │ audit / guard / exclusion constraint     │
        └──────────────────────────────────────────┘
```

**Luồng request chuẩn:**
`route handler → rate limit → auth (JWT/cookie) → RBAC → zod parse → service → SQL (tx + SET LOCAL app.user_id/app.client_ip) → map DTO → response`

**Luồng batch (không chạy trong request):**
`import CSV → verify → player_season_metrics → fn_refresh_percentiles(season) → fn_refresh_role_scores(season, matrix) → cập nhật mv grid (nếu cần)`
Chạy qua `/api/v1/jobs/run` (idempotent, có `job` log), lịch bằng Supabase `pg_cron` gọi `pg_net` hoặc Vercel Cron; có nút "Chạy ngay" trong khu vực Admin để demo.

**Quy ước API:** version `/api/v1`; lỗi dạng `{ error: { code, message, details? } }`; phân trang cursor `?cursor=&limit=`; mọi input validate bằng zod ở server; không trả field lương cho Guest (dùng `v_player_card_public`).

---

## 6. Cấu trúc repo & quy ước

```
D:\luoung
├─ apps/
│  ├─ web/            # Next.js: UI + /api/v1 route handlers
│  ├─ mobile/         # Expo Router (P7)
│  └─ worker/         # scheduler: hợp đồng, thông báo, refresh score
├─ packages/
│  ├─ shared/         # zod schema, type, enum vị trí/vai trò, API client, i18n resources
│  └─ db/             # pg pool, query modules, transaction helper, types sinh từ SQL
├─ supabase/          # config.toml, migrations/, seed.sql
├─ data/              # CSV nguồn + CSV mô phỏng + script import
├─ docs/              # kế hoạch, SRS, API, test cases, ERD, demo script
└─ package.json       # npm workspaces (npm 11)
```

**Quy ước code:** TypeScript strict, không `any`/`@ts-ignore`; Server Component mặc định; mọi thao tác ghi DB nằm trong `services/`, không gọi DB từ component; mỗi service export hàm thuần + zod schema input/output; tên bảng/cột giữ nguyên snake_case của DB, DTO dùng camelCase.

**Biến môi trường (chỉ khai báo tên trong `.env.example`):** `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `REFRESH_TOKEN_PEPPER`, `APP_BASE_URL`, `CRON_SECRET`, `FCM_SERVICE_ACCOUNT_JSON`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only).

---

## 7. Lộ trình 8 giai đoạn

| Phase | Thời lượng | Mục tiêu | Công việc chính | Exit criteria |
|---|---|---|---|---|
| **P0 — Nền tảng** | 0,5 tuần | Môi trường tái lập được | git init; `.editorconfig` (utf-8); workspaces; chuyển `supabase/` ra root; tách SQL thành `schema` + `functions_views` + `seed`; `.env.example`; script `db:seed`, `db:check`; CI (typecheck/lint/test/build) | Migrations chạy từ DB rỗng trên staging; `db:check` xanh; CI xanh |
| **P1 — Auth & khung API** | 1,5 tuần | UC01 + hạ tầng API | Bảng `app_user` CRUD, đăng ký/đăng nhập/refresh/logout, argon2id, JWT, RBAC middleware, rate limit, error envelope, audit context (`SET LOCAL`), health check, OpenAPI skeleton | 3 vai trò Guest/Scout/Admin chạy đúng; mọi mutation ghi `audit_log`; test auth 8+ case |
| **P2 — Dữ liệu master & import** | 2 tuần | UC10, UC13 | CRUD club/player/contract/transfer/injury/stats (xóa mềm), workflow draft→verified, gán nhãn độ tin cậy, import CSV/Excel 2 bước (preview → commit) ghi `import_job`/`import_error`, xuất CSV | Import 5.000 cầu thủ không lỗi; dòng lỗi báo đúng số dòng/cột; audit đầy đủ; 0 secret trong log |
| **P3 — Tìm kiếm & hồ sơ** | 1,5 tuần | UC02, UC03, UC04 | Auto-complete (`fn_suggest`), fuzzy không dấu, bộ lọc động (hợp đồng/chuyên môn/tài chính), sort + cursor pagination, lưu bộ lọc, trang hồ sơ cầu thủ/CLB, ẩn lương với Guest, empty/error state | Truy vấn < 2s trên 50k cầu thủ (có EXPLAIN); không lộ lương ở response Guest; test filter 10+ case |
| **P4 — Nhu cầu CLB & Shortlist** | 1 tuần | UC05, UC08 | CRUD `club_requirement` (+ nhiều vị trí/vai trò), nhân bản, tạo nhanh từ thông báo; shortlist nhiều danh sách, ghi chú, ưu tiên, xuất CSV | Tạo 3 nhu cầu/1 user; shortlist hiển thị hợp đồng gần hết hạn + tổng chi phí; ràng buộc budget/wage > 0 |
| **P5 — Matching Engine** | 2 tuần | UC06, UC07 | Migration 004: truy vấn ứng viên, lọc cứng, ghi run/result/exclusion; orchestrate F/S/R; Pros/Cons + giải thích; 3 phương án thay thế; so sánh 2–4 cầu thủ; preview ảnh hưởng cấu hình | 25 ca kiểm thử mục 9.4 xanh; kết quả tái lập với cùng input+config; 1 cầu thủ < 1s, 100 cầu thủ < 10s |
| **P6 — Thông báo** | 1,5 tuần | UC09 | Worker quét `contract`/`domain_event`, tạo `notification` (chống trùng BR07), trung tâm thông báo, cài đặt loại thông báo, push FCM (best-effort) | Hợp đồng còn 12/6/3 tháng sinh đúng 1 thông báo/người theo dõi; tắt loại thông báo thì không nhận |
| **P7a — Web hoàn thiện** | 1 tuần | Trải nghiệm Web | Dashboard, Data Grid, radar chart, dark mode, i18n vi/en, accessibility cơ bản | Web responsive 1280/768/390; Lighthouse a11y ≥ 90 |
| **P7b — Mobile (bắt buộc)** | 1,5 tuần | Ứng dụng Expo | Tìm nhanh, thẻ cầu thủ swipe, shortlist, điểm rút gọn, thông báo; build APK nội bộ (EAS) | 5 UC bắt buộc chạy trên máy thật; APK cài được; API dùng chung, không hardcode URL |
| **P8 — Kiểm thử, hiệu năng, tài liệu** | 1,5 tuần | Nghiệm thu | Bổ sung test tới ngưỡng, load test 200 user, rà bảo mật (SQLi/XSS/CSRF/rate limit), sinh ERD từ DB, OpenAPI đầy đủ, SRS, test report, kịch bản demo | Checklist mục 12 đạt; báo cáo + phụ lục đủ; demo 12 phút chạy không lỗi |

**Tổng: 14 tuần + 1,5 tuần dự phòng.** P7 split để mobile có thời gian sửa lỗi trên thiết bị thật.

**Thứ tự cắt scope khi trễ** (theo MoSCoW của tài liệu): bỏ push FCM → bỏ so sánh (UC07) → bỏ xuất PDF → giữ nguyên mobile nhưng chỉ 3 màn hình. **Không cắt:** UC02–UC06, UC08, UC10, audit, phân quyền.

---

## 8. Backlog theo Use Case

| UC | API (dự kiến) | Bảng/hàm chính | Ưu tiên | Ghi chú |
|---|---|---|---|---|
| UC01 Auth | `POST /auth/register|login|refresh|logout`, `GET /me` | `app_user`, `refresh_token`, `user_device` | Must | Cookie httpOnly + SameSite=Lax cho Web; Bearer cho Mobile |
| UC02 Tìm nhanh | `GET /search/suggest?q=` | `fn_suggest`, index trgm | Must | ≥ 2 ký tự, không dấu, fuzzy |
| UC03 Lọc đa chiều | `GET /players?...`, `POST /players/saved-filters` | `player`, `contract`, `v_player_card`, `saved_filter` | Must | Lọc "Free Agent trong N tháng" dùng `v_contract_expiring` |
| UC04 Hồ sơ | `GET /players/{id}`, `GET /clubs/{id}` | `v_player_card(_public)`, `v_player_current_contract`, `market_value`, `injury_history` | Must | Guest dùng view public |
| UC05 Nhu cầu CLB | `GET|POST|PATCH|DELETE /requirements` | `club_requirement`, `club_requirement_role` | Must | Validate budget/wage > 0, vị trí thuộc danh mục |
| UC06 Chấm điểm | `POST /match-runs`, `GET /match-runs/{id}`, `POST /players/{id}/score-preview` | `match_run`, `match_result`, `match_exclusion`, `fn_matching`, `fn_r_inj`, `fn_price_trend` | Must | Ghi config version vào kết quả |
| UC07 So sánh | `GET /compare?playerIds=` | `v_player_role_vector`, `player_role_score` | Should | 2–4 cầu thủ, highlight best-in-row |
| UC08 Shortlist | `GET|POST|PATCH|DELETE /shortlists[/items]` | `shortlist`, `v_shortlist_detail` | Must | Xuất CSV (PDF nếu còn thời gian) |
| UC09 Thông báo | `GET /notifications`, `PATCH /notifications/{id}/read`, `PUT /notification-settings` | `domain_event`, `notification`, `notification_setting` | Should | Worker + FCM |
| UC10 Master data | `GET|POST|PATCH|DELETE /admin/{entities}`, `POST /admin/{entity}/{id}/verify` | `club`, `player`, `contract`, `transfer`, `injury_history`, `player_stats`, `audit_log` | Must | Xóa mềm; audit bắt buộc |
| UC11 Cấu hình điểm | `GET|POST /admin/scoring-configs`, `POST /{id}/preview`, `POST /{id}/activate` | `scoring_config`, `role_weight_matrix`, `fn_config_guard` | Must | Preview trước khi activate; cấm sửa config đã dùng |
| UC12 Audit | `GET /admin/audit-logs` | `audit_log` | Must | Chỉ đọc, không sửa/xóa |
| UC13 Import/Export | `POST /admin/imports`, `GET /admin/imports/{id}`, `GET /admin/exports/players.csv` | `import_job`, `import_error`, `job` | Should | Preview → commit, báo cáo dòng lỗi |

---

## 9. Matching Engine — kế hoạch triển khai

### 9.1 Nguyên tắc
- V2 là chuẩn vận hành: `F = 0,45F_fee + 0,35F_wage + 0,20F_con`; `R = 0,5R_inj + 0,5R_resale`; `Matching = w_F·F + w_S·S + w_R·R`.
- `S` là điểm của **vai trò được yêu cầu**, không phải trung bình các vai trò; nhiều vai trò → lấy max.
- Thiếu dữ liệu có trọng số dương → `NULL`, không chia lại trọng số, không gán 0. Ngoại lệ duy nhất: thiếu lịch sử chấn thương → 70 + cờ.
- Mọi kết quả lưu kèm `config_id`, `matrix_id`, ngày dữ liệu để tái lập.

### 9.2 Việc còn thiếu phải bổ sung (migration `004_matching_pipeline.sql`)
1. `fn_candidates(requirement_id, params)` — truy vấn theo nhóm vị trí, `min_minutes`, `allow_position_shift` (quy tắc 25% phút), bộ lọc phụ (tuổi/chân/giải).
2. `fn_run_match(requirement_id, params, user_id)` — áp lọc cứng `S ≥ s_min`, `fee ≤ B(1+τ_fee)`, `wage ≤ W_cap(1+τ_wage)`; tính F/S/R; xếp hạng; ghi `match_run` + `match_result` + **`match_exclusion` cho mọi ứng viên bị loại**.
3. `fn_alternatives(player_id, requirement_id, n=3)` — cùng vị trí chính, loại cầu thủ gốc, F cao hơn, xếp theo `0,6·similarity + 0,4·matching`.
4. Thứ tự khi bằng điểm: **S → F → phí thấp hơn** (đặc tả §5.2).
5. Pros/Cons + câu giải thích sinh ở tầng service từ dữ liệu có cấu trúc (dễ i18n và test), không hardcode trong SQL.

### 9.3 Hiệu năng tính sẵn
- Sau mỗi lần import/verify: chạy `fn_refresh_percentiles(season)` rồi `fn_refresh_role_scores(season, matrix)`; ghi `job` để theo dõi thời gian.
- Nếu grid lọc chậm: thêm materialized view `mv_player_grid` + `REFRESH CONCURRENTLY` trong cùng job.

### 9.4 Ma trận kiểm thử (25 ca, đặt trong `supabase/tests/` + Vitest integration)

| Nhóm | Ca kiểm thử |
|---|---|
| Tài chính (7) | phí = 0 (free agent) → 100; phí = 0,7B → 58; phí = B → 40; phí = B(1+τ) → 0; phí > B(1+τ) → NULL + loại; lương = trần → 40; lương vượt trần quá τ → loại |
| Hợp đồng (2) | trong [2,4] năm → 100; 1 năm → 70; 0,5 năm → 55; 5 năm → 70 |
| Trọng số (4) | tổng = 1 giữ nguyên; tổng ≠ 1 → chuẩn hóa + thông báo; tổng = 0 → lỗi; trọng số âm → lỗi |
| Ma trận vai trò (2) | thiếu trọng số / tổng ≠ 100% → chặn kích hoạt; percentile trùng giá trị xử lý ties đúng |
| Percentile (3) | nhóm tham chiếu < 450 phút bị loại; cầu thủ 600 phút → trần `S_minute+20`; 0 phút → "chưa đánh giá", không phải 0 |
| Dữ liệu thiếu (4) | thiếu tracking → chuyển trọng số Press/PrgC; thiếu lịch sử chấn thương → 70 + cờ; thiếu chuỗi giá (< 4 mốc) → R null; thiếu 1 trụ cột → không có Matching cuối |
| Rủi ro (2) | cửa sổ 24 tháng với ω 1,0/0,6; phạt tái phát + ca ≥ 90 ngày |
| Giải thích & tái lập (3) | mỗi kết quả có đóng góp w×điểm + cảnh báo; lý do loại ghi cho từng ứng viên; cùng input+config → cùng điểm |
| Tổng hợp (2) | vai trò gần ngang (< 3 điểm) → cờ, S không đổi; ca case study M ra F 62,9 / S 81,4 / R 80,2 / Matching 75,6 (sai số ±0,2) |

---

## 10. Dữ liệu & khởi tạo

| Bước | Nội dung | Ghi chú |
|---|---|---|
| Nguồn | **Generator nội bộ** `scripts/generate-demo-data.ts` (seed cố định, deterministic) | Không phụ thuộc Kaggle; cùng seed → cùng dữ liệu |
| Danh mục | 200 CLB thuộc 10 giải (5 giải lớn + 5 giải phụ), tên tổng hợp, có `country/league/founded_year` | Không dùng tên CLB/cầu thủ thật với số liệu sai |
| Cầu thủ | 5.000 cầu thủ, tuổi 16–38, vị trí theo tỉ lệ thực tế, 20% có vị trí phụ, quốc tịch đa dạng | `market_value` theo phân bố log-normal |
| Hợp đồng | ≥ 8.000 bản ghi: hiện hành + lịch sử, 8% cho mượn (có CLB gốc), 5% free agent, không chồng lấn (exclusion constraint sẽ chặn nếu sai) | Test BR01/BR02 |
| Thống kê | 3 mùa × `player_season_metrics`: 60% cầu thủ ≥ 900 phút, 15% < 450 phút, 5% thiếu tracking | Test percentile và nhánh dữ liệu thiếu |
| Tài chính | `salary_per_year`, `release_clause`, `fee` theo bậc CLB; **`reliability_label = 'simulated'`** + `source = 'DEMO_GENERATOR'` | Cần migration bổ sung nhãn `simulated` (D8) |
| Chấn thương | 24 tháng gần nhất, có ca ≥ 90 ngày và tái phát cùng vùng; 10% `injury_history_complete = false` | Test R_inj và cờ thiếu dữ liệu |
| Giá trị thị trường | Chuỗi 24 tháng, ≥ 4 mốc cho 70% cầu thủ; 30% thiếu chuỗi để test `fn_price_trend` trả NULL | Test R_resale |
| Kiểm tra sau seed | Không chồng lấn hợp đồng; `end_date > start_date`; ma trận đủ 100%; `v_player_card` trả đúng; đếm đủ quy mô | Script `npm run db:check`, chạy trong CI |
| Lịch refresh | Sau seed và nightly: percentiles → role scores → (mv grid) | Gọi qua `/api/v1/jobs/run`, ghi `job` |

---

## 11. Yêu cầu phi chức năng

| Nhóm | Kế hoạch |
|---|---|
| Hiệu năng | Index sẵn có (trgm, partial); keyset pagination; cache kết quả suggest 60s; EXPLAIN cho 5 truy vấn nóng; mục tiêu tìm < 2s/50k, chấm 1 cầu thủ < 1s, 100 cầu thủ < 10s |
| Bảo mật | argon2id; JWT 15' + refresh xoay vòng (hash SHA-256); RBAC ở server; zod ở biên; rate limit theo IP+user; header bảo mật; CSRF cho cookie; không log dữ liệu nhạy cảm; DB credential chỉ ở server |
| Tin cậy dữ liệu | `record_status` draft→verified; nhãn tin cậy bắt buộc cho dữ liệu tài chính; audit bất biến; backup Supabase |
| i18n | `vi` mặc định, `en`; chuỗi trong `packages/shared/i18n`; format số/ngày theo locale |
| Accessibility | semantic HTML, focus ring, contrast AA, thao tác chính ≤ 3 bước từ màn hình chính |
| Bảo trì | Không hardcode trọng số/ngưỡng (đọc từ `scoring_config.params`); module hóa service; OpenAPI là hợp đồng giữa Web/Mobile |

---

## 12. Tiêu chí nghiệm thu (map từ tài liệu §13)

- [ ] UC bắt buộc (02–06, 08, 10) chạy trên Web; UC bắt buộc chạy trên Mobile (trừ phần quản trị).
- [ ] 25 ca kiểm thử Matching xanh, gồm biên và dữ liệu thiếu.
- [ ] Phân quyền đúng 3 vai trò; mọi thay đổi master xuất hiện trong `audit_log`.
- [ ] Dữ liệu tài chính hiển thị kèm nhãn tin cậy; Guest không thấy lương.
- [ ] Thông báo biến động gửi đúng người theo dõi, không trùng.
- [ ] Hiệu năng đạt mục tiêu trên tập demo (đo bằng script, lưu kết quả vào báo cáo).
- [ ] Migrations chạy từ DB rỗng trên project staging, `npm run seed` + `npm run db:check` xanh, không lỗi constraint.
- [ ] Bộ tài liệu: SRS, ERD mới, use case diagram, OpenAPI, test report, kịch bản demo.

---

## 13. Rủi ro & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Scope rộng (Web + Mobile + 13 UC) | Cao | MoSCoW đã có; cắt theo thứ tự mục 7; mobile làm sau Web |
| Migration schema không tái lập được | Cao | P0 là điều kiện vào các phase sau; `db:check` chạy trong CI; trước mỗi đợt release tạo lại staging từ migrations |
| Matching "đúng đặc tả" nhưng khó chứng minh | Trung bình | Bộ 25 ca + case study M + lưu config version |
| Percentile/role score chạy lâu khi 5k cầu thủ × 35 vai trò | Trung bình | Chạy batch ngoài request; đo thời gian; nếu > 60s thì tối ưu set-based + index |
| Dữ liệu thật thiếu lương/phí | Cao | Sinh dữ liệu có nhãn `simulated` + điểm trung tính + cảnh báo "độ đầy đủ dữ liệu thấp" |
| Push notification cần credential FCM/APNs | Trung bình | Trung tâm thông báo trong app trước; push qua Expo Push là best-effort |
| Windows/PowerShell làm hỏng encoding tiếng Việt | Trung bình | Mọi script đọc/ghi UTF-8 tường minh; `.editorconfig`; test đọc tên có dấu |
| Máy dev không có Docker → không chạy `supabase start` | Trung bình | D9: validate bằng project staging + `--dry-run`; chỉ cài Docker khi thực sự cần |
| Vercel Hobby giới hạn cron/function time | Trung bình | Job idempotent, chia lô nhỏ; demo bằng nút "Chạy ngay"; nâng Pro nếu cần |

---

## 14. Tuần 1 — checklist bắt tay ngay

1. ~~Chốt quyết định D1–D6~~ (đã chốt ngày 20/11/2026, xem mục 15).
2. `git init`; `.gitignore` (bỏ `.env`, `.next`, `node_modules`, `supabase/.temp`), `.editorconfig` (utf-8, LF), `.env.example`.
3. Chuyển `football-transfer-db/supabase` → `supabase/` ở root; tách `football_transfer_db.sql` thành:
   - `supabase/migrations/20261120000100_schema.sql`
   - `supabase/migrations/20261120000200_functions_views.sql`
   - `supabase/seed.sql` (phần 03 reference data)
4. Archive migration cũ chỉ chứa functions (đã gộp vào 002) để tránh chạy trùng trigger.
5. Thêm migration `20261120000300_simulated_label.sql` (nhãn tin cậy `simulated`) và `20261120000400_matching_pipeline.sql` (khung).
6. Script `npm run db:check` chạy các query assert (ma trận 100%, config active duy nhất, không hợp đồng chồng lấn).
7. Scaffold `apps/web`: Next.js + Tailwind + layout + `/api/v1/health` + error envelope + `packages/shared` (zod base).
8. CI: `npm ci && npm run typecheck && npm run lint && npm run test && npm run build`.
9. Tạo khung `docs/` (SRS, API, test-cases) và ghi ADR cho D1–D9.
10. `npx supabase link` + `db push --dry-run` lên staging; nếu chưa có staging thì dùng tạm project hiện tại sau khi xác nhận.

**Lệnh kiểm tra DB sau khi tách migration:**

```sql
-- ma trận phải không còn vai trò lệch 100%
SELECT * FROM fn_validate_matrix(
  (SELECT id FROM role_weight_matrix WHERE version = 'rwm-v2.0')
) WHERE NOT ok;

-- chỉ một cấu hình active
SELECT count(*) FROM scoring_config WHERE status = 'active';  -- = 1
```

---

## 15. Quyết định đã chốt (20/11/2026)

| # | Vấn đề | Chốt |
|---|---|---|
| 1 | Mobile | **Bắt buộc** — Expo, làm ở P7b (1,5 tuần), build APK qua EAS để demo trên máy thật |
| 2 | Deploy | **Supabase (Postgres/Storage) + Vercel (Web/API)**; job nền qua route handler + `pg_cron`/Vercel Cron |
| 3 | Dữ liệu | **Không dùng Kaggle** — generator có seed sinh 5.000/200/8.000/3 mùa, nhãn `simulated` |
| 4 | Auth | **Custom auth** theo `app_user` + `refresh_token` (nhanh nhất, không phải sửa 88 KB SQL, không đụng FKs) |
| 5 | Tài liệu | **Nộp kèm đầy đủ**: SRS, use case diagram, ERD mới, OpenAPI, test report, kịch bản demo |

**Cần bạn cung cấp để chạy P0–P1:**

1. Quyền tạo **Supabase staging project** (hoặc đồng ý dùng chính project hiện tại làm dev, chấp nhận reset schema).
2. **Supabase access token** (để `npx supabase link/db push`) — chỉ đặt trong biến môi trường máy, không commit.
3. Tài khoản **Vercel** + tên miền dự kiến (mặc định dùng `*.vercel.app`).
4. Mẫu/định dạng **báo cáo đồ án** (Word/LaTeX) để tài liệu sinh ra đúng cấu trúc trường yêu cầu.
