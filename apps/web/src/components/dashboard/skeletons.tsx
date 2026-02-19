import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-h-0">
      {[0, 1, 2].map((col) => (
        <Card key={col} className="flex flex-col min-h-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-2">
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <Card className="flex-1 min-h-0 p-0">
      <CardContent className="p-0 h-full">
        <div className="flex flex-col">
          {[0, 1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="flex items-center gap-3 p-4 border-b">
              <Skeleton className="h-5 w-5 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Calendar Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-36" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-8 w-12" />
        </div>
      </div>

      {/* Calendar Grid Skeleton */}
      <div className="flex-1 min-h-0">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <div key={day} className="py-2 flex justify-center">
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
        {/* Calendar Days Grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }, (_, dayIndex) => `day-${dayIndex}`).map(
            (dayKey) => (
              <div
                key={dayKey}
                className="border-b border-r p-1 min-h-24"
              >
              <Skeleton className="h-6 w-6 rounded-full mb-1" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
              </div>
            </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
