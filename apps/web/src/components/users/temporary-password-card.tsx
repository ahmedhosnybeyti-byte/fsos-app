"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function TemporaryPasswordCard({ email, password, onDismiss }: { email: string; password: string; onDismiss: () => void }) {
  return <div className="glass-card space-y-2 border-primary/50 p-4"><p className="font-medium">Temporary password for {email}</p><code className="block break-all rounded bg-secondary p-2">{password}</code><p className="text-sm text-muted-foreground">Copy it now. It is shown once only; the user must change it at first sign-in.</p><div className="flex gap-2"><Button size="sm" onClick={() => navigator.clipboard.writeText(password).then(() => toast.success("Copied"))}>Copy</Button><Button size="sm" variant="outline" onClick={onDismiss}>Dismiss</Button></div></div>;
}
