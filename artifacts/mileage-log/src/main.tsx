import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Attach the configured API key (if any) as a bearer token on every request.
setAuthTokenGetter(() => import.meta.env.VITE_API_KEY ?? null);

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker for PWA support (production builds only).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js")
      .catch(() => {
        /* registration failures are non-fatal */
      });
  });
}
