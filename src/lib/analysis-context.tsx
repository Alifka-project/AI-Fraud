"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { RiskAssessmentResult } from "./types";

interface AnalysisContextValue {
  result: RiskAssessmentResult | null;
  setResult: (r: RiskAssessmentResult | null) => void;
  clear: () => void;
}

const STORAGE_KEY = "investorshield:lastAnalysis";

const AnalysisContext = createContext<AnalysisContextValue | undefined>(undefined);

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [result, setResultState] = useState<RiskAssessmentResult | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setResultState(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const setResult = useCallback((r: RiskAssessmentResult | null) => {
    setResultState(r);
    try {
      if (r) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  const clear = useCallback(() => setResult(null), [setResult]);

  return (
    <AnalysisContext.Provider value={{ result, setResult, clear }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used inside AnalysisProvider");
  return ctx;
}
