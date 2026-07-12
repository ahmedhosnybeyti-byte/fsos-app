import Link from "next/link";
import { Zap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </span>
        <span>Field Sales OS</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
