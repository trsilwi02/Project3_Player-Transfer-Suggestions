import { z } from 'zod';

export const MatchingParamsSchema = z.object({
  s_min: z.coerce.number().min(0).max(100).default(50.0),
  min_minutes: z.coerce.number().min(0).default(450),
  tau_fee: z.coerce.number().min(0).max(1.0).default(0.10),
  tau_wage: z.coerce.number().min(0).max(1.0).default(0.10),
  allow_position_shift: z.boolean().default(false),
  w_f: z.coerce.number().min(0).max(1.0).optional(),
  w_s: z.coerce.number().min(0).max(1.0).optional(),
  w_r: z.coerce.number().min(0).max(1.0).optional(),
});

export type MatchingParams = z.infer<typeof MatchingParamsSchema>;

const ClubRequirementBaseSchema = z.object({
  name: z.string().trim().min(1, 'Tên nhu cầu không được để trống').max(100).optional(),
  clubId: z.number().int().positive().nullable().optional(),
  position: z.string().min(1, 'Vị trí không được để trống'),
  minAge: z.number().int().min(15).max(45).nullable().optional(),
  maxAge: z.number().int().min(15).max(45).nullable().optional(),
  salaryLimit: z.number().positive('Trần lương phải lớn hơn 0'),
  budget: z.number().positive('Ngân sách chuyển nhượng phải lớn hơn 0'),
  priority: z.number().int().min(1).max(5).default(3),
  roleIds: z.array(z.number().int().positive()).optional().default([]),
  matchingParams: MatchingParamsSchema.optional().default(() => MatchingParamsSchema.parse({})),
});

export const ClubRequirementCreateSchema = ClubRequirementBaseSchema.refine(
  data => !data.minAge || !data.maxAge || data.minAge <= data.maxAge,
  { message: 'minAge không được lớn hơn maxAge', path: ['maxAge'] }
);

export type ClubRequirementCreate = z.infer<typeof ClubRequirementCreateSchema>;

export const ClubRequirementUpdateSchema = ClubRequirementBaseSchema.partial().refine(
  data => !data.minAge || !data.maxAge || data.minAge <= data.maxAge,
  { message: 'minAge không được lớn hơn maxAge', path: ['maxAge'] }
);
export type ClubRequirementUpdate = z.infer<typeof ClubRequirementUpdateSchema>;

export interface ClubRequirement {
  id: number;
  userId: number;
  name?: string;
  clubId?: number | null;
  clubName?: string | null;
  position: string;
  minAge?: number | null;
  maxAge?: number | null;
  salaryLimit: number;
  budget: number;
  priority: number;
  roleIds: number[];
  matchingParams: MatchingParams;
  createdAt: string;
  updatedAt: string;
}
