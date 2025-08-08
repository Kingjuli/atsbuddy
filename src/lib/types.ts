export type AnalysisResponse = {
  ok: boolean;
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


