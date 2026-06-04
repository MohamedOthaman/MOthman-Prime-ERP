import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { bootstrapPlatformRuntime } from "./platform/bootstrap";
import { initErrorSink } from "./lib/errorSink";
import { startEngine } from "./lib/automation";

bootstrapPlatformRuntime();
initErrorSink();
// The automation engine must never block or crash app startup.
try {
  startEngine();
} catch (err) {
  console.error("[Automation] startEngine failed — automation disabled:", err);
}

createRoot(document.getElementById("root")!).render(<App />);
