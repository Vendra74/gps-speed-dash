import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Initialize mobile debugging console
// Show on mobile devices, in dev mode, or when ?debug=true is in URL
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile || import.meta.env.DEV || window.location.search.includes('debug=true')) {
  import('eruda').then(({ default: eruda }) => eruda.init());
}

// Initialize Sentry for error monitoring in production
initSentry();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
