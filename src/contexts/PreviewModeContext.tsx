import { createContext, useContext, useState, type ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewModeContextType {
  /** The role being previewed, or null if not in preview mode */
  previewRole: string | null;
  /** Set a role to preview (null to exit) */
  setPreviewRole: (role: string | null) => void;
  /** Whether preview mode is currently active */
  isPreviewMode: boolean;
  /** Exit preview mode */
  exitPreview: () => void;
}

// ─── Context (safe default — never throws outside provider) ──────────────────

const PreviewModeContext = createContext<PreviewModeContextType>({
  previewRole: null,
  setPreviewRole: () => {},
  isPreviewMode: false,
  exitPreview: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function PreviewModeProvider({ children }: { children: ReactNode }) {
  const [previewRole, setPreviewRoleState] = useState<string | null>(null);

  const value: PreviewModeContextType = {
    previewRole,
    setPreviewRole: setPreviewRoleState,
    isPreviewMode: previewRole !== null,
    exitPreview: () => setPreviewRoleState(null),
  };

  return (
    <PreviewModeContext.Provider value={value}>
      {children}
    </PreviewModeContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Access preview mode state and controls.
 * Safe to call outside PreviewModeProvider — returns a no-op default.
 */
export function usePreviewMode() {
  return useContext(PreviewModeContext);
}
