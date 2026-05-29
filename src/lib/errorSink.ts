type ErrorContext = Record<string, unknown> | undefined;

interface ErrorSink {
  capture(error: unknown, context?: ErrorContext): void;
  message(msg: string, context?: ErrorContext): void;
}

const noopSink: ErrorSink = {
  capture: (error, context) => {
     
    console.error("[error]", error, context ?? "");
  },
  message: (msg, context) => {
     
    console.warn("[error:msg]", msg, context ?? "");
  },
};

let activeSink: ErrorSink = noopSink;

/**
 * Initialise the error sink. If VITE_SENTRY_DSN is set, the caller can
 * extend this to forward to Sentry. Otherwise the noop sink just routes
 * to console with a tag for easy grepping in DevTools.
 */
export function initErrorSink(): void {
  if (typeof window === "undefined") return;

  const handler = (e: ErrorEvent) => {
    activeSink.capture(e.error ?? e.message, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  };
  window.addEventListener("error", handler);

  const rejectionHandler = (e: PromiseRejectionEvent) => {
    activeSink.capture(e.reason, { kind: "unhandledrejection" });
  };
  window.addEventListener("unhandledrejection", rejectionHandler);
}

export function captureError(error: unknown, context?: ErrorContext): void {
  activeSink.capture(error, context);
}

export function captureMessage(msg: string, context?: ErrorContext): void {
  activeSink.message(msg, context);
}

export function setErrorSink(sink: ErrorSink): void {
  activeSink = sink;
}