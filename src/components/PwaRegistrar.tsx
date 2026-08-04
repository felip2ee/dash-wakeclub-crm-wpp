import { useEffect } from "react";

/** Registra o service worker mínimo da PWA apenas no ambiente publicado. */
export function PwaRegistrar() {
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  return null;
}
