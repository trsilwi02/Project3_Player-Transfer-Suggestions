import { z } from 'zod';
import { MatchingParamsSchema } from './requirement';

export const MatchRunRequestSchema = z.object({
  requirementId: z.number().int().positive('ID nhu cầu không hợp lệ'),
  overrideParams: MatchingParamsSchema.partial().optional(),
});

export type MatchRunRequest = z.infer<typeof MatchRunRequestSchema>;

export interface BreakdownScore {
  f_fee: number | null;
  f_wage: number | null;
  f_con: number | null;
  r_inj: number | null;
  r_resale: number | null;
  years_left: number | null;
  fee_est: number | null;
  wage_est: number | null;
}

export interface MatchResultItem {
  id: number;
  runId: string;
  playerId: number;
  playerName: string;
  age: number;
  position: string;
  clubName: string | null;
  league: string | null;
  marketValue: number | null;
  rank: number;
  matching: number | null;
  fScore: number | null;
  sScore: number | null;
  rScore: number | null;
  requestedRoleId?: number | null;
  requestedRoleName?: string | null;
  recommendation?: 'high' | 'consider' | 'risk' | null;
  breakdown: BreakdownScore;
  pros: string[];
  cons: string[];
  flags: string[];
  explanation?: string | null;
}

export interface MatchExclusionItem {
  playerId: number;
  playerName: string;
  position: string;
  reasons: Array<{ code: string; message: string }>;
}

export interface AlternativeCandidate {
  playerId: number;
  playerName: string;
  position: string;
  age: number;
  clubName: string | null;
  feeEst: number;
  fScore: number;
  sScore: number;
  matching: number;
  similarityScore: number;
}

export interface MatchRunDetail {
  id: string;
  runCode: string;
  requirementId: number;
  configId: number;
  matrixId: number;
  paramsSnapshot: any;
  summary: {
    candidates_count?: number;
    passed_count?: number;
    excluded_count?: number;
    avg_matching?: number;
  };
  dataAsOf: string;
  createdAt: string;
  results: MatchResultItem[];
  exclusions?: MatchExclusionItem[];
}
