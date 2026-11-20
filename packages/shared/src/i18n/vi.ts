export const VI_TRANSLATIONS = {
  recommendation: {
    high: 'Khuyến nghị cao',
    consider: 'Cần cân nhắc',
    risk: 'Rủi ro cao',
  },
  flags: {
    ROLE_TIE: 'Hai vai trò chiến thuật có điểm gần tương đương (< 3 điểm)',
    EXPIRING_CONTRACT: 'Hợp đồng còn dưới 6 tháng (Cơ hội chuyển nhượng tự do)',
    PRICE_SERIES_INCOMPLETE: 'Chuỗi dữ liệu giá trị thị trường chưa đủ mốc 24 tháng',
    INJURY_PRONE: 'Tiền sử chấn thương đáng lưu ý trong 24 tháng gần nhất',
    AGE_WARNING: 'Độ tuổi có thể ảnh hưởng đến tiềm năng bán lại trong 3 năm tới',
    DATA_LOW_CONFIDENCE: 'Dữ liệu tài chính ở mức độ ước tính mô phỏng (simulated)',
  },
  exclusions: {
    BUDGET_EXCEEDED: 'Phí ước tính vượt quá giới hạn ngân sách CLB',
    WAGE_CAP_EXCEEDED: 'Mức lương ước tính vượt quá trần quỹ lương',
    TACTICAL_FIT_BELOW_MINIMUM: 'Điểm tương thích chiến thuật không đạt ngưỡng tối thiểu',
    AGE_OUT_OF_RANGE: 'Độ tuổi nằm ngoài phạm vi yêu cầu',
    UNSUPPORTED_POSITION: 'Vị trí này chưa hỗ trợ chấm điểm trong Matching Engine',
  },
  pillars: {
    f: 'Khả thi tài chính',
    s: 'Phù hợp chiến thuật',
    r: 'Rủi ro & Tương lai',
  },
};
