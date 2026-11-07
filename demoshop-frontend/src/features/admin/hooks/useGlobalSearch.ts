import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/config/api';
import type { GlobalSearchResult, GlobalSearchResponse } from '@demoshop/shared-types';

export interface UseGlobalSearchOptions {
  debounceMs?: number;
  minChars?: number;
  endpoint?: string;
  scope?: 'shop' | 'system' | 'all';
}

export const useGlobalSearch = (options: UseGlobalSearchOptions = {}) => {
  const {
    debounceMs = 300,
    minChars = 2,
    endpoint = '/api/admin/search',
    scope,
  } = options;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchResults = useCallback(
    async (searchTerm: string) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const trimmed = searchTerm.trim();
      if (trimmed.length < minChars) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.get<GlobalSearchResponse>(endpoint, {
          params: { q: trimmed, ...(scope ? { scope } : {}) },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const items = Array.isArray(response.data?.results) ? response.data.results : [];
          setResults(items);
        }
      } catch (err: any) {
        if (!controller.signal.aborted && err?.code !== 'ERR_CANCELED') {
          console.error('[useGlobalSearch] Failed to fetch search results:', err);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [minChars]
  );

  useEffect(() => {
    if (!query || query.trim().length < minChars) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      void fetchResults(query);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [query, debounceMs, minChars, fetchResults]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    abortControllerRef.current?.abort();
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    isOpen,
    setIsOpen,
    clearSearch,
  };
};

export default useGlobalSearch;
