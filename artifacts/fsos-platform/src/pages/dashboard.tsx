export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back. Here's your overview.</p>
      </div>
      <EmptyContent label="Dashboard content" />
    </div>
  );
}

function EmptyContent({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card flex items-center justify-center min-h-[400px]">
      <p className="text-sm text-muted-foreground/50 font-mono">// {label} placeholder</p>
    </div>
  );
}
