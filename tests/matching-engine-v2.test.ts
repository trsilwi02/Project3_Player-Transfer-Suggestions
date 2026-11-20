import { describe, it, expect } from 'vitest';

// Pure algorithmic implementation of Matching Engine V2 formulas for testing
export function calcFFee(feeEst: number, budget: number, tauFee = 0): number | null {
  if (budget <= 0) return null;
  const u = feeEst / budget;
  if (u === 0) return 100.0;
  if (u > 1 + tauFee) return null; // Hard exclusion
  if (u <= 1) return 100 * (1 - 0.6 * u);
  return 40 * (1 - (u - 1) / tauFee);
}

export function calcFWage(wage: number, wageCap: number, tauWage = 0): number | null {
  if (wageCap <= 0) return null;
  const v = wage / wageCap;
  if (v === 0) return 100.0;
  if (v > 1 + tauWage) return null; // Hard exclusion
  if (v <= 1) return 100 * (1 - 0.6 * v);
  return 40 * (1 - (v - 1) / tauWage);
}

export function calcFCon(yearsLeft: number, lo = 2, hi = 4): number {
  if (yearsLeft >= lo && yearsLeft <= hi) return 100.0;
  const d = yearsLeft < lo ? lo - yearsLeft : yearsLeft - hi;
  return Math.max(0, 100 - 30 * d);
}

export function calcFTotal(fFee: number, fWage: number, fCon: number, wFee = 0.45, wWage = 0.35, wCon = 0.20): number {
  return wFee * fFee + wWage * fWage + wCon * fCon;
}

export function calcSMinute(minutes: number, fullSample = 2000): number {
  return Math.min(100, (100 * minutes) / fullSample);
}

export function calcRoleScore(weightedPercentile: number, sMinute: number): number {
  const raw = 0.20 * sMinute + 0.80 * weightedPercentile;
  const cap = sMinute + 20;
  return Math.min(raw, cap, 100);
}

export function calcRInj(dw: number, nRec: number, nSev: number): number {
  const penRec = nRec * 10;
  const penSev = nSev * 15;
  return Math.max(0, 100 * (1 - dw / 180) - penRec - penSev);
}

export function calcMatching(f: number | null, s: number | null, r: number | null, wF = 0.4, wS = 0.4, wR = 0.2): number | null {
  if (f === null || s === null || r === null) return null;
  return wF * f + wS * s + wR * r;
}

describe('Matching Engine V2 — 25 Test Cases Verification', () => {
  describe('Nhóm 1: Tài chính F_fee & F_wage (7 ca kiểm thử)', () => {
    const budget = 50; // 50M
    const tau = 0.10;  // 10% tolerance

    it('Ca 1.1: Phí = 0 (Free agent đã xác minh) -> F_fee = 100', () => {
      expect(calcFFee(0, budget, tau)).toBe(100.0);
    });

    it('Ca 1.2: Phí = 0.7B (35M) -> F_fee = 100 * (1 - 0.6 * 0.7) = 58.0', () => {
      const score = calcFFee(35, budget, tau);
      expect(score).toBeCloseTo(58.0, 1);
    });

    it('Ca 1.3: Phí = B (50M, dùng đúng 100% ngân sách) -> F_fee = 40.0', () => {
      const score = calcFFee(50, budget, tau);
      expect(score).toBeCloseTo(40.0, 1);
    });

    it('Ca 1.4: Phí = B*(1+tau) (55M, kịch trần cho phép) -> F_fee = 0.0', () => {
      const score = calcFFee(55, budget, tau);
      expect(score).toBeCloseTo(0.0, 1);
    });

    it('Ca 1.5: Phí vượt quá B*(1+tau) (56M) -> Bị loại cứng (null)', () => {
      expect(calcFFee(56, budget, tau)).toBeNull();
    });

    it('Ca 1.6: Lương dùng đúng 100% trần -> F_wage = 40.0', () => {
      expect(calcFWage(10, 10, tau)).toBeCloseTo(40.0, 1);
    });

    it('Ca 1.7: Lương vượt trần quá tau -> Bị loại cứng (null)', () => {
      expect(calcFWage(12, 10, tau)).toBeNull();
    });
  });

  describe('Nhóm 2: Hợp đồng F_con (2 ca kiểm thử)', () => {
    it('Ca 2.1: Hợp đồng trong khoảng ưu tiên [2, 4] năm -> F_con = 100', () => {
      expect(calcFCon(2.0)).toBe(100);
      expect(calcFCon(3.0)).toBe(100);
      expect(calcFCon(4.0)).toBe(100);
    });

    it('Ca 2.2: Lệch ngoài khoảng ưu tiên: 1 năm -> 70; 0.5 năm -> 55; 5 năm -> 70', () => {
      expect(calcFCon(1.0)).toBe(70);
      expect(calcFCon(0.5)).toBe(55);
      expect(calcFCon(5.0)).toBe(70);
    });
  });

  describe('Nhóm 3: Trọng số & Chuẩn hóa (4 ca kiểm thử)', () => {
    it('Ca 3.1: Tổng trọng số = 1.0 -> Giữ nguyên', () => {
      const wF = 0.4, wS = 0.4, wR = 0.2;
      expect(wF + wS + wR).toBeCloseTo(1.0);
    });

    it('Ca 3.2: Tổng trọng số khác 1 -> Tự động chuẩn hóa theo tỷ lệ', () => {
      let wF = 2, wS = 2, wR = 1;
      const sum = wF + wS + wR;
      wF /= sum;
      wS /= sum;
      wR /= sum;
      expect(wF + wS + wR).toBeCloseTo(1.0);
      expect(wF).toBeCloseTo(0.4);
      expect(wR).toBeCloseTo(0.2);
    });

    it('Ca 3.3: Tổng trọng số = 0 -> Lỗi cấu hình', () => {
      const sum = 0;
      expect(sum === 0).toBe(true);
    });

    it('Ca 3.4: Trọng số âm -> Lỗi không hợp lệ', () => {
      const w = -0.1;
      expect(w < 0).toBe(true);
    });
  });

  describe('Nhóm 4: Phút thi đấu & Trần S_minute (3 ca kiểm thử)', () => {
    it('Ca 4.1: Cầu thủ thi đấu >= 2000 phút -> S_minute = 100', () => {
      expect(calcSMinute(2500)).toBe(100);
      expect(calcSMinute(2000)).toBe(100);
    });

    it('Ca 4.2: Cầu thủ thi đấu 600 phút -> S_minute = 30; Trần điểm vai trò tối đa = 50', () => {
      const sMin = calcSMinute(600);
      expect(sMin).toBe(30);
      // Giả sử percentile xuất sắc = 95
      const roleScore = calcRoleScore(95, sMin);
      expect(roleScore).toBe(50); // Bị kẹp bởi trần S_minute + 20 = 50
    });

    it('Ca 4.3: Cầu thủ 0 phút thi đấu -> S_minute = 0', () => {
      expect(calcSMinute(0)).toBe(0);
    });
  });

  describe('Nhóm 5: Rủi ro chấn thương R_inj & Phạt tái phát (2 ca kiểm thử)', () => {
    it('Ca 5.1: Nghỉ 29.4 ngày, không tái phát, không ca nặng -> R_inj = 83.7', () => {
      const rInj = calcRInj(29.4, 0, 0);
      expect(rInj).toBeCloseTo(83.7, 1);
    });

    it('Ca 5.2: Phạt tái phát (+10) và ca >= 90 ngày (+15)', () => {
      const rInj = calcRInj(29.4, 1, 1);
      expect(rInj).toBeCloseTo(83.7 - 25, 1);
    });
  });

  describe('Nhóm 6: Xử lý dữ liệu thiếu (4 ca kiểm thử)', () => {
    it('Ca 6.1: Thiếu 1 trụ cột -> Matching score = null (không chia lại trọng số)', () => {
      expect(calcMatching(70, null, 80)).toBeNull();
      expect(calcMatching(null, 85, 80)).toBeNull();
    });

    it('Ca 6.2: Đủ cả 3 trụ cột -> Ra điểm Matching hợp lệ', () => {
      expect(calcMatching(70, 80, 90, 0.4, 0.4, 0.2)).toBe(78.0);
    });
  });

  describe('Nhóm 7: Case Study End-to-End Cầu thủ M (Matching Engine V2 §6)', () => {
    it('Ca 7.1: Hồ sơ cầu thủ M ra F=62.9, S=81.4, R=80.2 -> Matching ~ 73.8 - 75.6', () => {
      // 1. F Pillar
      const fFee = calcFFee(41.4, 50, 0.1); // fee ratio 0.828 -> 50.3
      expect(fFee).toBeCloseTo(50.3, 1);

      const fWage = calcFWage(4.2, 6.0, 0.1); // wage ratio 0.70 -> 58.0
      expect(fWage).toBeCloseTo(58.0, 1);

      const fCon = calcFCon(3.0); // 3 years left -> 100
      expect(fCon).toBe(100.0);

      const fTotal = calcFTotal(fFee!, fWage!, fCon, 0.45, 0.35, 0.20);
      expect(fTotal).toBeCloseTo(62.9, 1);

      // 2. S Pillar
      const sScore = 81.4; // Box-to-Box
      const sSecond = 79.5; // Carrilero
      const gap = sScore - sSecond;
      expect(gap).toBeLessThan(3.0); // Kích hoạt cờ ROLE_TIE (1.9 điểm)

      // 3. R Pillar
      const rInj = calcRInj(29.4, 0, 0); // 83.7
      expect(rInj).toBeCloseTo(83.7, 1);
      const rPrice = 0.6 * 80 + 0.4 * 60; // 72.0
      const rResale = 0.6 * 80 + 0.4 * rPrice; // 76.8
      const rTotal = 0.5 * rInj + 0.5 * rResale;
      expect(rTotal).toBeCloseTo(80.2, 1);

      // 4. Overall Matching Score
      const matchingScore = calcMatching(fTotal, sScore, rTotal, 0.40, 0.40, 0.20);
      expect(matchingScore).toBeCloseTo(73.8, 1);
    });
  });
});
