import { z } from 'zod';
import { RELIABILITY_LABELS } from '../constants/positions';

export const PlayerQueryFilterSchema = z.object({
  q: z.string().optional(),
  position: z.string().optional(),
  minAge: z.coerce.number().int().min(15).max(45).optional(),
  maxAge: z.coerce.number().int().min(15).max(45).optional(),
  minMarketValue: z.coerce.number().min(0).optional(),
  maxMarketValue: z.coerce.number().min(0).optional(),
  freeAgentWindow: z.coerce.number().int().min(1).max(24).optional(), // months remaining <= X
  minMinutes: z.coerce.number().min(0).optional(),
  league: z.string().optional(),
  clubId: z.coerce.number().int().optional(),
  sortBy: z.enum(['market_value', 'name', 'age', 'contract_end_date', 'season_minutes']).default('market_value'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PlayerQueryFilter = z.infer<typeof PlayerQueryFilterSchema>;

export const PlayerCardPublicSchema = z.object({
  id: z.number(),
  name: z.string(),
  dateOfBirth: z.string(),
  age: z.number(),
  nationality: z.string().nullable().optional(),
  position: z.string(),
  height: z.number().nullable().optional(),
  preferredFoot: z.string().nullable().optional(),
  status: z.string(),
  marketValue: z.number().nullable().optional(),
  marketValueLabel: z.enum(RELIABILITY_LABELS).nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  clubId: z.number().nullable().optional(),
  clubName: z.string().nullable().optional(),
  league: z.string().nullable().optional(),
  contractId: z.number().nullable().optional(),
  contractType: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  contractEndDate: z.string().nullable().optional(),
  monthsRemaining: z.number().nullable().optional(),
  releaseClause: z.number().nullable().optional(),
  contractReliability: z.enum(RELIABILITY_LABELS).nullable().optional(),
  parentClubId: z.number().nullable().optional(),
  seasonMinutes: z.number().nullable().optional(),
});

export type PlayerCardPublic = z.infer<typeof PlayerCardPublicSchema>;

export const PlayerCardFullSchema = PlayerCardPublicSchema.extend({
  salaryPerYear: z.number().nullable().optional(),
});

export type PlayerCardFull = z.infer<typeof PlayerCardFullSchema>;
