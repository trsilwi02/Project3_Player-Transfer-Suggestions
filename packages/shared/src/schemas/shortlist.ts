import { z } from 'zod';

export const ShortlistAddSchema = z.object({
  playerId: z.number().int().positive('ID cầu thủ không hợp lệ'),
  requirementId: z.number().int().positive().nullable().optional(),
  note: z.string().max(255).optional(),
});

export type ShortlistAdd = z.infer<typeof ShortlistAddSchema>;

export const ShortlistUpdateSchema = z.object({
  note: z.string().max(255),
});

export type ShortlistUpdate = z.infer<typeof ShortlistUpdateSchema>;

export interface ShortlistItem {
  id: number;
  userId: number;
  requirementId?: number | null;
  note?: string | null;
  createdAt: string;
  playerId: number;
  playerName: string;
  age: number;
  position: string;
  clubName?: string | null;
  contractEndDate?: string | null;
  feeEstDefault?: number | null;
  matching?: number | null;
  fScore?: number | null;
  sScore?: number | null;
  rScore?: number | null;
  runId?: string | null;
  stale?: boolean;
}
