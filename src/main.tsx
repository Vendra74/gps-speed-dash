import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Initialize mobile debugging console (only in dev or when ?debug=true is in URL)
if (import.meta.env.DEV || window.location.search.includes('debug=true')) {
  import('eruda').then(({ default: eruda }) => eruda.init());
}

// Initialize Sentry for error monitoring in production
initSentry();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
