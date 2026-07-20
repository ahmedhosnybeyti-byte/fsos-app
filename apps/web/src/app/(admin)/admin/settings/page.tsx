"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { platformSettingsApi, plansApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export default function PlatformSettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ["admin", "platform-settings"], queryFn: platformSettingsApi.get });
  const { data: plans } = useQuery({ queryKey: ["admin", "plans"], queryFn: plansApi.listAll });

  const [trialEnabled, setTrialEnabled] = useState(true);
  const [trialDurationDays, setTrialDurationDays] = useState(14);
  const [defaultPlanCode, setDefaultPlanCode] = useState("trial");
  const [autoStart, setAutoStart] = useState(true);
  const [gptBaseUrl, setGptBaseUrl] = useState("");

  useEffect(() => {
    if (!settings) return;
    setTrialEnabled(settings.trialEnabled);
    setTrialDurationDays(settings.trialDurationDays);
    setDefaultPlanCode(settings.defaultPlanCode);
    setAutoStart(settings.autoStartTrialOnRegistration);
    setGptBaseUrl(settings.gptBaseUrl);
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () =>
      platformSettingsApi.update({
        trialEnabled,
        trialDurationDays,
        defaultPlanCode,
        autoStartTrialOnRegistration: autoStart,
      }),
    onSuccess: async () => {
      toast.success("Platform settings saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "platform-settings"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save settings"),
  });

  const gptUrlMutation = useMutation({
    mutationFn: () => platformSettingsApi.update({ gptBaseUrl }),
    onSuccess: async () => {
      toast.success("Custom GPT URL saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "platform-settings"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save the GPT URL"),
  });

  const effectiveAutoStart = trialEnabled && autoStart;

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <SettingsIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform Settings</h1>
          <p className="text-muted-foreground">
            Trial policy for every new company that registers. Changing this takes effect immediately — no deploy needed.
          </p>
        </div>
      </div>

      <Card className="glass-card rise-in rise-d1">
        <CardHeader>
          <CardTitle>Custom GPT</CardTitle>
          <CardDescription>
            The base URL every company&apos;s &quot;Open Custom GPT&quot; button opens after a launch code is minted. There is one
            Custom GPT for the whole platform — never a per-conversation URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <div className="space-y-4">
              <SettingRow label="Custom GPT base URL" description="Opened in a new tab; the GPT itself asks the user for their access code.">
                <Input
                  className="w-96"
                  placeholder="https://chatgpt.com/g/g-..."
                  value={gptBaseUrl}
                  onChange={(e) => setGptBaseUrl(e.target.value)}
                />
              </SettingRow>
              <Button onClick={() => gptUrlMutation.mutate()} disabled={gptUrlMutation.isPending}>
                {gptUrlMutation.isPending && <Spinner />}
                Save changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card rise-in rise-d2">
        <CardHeader>
          <CardTitle>Trial configuration</CardTitle>
          <CardDescription>Applies the moment a company completes registration.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <SettingRow
                label="Trials enabled"
                description="Master switch. When off, new companies never get a time-boxed trial — see the effective behavior below."
              >
                <Switch checked={trialEnabled} onCheckedChange={setTrialEnabled} />
              </SettingRow>

              <SettingRow
                label="Auto-start trial on registration"
                description="When on (and trials are enabled), self-registering companies get an active trial immediately. When off, registration creates a subscription that a Super Admin must activate."
              >
                <Switch checked={autoStart} onCheckedChange={setAutoStart} disabled={!trialEnabled} />
              </SettingRow>

              <SettingRow label="Trial duration" description="Number of days a new trial stays active before it auto-expires.">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    className="w-24"
                    value={trialDurationDays}
                    disabled={!trialEnabled}
                    onChange={(e) => setTrialDurationDays(Number(e.target.value))}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </SettingRow>

              <SettingRow label="Default plan" description="The plan a new company's subscription is created on.">
                <Select value={defaultPlanCode} onValueChange={setDefaultPlanCode}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((plan) => (
                      <SelectItem key={plan.id} value={plan.code}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>

              <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
                <strong className="text-foreground">Effective behavior:</strong>{" "}
                {effectiveAutoStart ? (
                  <>New registrations start an active <strong>{trialDurationDays}-day</strong> trial on the <strong>{planName(plans, defaultPlanCode)}</strong> plan automatically.</>
                ) : (
                  <>New registrations create a subscription on the <strong>{planName(plans, defaultPlanCode)}</strong> plan, held (suspended) until a Super Admin activates it.</>
                )}
              </div>

              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending && <Spinner />}
                Save changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function planName(plans: { code: string; name: string }[] | undefined, code: string): string {
  return plans?.find((p) => p.code === code)?.name ?? code;
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-md">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
