import { useState, useCallback } from "react";

export function useAiPanel(defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return { open, toggle, close };
}
