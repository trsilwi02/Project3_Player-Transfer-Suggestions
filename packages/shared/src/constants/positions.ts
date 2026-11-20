export interface PositionGroup {
  code: string;
  nameVi: string;
  isScorable: boolean;
  sortOrder: number;
}

export const POSITION_GROUPS: Record<string, PositionGroup> = {
  CB: { code: 'CB', nameVi: 'Trung vệ', isScorable: true, sortOrder: 1 },
  'RB/LB': { code: 'RB/LB', nameVi: 'Hậu vệ biên/cánh', isScorable: true, sortOrder: 2 },
  'CM/CDM': { code: 'CM/CDM', nameVi: 'Tiền vệ trung tâm/phòng ngự', isScorable: true, sortOrder: 3 },
  CAM: { code: 'CAM', nameVi: 'Tiền vệ công', isScorable: true, sortOrder: 4 },
  'LW/RW': { code: 'LW/RW', nameVi: 'Tiền đạo cánh', isScorable: true, sortOrder: 5 },
  ST: { code: 'ST', nameVi: 'Tiền đạo cắm', isScorable: true, sortOrder: 6 },
  GK: { code: 'GK', nameVi: 'Thủ môn', isScorable: false, sortOrder: 7 },
};

export const POSITION_ADJACENCY: Record<string, string[]> = {
  'RB/LB': ['LW/RW'],
  'CM/CDM': ['CAM'],
  CAM: ['CM/CDM', 'LW/RW', 'ST'],
  'LW/RW': ['RB/LB', 'CAM', 'ST'],
  ST: ['CAM', 'LW/RW'],
};

export const RELIABILITY_LABELS = [
  'rumor',
  'reputable_media',
  'official',
  'financial_report',
  'simulated',
] as const;

export type ReliabilityLabel = (typeof RELIABILITY_LABELS)[number];

export const USER_ROLES = ['scout', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number] | 'guest';

export const RECOMMENDATION_LEVELS = {
  high: { code: 'high', labelVi: 'Khuyến nghị cao', minScore: 80, color: '#16a34a' },
  consider: { code: 'consider', labelVi: 'Cần cân nhắc', minScore: 50, color: '#ca8a04' },
  risk: { code: 'risk', labelVi: 'Rủi ro cao', minScore: 0, color: '#dc2626' },
} as const;
