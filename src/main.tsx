import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { bootstrapPlatformRuntime } from "./platform/bootstrap";
import { initErrorSink } from "./lib/errorSink";
import { startEngine } from "./lib/automation";

bootstrapPlatformRuntime();
initErrorSink();
startEngine();

createRoot(document.getElementById("root")!).render(<App />);
