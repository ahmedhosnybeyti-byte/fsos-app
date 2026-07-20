import { Skeleton } from "@/components/ui/skeleton";

// Route-segment loading state (App Router `loading.tsx`) — renders
// INSTANTLY on every navigation inside /dashboard/* while the target
// screen's code loads/compiles, so a sidebar click always gives immediate
// visual feedback instead of a frozen beat. Shape mirrors the shared
// screen anatomy (header row → hero panel → card grid) so the real screen
// replaces it without a jarring layout shift. Per the approved polish
// brief: Skeleton Loading, never a spinner.
export default function DashboardSegmentLoading() {
  return (
    <div className="relative space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="hidden h-14 w-14 rounded-xl sm:block" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <Skeleton className="h-40 w-full rounded-3xl" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
      </div>

      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}
