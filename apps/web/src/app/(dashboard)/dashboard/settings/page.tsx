"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { configureGptSchema, type ConfigureGptInput } from "@field-sales-os/schemas";
import { companiesApi, gptApi, paymentsApi, subscriptionsApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatMoneyCents } from "@/lib/utils";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your company, Custom GPT configuration, and billing.</p>
      </div>

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="gpt">Custom GPT</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="company">
          <CompanyTab />
        </TabsContent>
        <TabsContent value="gpt">
          <GptTab />
        </TabsContent>
        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompanyTab() {
  const queryClient = useQueryClient();
  const { data: company, isLoading } = useQuery({ queryKey: ["companies", "me"], queryFn: companiesApi.me });
  const [name, setName] = useState("");

  useEffect(() => {
    if (company) setName(company.name);
  }, [company]);

  const mutation = useMutation({
    mutationFn: () => companiesApi.updateMe({ name }),
    onSuccess: async () => {
      toast.success("Company updated");
      await queryClient.invalidateQueries({ queryKey: ["companies", "me"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update company"),
  });

  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Company profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company name</Label>
          <Input id="companyName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}

function GptTab() {
  const queryClient = useQueryClient();
  const { data: gpt, isLoading } = useQuery({ queryKey: ["gpt", "me"], queryFn: gptApi.mine });
  const [newKey, setNewKey] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConfigureGptInput>({ resolver: zodResolver(configureGptSchema) });

  useEffect(() => {
    if (gpt && "name" in gpt) reset({ name: gpt.name });
  }, [gpt, reset]);

  const configureMutation = useMutation({
    mutationFn: (values: ConfigureGptInput) => gptApi.configure(values),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["gpt", "me"] });
      if ("apiKey" in result) setNewKey(result.apiKey);
      toast.success("Custom GPT configuration saved");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not save configuration"),
  });

  const regenerateMutation = useMutation({
    mutationFn: gptApi.regenerateKey,
    onSuccess: (result) => {
      setNewKey(result.apiKey);
      toast.success("API key regenerated");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not regenerate key"),
  });

  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>GPT configuration</CardTitle>
          <CardDescription>The name and API key used by the Action verification handshake. The Custom GPT link itself is set platform-wide by a Super Admin.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit((values) => configureMutation.mutate(values))}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">GPT name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            {gpt && "apiKeyId" in gpt && <p className="text-xs text-muted-foreground">API key ID: {gpt.apiKeyId}</p>}
          </CardContent>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Button type="submit" disabled={configureMutation.isPending}>
              {configureMutation.isPending && <Spinner />}
              Save
            </Button>
            {gpt && "apiKeyId" in gpt && (
              <Button type="button" variant="outline" onClick={() => regenerateMutation.mutate()} disabled={regenerateMutation.isPending}>
                {regenerateMutation.isPending && <Spinner />}
                Regenerate API key
              </Button>
            )}
          </CardContent>
        </form>
      </Card>

      {newKey && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle>Save this API key now</CardTitle>
            <CardDescription>It will not be shown again. Paste it into your GPT Action&apos;s auth settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded-md border border-border bg-secondary/40 p-3 text-sm">{newKey}</code>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BillingTab() {
  const { data: subscription } = useQuery({ queryKey: ["subscriptions", "me"], queryFn: subscriptionsApi.mine });
  const { data: payments } = useQuery({ queryKey: ["payments", "me"], queryFn: () => paymentsApi.mine(1, 20) });

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="font-medium">{subscription?.plan.name}</p>
            <p className="text-sm text-muted-foreground">{formatMoneyCents(subscription?.plan.priceCents ?? 0)}/mo</p>
          </div>
          <Badge variant={subscription?.status === "ACTIVE" ? "success" : "warning"}>{subscription?.status}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {!payments || payments.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.items.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.paidAt ?? payment.createdAt)}</TableCell>
                    <TableCell>{formatMoneyCents(payment.amountCents, payment.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={payment.status === "SUCCEEDED" ? "success" : "secondary"}>{payment.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
