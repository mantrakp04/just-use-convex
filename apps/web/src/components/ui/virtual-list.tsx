import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  useVirtualPaginatedList,
  type PaginatedQueryResult,
} from "@/hooks/use-virtual-paginated-list";
import { Loader2 } from "lucide-react";

type VirtualListProps<T> = {
  query: PaginatedQueryResult<T>;
  renderItem: (item: T, index: number) => ReactNode;
  estimateSize: number | ((index: number) => number);
  getItemKey?: (index: number, item: T) => string | number;
  className?: string;
  itemClassName?: string;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
  overscan?: number;
  loadMoreThreshold?: number;
  loadMoreCount?: number;
  gap?: number;
};

export function VirtualList<T>({
  query,
  renderItem,
  estimateSize,
  getItemKey,
  className,
  itemClassName,
  emptyState,
  loadingState,
  overscan = 5,
  loadMoreThreshold = 5,
  loadMoreCount = 20,
  gap = 0,
}: VirtualListProps<T>) {
  const estimateSizeFn =
    typeof estimateSize === "number" ? () => estimateSize : estimateSize;

  const {
    parentRef,
    virtualizer,
    virtualItems,
    totalSize,
    results,
    isLoading,
    isLoadingMore,
  } = useVirtualPaginatedList({
    query,
    estimateSize: estimateSizeFn,
    getItemKey,
    overscan,
    loadMoreThreshold,
    loadMoreCount,
  });

  if (isLoading) {
    return (
      loadingState ?? (
        <div className="flex items-center justify-center h-full min-h-32">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )
    );
  }

  if (results.length === 0) {
    return (
      emptyState ?? (
        <div className="flex items-center justify-center h-full min-h-32 text-muted-foreground">
          No items found
        </div>
      )
    );
  }

  return (
    <div ref={parentRef} className={cn("overflow-auto h-full", className)}>
      <div
        className="relative w-full"
        style={{ height: `${totalSize + (results.length - 1) * gap}px` }}
      >
        {virtualItems.map((virtualItem) => {
          const item = results[virtualItem.index];
          return (
            <VirtualListItem
              key={virtualItem.key}
              item={item}
              index={virtualItem.index}
              start={virtualItem.start}
              gap={gap}
              itemClassName={itemClassName}
              renderItem={renderItem}
              measureElement={virtualizer.measureElement}
            />
          );
        })}
        {isLoadingMore && (
          <div
            className="absolute left-0 w-full flex justify-center py-4"
            style={{
              transform: `translateY(${totalSize + results.length * gap}px)`,
            }}
          >
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

export type { VirtualListProps };

type VirtualListItemProps<T> = Pick<VirtualListProps<T>, "itemClassName" | "renderItem"> & {
  item: T;
  index: number;
  start: number;
  gap: number;
  measureElement: (element: HTMLElement | null) => void;
};

function VirtualListItem<T>({
  item,
  index,
  start,
  gap,
  itemClassName,
  renderItem,
  measureElement,
}: VirtualListItemProps<T>) {
  return (
    <div
      data-index={index}
      ref={measureElement}
      className={cn("absolute left-0 top-0 w-full", itemClassName)}
      style={{
        transform: `translateY(${start + index * gap}px)`,
      }}
    >
      {renderItem(item, index)}
    </div>
  );
}
