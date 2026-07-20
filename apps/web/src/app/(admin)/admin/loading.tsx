import { Skeleton } from "@/components/ui/skeleton";

// Route-segment loading state for /admin/* — same instant-feedback pattern
// as the dashboard segment's loading.tsx: renders immediately on every
// admin navigation while the target screen loads/compiles, shaped like the
// shared screen anatomy (header row → main panel) to avoid layout shift.
export default function AdminSegmentLoading() {
  return (
    <div className="relative space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="hidden h-14 w-14 rounded-xl sm:block" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
