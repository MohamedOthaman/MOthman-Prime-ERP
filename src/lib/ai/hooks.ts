import { useState, useCallback } from "react";
import type { ChatMessage, AssistantOptions } from "./assistant";
import { sendMessage } from "./assistant";

export function useErpAssistant(options: AssistantOptions) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (userMessage: string) => {
      setLoading(true);
      setError(null);
      try {
        const { updatedHistory } = await sendMessage(history, userMessage, options);
        setHistory(updatedHistory);
        return updatedHistory[updatedHistory.length - 1];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [history, options],
  );

  const reset = useCallback(() => {
    setHistory([]);
    setError(null);
  }, []);

  return {
    history,
    loading,
    error,
    send,
    reset,
    lastAssistantMessage: history.filter((m) => m.role === "assistant").at(-1) ?? null,
  };
}
