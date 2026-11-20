-- =====================================================================
-- Migration 003: Thêm nhãn độ tin cậy 'simulated' cho dữ liệu mô phỏng demo
-- Quyết định D8 & Khắc phục Gap G3 trong docs/ke-hoach-xay-dung.md
-- =====================================================================

-- 1. Bảng contract
ALTER TABLE contract DROP CONSTRAINT IF EXISTS contract_reliability_label_check;
ALTER TABLE contract ADD CONSTRAINT contract_reliability_label_check 
  CHECK (reliability_label IS NULL OR reliability_label IN ('rumor','reputable_media','official','financial_report','simulated'));

-- 2. Bảng transfer
ALTER TABLE transfer DROP CONSTRAINT IF EXISTS transfer_reliability_label_check;
ALTER TABLE transfer ADD CONSTRAINT transfer_reliability_label_check 
  CHECK (reliability_label IS NULL OR reliability_label IN ('rumor','reputable_media','official','financial_report','simulated'));

-- 3. Bảng market_value
ALTER TABLE market_value DROP CONSTRAINT IF EXISTS market_value_reliability_label_check;
ALTER TABLE market_value ADD CONSTRAINT market_value_reliability_label_check 
  CHECK (reliability_label IN ('rumor','reputable_media','official','financial_report','simulated'));

COMMENT ON COLUMN contract.reliability_label IS 'Độ tin cậy: rumor, reputable_media, official, financial_report, simulated (demo)';
COMMENT ON COLUMN transfer.reliability_label IS 'Độ tin cậy: rumor, reputable_media, official, financial_report, simulated (demo)';
COMMENT ON COLUMN market_value.reliability_label IS 'Độ tin cậy: rumor, reputable_media, official, financial_report, simulated (demo)';
