import { useState, useEffect, useMemo } from "react";

export type OpenRouterModel = {
  slug: string;
  name: string;
  short_name: string;
  author: string;
  description: string;
  context_length: number;
  supports_reasoning: boolean;
  created_at: string;
  input_modalities?: string[];
  output_modalities?: string[];
  reasoning_config?: {
    supports_reasoning_effort?: boolean;
    supported_reasoning_efforts?: string[];
    default_reasoning_effort?: string;
  };
};

type ModelsResponse = {
  data: OpenRouterModel[];
};

const MODELS_CACHE_KEY = "openrouter_models_cache";
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

function isModelRecentEnough(createdAt: string): boolean {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return new Date(createdAt) > oneYearAgo;
}

function getCachedModels(): OpenRouterModel[] | null {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(MODELS_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedModels(data: OpenRouterModel[]) {
  try {
    localStorage.setItem(
      MODELS_CACHE_KEY,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // Ignore storage errors
  }
}

export function useOpenRouterModels() {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const cached = getCachedModels();
    if (cached) {
      setModels(cached);
      setIsLoading(false);
      return;
    }

    async function fetchModels() {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) throw new Error("Failed to fetch models");
        const json = (await res.json()) as ModelsResponse;
        const filtered = json.data.filter(
          (m) => !m.slug.includes(":free") && isModelRecentEnough(m.created_at)
        );

        // Deduplicate by slug, keeping the first occurrence
        const seen = new Set<string>();
        const modelData = filtered.filter((m) => {
          if (seen.has(m.slug)) return false;
          seen.add(m.slug);
          return true;
        });

        setModels(modelData);
        setCachedModels(modelData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    }

    fetchModels();
  }, []);

  const groupedModels = useMemo(() => {
    const groups: Record<string, Set<string>> = {}; // Use Set to track seen slugs
    const groupedData: Record<string, OpenRouterModel[]> = {};

    for (const model of models) {
      const author = model.slug.split("/")[0];
      if (!groups[author]) {
        groups[author] = new Set();
        groupedData[author] = [];
      }
      // Only add if we haven't seen this slug for this author
      if (!groups[author].has(model.slug)) {
        groups[author].add(model.slug);
        groupedData[author].push(model);
      }
    }
    return Object.entries(groupedData);
  }, [models]);

  const reasoningModels = useMemo(
    () => models.filter((m) => m.supports_reasoning),
    [models]
  );

  return {
    models,
    groupedModels,
    reasoningModels,
    isLoading,
    error,
  };
}
