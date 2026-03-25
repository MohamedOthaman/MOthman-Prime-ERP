// src/features/reports/hooks/useReport.ts
//
// Generic hook for report data fetching.
// Accepts any async fetcher function, manages loading/error/data state,
// and exposes a reload function to re-trigger the fetch.
//
// Usage:
//   const { data, loading, error, reload } = useReport(getCustomersBySalesman);

import { useState, useEffect, useCallback } from "react";

interface UseReportResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    reload: () => void;
}

export function useReport<T>(
    fetcher: () => Promise<T>
): UseReportResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState<number>(0);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            setLoading(true);
            setError(null);

            try {
                const result = await fetcher();
                if (!cancelled) {
                    setData(result);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load report data."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        run();

        return () => {
            cancelled = true;
        };
    }, [fetcher, tick]);

    const reload = useCallback(() => {
        setTick((t) => t + 1);
    }, []);

    return { data, loading, error, reload };
}