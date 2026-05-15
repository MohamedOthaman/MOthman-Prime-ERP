import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { bootstrapPlatformRuntime } from "./platform/bootstrap";
import { initErrorSink } from "./lib/errorSink";

bootstrapPlatformRuntime();
initErrorSink();

createRoot(document.getElementById("root")!).render(<App />);
