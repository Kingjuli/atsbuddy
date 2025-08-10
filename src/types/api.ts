export type AnalysisResponse = {
  ok: boolean;
  requestId?: string;
  data?: {
    score?: number;
    highlights?: string[];
    missingKeywords?: string[];
    rewriteBullets?: string[];
    atsAudit?: string;
    coverLetterTemplate?: string;
    generalGuidance?: string;
    message?: string;
  };
  error?: string;
};


