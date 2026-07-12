"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, ExternalLink, Rocket } from "lucide-react";
import { toast } from "sonner";
import { gptApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

export function LaunchGptCard() {
  const [launch, setLaunch] = useState<{ launchCode: string; gptUrl: string; expiresInMinutes: number } | null>(null);

  const mutation = useMutation({
    mutationFn: gptApi.launch,
    onSuccess: (data) => setLaunch(data),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not launch your GPT right now.");
    },
  });

  function copyCode() {
    if (!launch) return;
    navigator.clipboard.writeText(launch.launchCode);
    toast.success("Access code copied");
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            Launch your Custom GPT
          </CardTitle>
          <CardDescription>
            Generates a one-time access code. Your GPT will ask for it before running any analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            Launch GPT
          </Button>
        </CardContent>
      </Card>

      <Dialog open={!!launch} onOpenChange={(open) => !open && setLaunch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your access code is ready</DialogTitle>
            <DialogDescription>
              Open your Custom GPT, then paste this code when it asks you to verify access. It expires in{" "}
              {launch?.expiresInMinutes} minutes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-4 py-3 font-mono text-sm">
            <span className="truncate">{launch?.launchCode}</span>
            <Button variant="ghost" size="icon" onClick={copyCode}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <Button asChild className="w-full">
            <a href={launch?.gptUrl} target="_blank" rel="noopener noreferrer">
              Open Custom GPT <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
