export const EN_TRANSLATIONS = {
  recommendation: {
    high: 'Highly Recommended',
    consider: 'To Consider',
    risk: 'High Risk',
  },
  flags: {
    ROLE_TIE: 'Two tactical roles have nearly tied scores (< 3 pts diff)',
    EXPIRING_CONTRACT: 'Contract expires in <= 6 months (Free Agent Opportunity)',
    PRICE_SERIES_INCOMPLETE: 'Market value history has fewer than 4 checkpoints',
    INJURY_PRONE: 'Significant injury record in the last 24 months',
    AGE_WARNING: 'Age may impact resale value over the next 3 years',
    DATA_LOW_CONFIDENCE: 'Financial data is marked as simulated demo data',
  },
  exclusions: {
    BUDGET_EXCEEDED: 'Estimated fee exceeds club transfer budget limit',
    WAGE_CAP_EXCEEDED: 'Estimated salary exceeds wage cap limit',
    TACTICAL_FIT_BELOW_MINIMUM: 'Tactical role fit score is below minimum threshold',
    AGE_OUT_OF_RANGE: 'Player age is outside the requested range',
    UNSUPPORTED_POSITION: 'Position is currently unsupported by the Matching Engine',
  },
  pillars: {
    f: 'Financial Feasibility',
    s: 'Squad & Tactical Fit',
    r: 'Risk & Resale Potential',
  },
};
