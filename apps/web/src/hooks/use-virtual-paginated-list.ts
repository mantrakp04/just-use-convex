import { useEffect, useRef, useCallback } from "react";
import { useVirtualizer, type VirtualizerOptions } from "@tanstack/react-virtual";

type PaginatedQueryStatus = "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted";

type PaginatedQueryResult<T> = {
  results: T[];
  loadMore: (numItems: number) => void;
  status: PaginatedQueryStatus;
};

type UseVirtualPaginatedListOptions<T> = {
  query: PaginatedQueryResult<T>;
  estimateSize: (index: number) => number;
  overscan?: number;
  loadMoreThreshold?: number;
  loadMoreCount?: number;
  getItemKey?: (index: number, item: T) => string | number;
  virtualizerOptions?: Partial<
    Omit<VirtualizerOptions<HTMLDivElement, Element>, "count" | "getScrollElement" | "estimateSize">
  >;
};

export function useVirtualPaginatedList<T>({
  query,
  estimateSize,
  overscan = 5,
  loadMoreThreshold = 5,
  loadMoreCount = 20,
  getItemKey,
  virtualizerOptions,
}: UseVirtualPaginatedListOptions<T>) {
  const { results, loadMore, status } = query;
  const parentRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(index, results[index])
      : undefined,
    ...virtualizerOptions,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const handleLoadMore = useCallback(() => {
    if (canLoadMore && !isLoadingMore) {
      loadMore(loadMoreCount);
    }
  }, [canLoadMore, isLoadingMore, loadMore, loadMoreCount]);

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    if (lastItem.index >= results.length - loadMoreThreshold) {
      handleLoadMore();
    }
  }, [virtualItems, results.length, loadMoreThreshold, handleLoadMore]);

  return {
    parentRef,
    virtualizer,
    virtualItems,
    totalSize: virtualizer.getTotalSize(),
    results,
    isLoading,
    isLoadingMore,
    canLoadMore,
    loadMore: handleLoadMore,
  };
}

export type { PaginatedQueryResult, UseVirtualPaginatedListOptions };
