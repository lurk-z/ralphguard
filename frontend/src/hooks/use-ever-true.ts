"use client";

import { useEffect, useState } from "react";

/**
 * Turns true the first time `value` is true and stays true.
 * Used to mount a heavy, lazily loaded panel (library, modal, assistant) only
 * once it is first opened, then keep it mounted so its state survives.
 */
export function useEverTrue(value: boolean) {
  const [ever, setEver] = useState(value);
  useEffect(() => {
    if (value) setEver(true);
  }, [value]);
  return ever || value;
}
