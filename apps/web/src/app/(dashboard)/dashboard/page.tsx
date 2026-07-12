"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { filesApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { SubscriptionStatusCard } from "@/components/dashboard/subscription-status-card";
import { LaunchGptCard } from "@/components/dashboard/launch-gpt-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const { data: files, isLoading } = useQuery({ queryKey: ["files"], queryFn: filesApi.list });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back{user ? `, ${user.fullName.split(" ")[0]}` : ""}</h1>
        <p className="text-muted-foreground">Here&apos;s the state of your workspace.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SubscriptionStatusCard />
        <LaunchGptCard />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Active files
          </CardTitle>
          <Link href="/dashboard/files" className="text-sm text-primary hover:underline">
            Manage files
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-16" />}
          {!isLoading && (!files || files.length === 0) && (
            <p className="text-sm text-muted-foreground">No datasets uploaded yet. Upload one to start analyzing.</p>
          )}
          {files && files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file) => (
                <Badge key={file.id} variant="secondary">
                  {file.datasetType} · {file.fileName}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
