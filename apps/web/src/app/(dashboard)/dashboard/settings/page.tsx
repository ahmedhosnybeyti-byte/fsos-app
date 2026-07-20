"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Database, Settings as SettingsIcon, CreditCard } from "lucide-react";
import { toast } from "sonner";
import {
  changePasswordSchema,
  configureGptSchema,
  COMPANY_POLICY_TYPES,
  createDataSourceSchema,
  type ChangePasswordInput,
  type CompanyPolicyType,
  type ConfigureGptInput,
  type CreateBranchInput,
  type CreateDataSourceInput,
  type DataSourceStatus,
} from "@field-sales-os/schemas";
import {
  authApi,
  branchesApi,
  companiesApi,
  companyPoliciesApi,
  complianceApi,
  dataSourceTypesApi,
  dataSourcesApi,
  gptApi,
  paymentsApi,
  refreshApi,
  subscriptionsApi,
  usersApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { cn, formatDate, formatMoneyCents } from "@/lib/utils";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { DiscoveryProvider } from "@/lib/types";

export default function SettingsPage() {
  // Matches the sidebar's own visibility rule for this link (dashboard
  // layout.tsx only lists it for COMPANY_ADMIN) — guarding here (before any
  // tab mounts) means none of this page's sub-tab queries fire for a role
  // that shouldn't see them, without touching each tab individually.
  const { user, isLoading } = useRequireAuth(["COMPANY_ADMIN"]);
  const { t } = useTranslation();
  if (isLoading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <SettingsIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
          <p className="text-muted-foreground">{t("settings.subtitle")}</p>
        </div>
      </div>

      <Tabs defaultValue="company" className="rise-in rise-d1">
        <TabsList>
          <TabsTrigger value="company">{t("settings.tabCompany")}</TabsTrigger>
          <TabsTrigger value="branches">{t("settings.tabBranches")}</TabsTrigger>
          <TabsTrigger value="dataSources">{t("settings.tabDataSources")}</TabsTrigger>
          <TabsTrigger value="policies">{t("settings.tabPolicies")}</TabsTrigger>
          <TabsTrigger value="account">{t("settings.tabAccount")}</TabsTrigger>
          <TabsTrigger value="gpt">Custom GPT</TabsTrigger>
          <TabsTrigger value="billing">{t("settings.tabBilling")}</TabsTrigger>
        </TabsList>
        <TabsContent value="company">
          <CompanyTab />
          <CompanyProfileTab />
          <DiscoveryProviderSection />
        </TabsContent>
        <TabsContent value="branches">
          <BranchesTab />
        </TabsContent>
        <TabsContent value="dataSources">
          <DataSourcesTab />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab />
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: company, isLoading } = useQuery({ queryKey: ["companies", "me"], queryFn: companiesApi.me });
  const [name, setName] = useState("");

  useEffect(() => {
    if (company) setName(company.name);
  }, [company]);

  const mutation = useMutation({
    mutationFn: () => companiesApi.updateMe({ name }),
    onSuccess: async () => {
      toast.success(t("settings.companyUpdateSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["companies", "me"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.companyUpdateError")),
  });

  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">{t("settings.loading")}</p>;

  return (
    <div className="glass-card mt-4">
      <CardHeader>
        <CardTitle>{t("settings.companyDataTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">{t("settings.companyNameLabel")}</Label>
          <Input id="companyName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {t("settings.saveChanges")}
        </Button>
      </CardContent>
    </div>
  );
}

function CompanyProfileTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({ queryKey: ["companies", "me", "profile"], queryFn: companiesApi.getProfile });
  const [form, setForm] = useState({
    country: "",
    city: "",
    timeZone: "",
    currency: "",
    defaultLanguage: "",
    fiscalYearStart: "",
    contactEmail: "",
    contactPhone: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        country: profile.country ?? "",
        city: profile.city ?? "",
        timeZone: profile.timeZone ?? "",
        currency: profile.currency ?? "",
        defaultLanguage: profile.defaultLanguage ?? "",
        fiscalYearStart: profile.fiscalYearStart ?? "",
        contactEmail: profile.contactEmail ?? "",
        contactPhone: profile.contactPhone ?? "",
      });
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: () =>
      companiesApi.updateProfile({
        country: form.country || null,
        city: form.city || null,
        timeZone: form.timeZone || null,
        currency: form.currency || null,
        defaultLanguage: form.defaultLanguage || null,
        fiscalYearStart: form.fiscalYearStart || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
      }),
    onSuccess: async () => {
      toast.success(t("settings.profileUpdateSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["companies", "me", "profile"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.profileUpdateError")),
  });

  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">{t("settings.loading")}</p>;

  return (
    <div className="glass-card mt-4">
      <CardHeader>
        <CardTitle>{t("settings.profileTitle")}</CardTitle>
        <CardDescription>{t("settings.profileDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="country">{t("settings.countryLabel")}</Label>
          <Input id="country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">{t("settings.cityLabel")}</Label>
          <Input id="city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timeZone">{t("settings.timeZoneLabel")}</Label>
          <Input
            id="timeZone"
            placeholder="Africa/Cairo"
            value={form.timeZone}
            onChange={(e) => setForm((f) => ({ ...f, timeZone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">{t("settings.currencyLabel")}</Label>
          <Input id="currency" placeholder="EGP" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="defaultLanguage">{t("settings.defaultLanguageLabel")}</Label>
          <Input
            id="defaultLanguage"
            placeholder="ar"
            value={form.defaultLanguage}
            onChange={(e) => setForm((f) => ({ ...f, defaultLanguage: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fiscalYearStart">{t("settings.fiscalYearStartLabel")}</Label>
          <Input
            id="fiscalYearStart"
            placeholder="01-01"
            value={form.fiscalYearStart}
            onChange={(e) => setForm((f) => ({ ...f, fiscalYearStart: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactEmail">{t("settings.contactEmailLabel")}</Label>
          <Input
            id="contactEmail"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">{t("settings.contactPhoneLabel")}</Label>
          <Input id="contactPhone" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
        </div>
      </CardContent>
      <CardContent className="pt-0">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {t("settings.saveChanges")}
        </Button>
      </CardContent>
    </div>
  );
}

function DiscoveryProviderSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({ queryKey: ["companies", "me", "profile"], queryFn: companiesApi.getProfile });
  const [provider, setProvider] = useState<DiscoveryProvider>("OSM");
  const [keyInput, setKeyInput] = useState("");

  useEffect(() => {
    if (profile) setProvider(profile.discoveryProvider ?? "OSM");
  }, [profile]);

  const hasStoredKey = profile?.hasDiscoveryCredentials ?? false;
  // GOOGLE can only be saved when a key is already stored or one is being
  // entered right now — mirrors the API-side rule so the user gets an inline
  // hint instead of a server error.
  const googleBlocked = provider === "GOOGLE" && !hasStoredKey && keyInput.trim() === "";

  const saveMutation = useMutation({
    mutationFn: () =>
      companiesApi.updateProfile({
        discoveryProvider: provider,
        // Write-only key: only send it when the admin typed a new one.
        ...(keyInput.trim() !== "" && { discoveryApiKey: keyInput.trim() }),
      }),
    onSuccess: async () => {
      toast.success(t("settings.discoveryUpdateSuccess"));
      setKeyInput("");
      await queryClient.invalidateQueries({ queryKey: ["companies", "me", "profile"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.discoveryUpdateError")),
  });

  const clearKeyMutation = useMutation({
    // Empty string clears the stored key on the server.
    mutationFn: () => companiesApi.updateProfile({ discoveryApiKey: "" }),
    onSuccess: async () => {
      toast.success(t("settings.discoveryUpdateSuccess"));
      setKeyInput("");
      await queryClient.invalidateQueries({ queryKey: ["companies", "me", "profile"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.discoveryUpdateError")),
  });

  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">{t("settings.loading")}</p>;

  return (
    <div className="glass-card mt-4">
      <CardHeader>
        <CardTitle>{t("settings.discoveryTitle")}</CardTitle>
        <CardDescription>{t("settings.discoveryDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
            provider === "OSM" ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <input
            type="radio"
            name="discoveryProvider"
            value="OSM"
            checked={provider === "OSM"}
            onChange={() => setProvider("OSM")}
            className="mt-1 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">{t("settings.discoveryOsmLabel")}</span>
            <span className="block text-xs text-muted-foreground">{t("settings.discoveryOsmDescription")}</span>
          </span>
        </label>

        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
            provider === "GOOGLE" ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <input
            type="radio"
            name="discoveryProvider"
            value="GOOGLE"
            checked={provider === "GOOGLE"}
            onChange={() => setProvider("GOOGLE")}
            className="mt-1 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">{t("settings.discoveryGoogleLabel")}</span>
            <span className="block text-xs text-muted-foreground">{t("settings.discoveryGoogleDescription")}</span>
          </span>
        </label>

        {provider === "GOOGLE" && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label htmlFor="discoveryApiKey">{t("settings.discoveryApiKeyLabel")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="discoveryApiKey"
                type="password"
                autoComplete="off"
                dir="ltr"
                className="max-w-sm"
                placeholder={hasStoredKey ? t("settings.discoveryApiKeySavedPlaceholder") : t("settings.discoveryApiKeyPlaceholder")}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              {hasStoredKey && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => clearKeyMutation.mutate()}
                  disabled={clearKeyMutation.isPending}
                >
                  {clearKeyMutation.isPending && <Spinner />}
                  {t("settings.discoveryClearKey")}
                </Button>
              )}
            </div>
            {googleBlocked && <p className="text-xs text-destructive">{t("settings.discoveryKeyRequiredHint")}</p>}
          </div>
        )}
      </CardContent>
      <CardContent className="pt-0">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || googleBlocked}>
          {saveMutation.isPending && <Spinner />}
          {t("settings.saveChanges")}
        </Button>
      </CardContent>
    </div>
  );
}

function BranchesTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery({ queryKey: ["branches"], queryFn: branchesApi.list });
  const [newBranch, setNewBranch] = useState<CreateBranchInput>({ code: "", name: "" });

  const createMutation = useMutation({
    mutationFn: () => branchesApi.create(newBranch),
    onSuccess: async () => {
      toast.success(t("settings.branchAddSuccess"));
      setNewBranch({ code: "", name: "" });
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.branchAddError")),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => branchesApi.archive(id),
    onSuccess: async () => {
      toast.success(t("settings.branchArchiveSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.branchArchiveError")),
  });

  return (
    <div className="mt-4 space-y-6">
      <div className="glass-card">
        <CardHeader>
          <CardTitle>{t("settings.addBranchTitle")}</CardTitle>
          <CardDescription>{t("settings.addBranchDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="branchCode">{t("settings.branchCodeLabel")}</Label>
            <Input
              id="branchCode"
              value={newBranch.code}
              onChange={(e) => setNewBranch((b) => ({ ...b, code: e.target.value }))}
              className="w-40"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branchName">{t("settings.branchNameLabel")}</Label>
            <Input
              id="branchName"
              value={newBranch.name}
              onChange={(e) => setNewBranch((b) => ({ ...b, name: e.target.value }))}
              className="w-60"
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !newBranch.code.trim() || !newBranch.name.trim()}
          >
            {createMutation.isPending && <Spinner />}
            {t("settings.add")}
          </Button>
        </CardContent>
      </div>

      <div className="glass-card">
        <CardHeader>
          <CardTitle>{t("settings.currentBranchesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
          ) : !branches || branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.noBranchesYet")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.codeHeader")}</TableHead>
                  <TableHead>{t("settings.nameHeader")}</TableHead>
                  <TableHead>{t("settings.statusHeader")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell>{branch.code}</TableCell>
                    <TableCell>{branch.name}</TableCell>
                    <TableCell>
                      <Badge variant={branch.status === "ACTIVE" ? "success" : "secondary"}>
                        {branch.status === "ACTIVE" ? t("settings.statusActiveGeneric") : t("settings.statusArchivedGeneric")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {branch.status === "ACTIVE" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => archiveMutation.mutate(branch.id)}
                          disabled={archiveMutation.isPending}
                        >
                          {t("settings.archive")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </div>
    </div>
  );
}

const DATA_SOURCE_STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  DRAFT: "settings.dsStatusDraft",
  CONFIGURING: "settings.dsStatusConfiguring",
  CONNECTED: "settings.dsStatusConnected",
  ACTIVE: "settings.statusActiveGeneric",
  SUSPENDED: "settings.dsStatusSuspended",
  ARCHIVED: "settings.statusArchivedGeneric",
};

const DATA_SOURCE_HEALTH_LABEL_KEY: Record<string, TranslationKey> = {
  HEALTHY: "settings.healthHealthy",
  WARNING: "settings.healthWarning",
  ERROR: "settings.healthError",
  OFFLINE: "settings.healthOffline",
};

const REFRESH_RUN_STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  QUEUED: "settings.refreshQueued",
  RUNNING: "settings.refreshRunning",
  COMPLETED: "settings.refreshCompleted",
  FAILED: "settings.refreshFailed",
};

const authMethodOptions = (t: (key: TranslationKey) => string) => [
  { value: "NONE", label: t("settings.authNone") },
  { value: "BASIC", label: t("settings.authBasic") },
  { value: "API_KEY", label: t("settings.authApiKey") },
  { value: "TOKEN", label: "Token" },
  { value: "OAUTH2", label: "OAuth2" },
];

const connectionFieldDefs = (t: (key: TranslationKey) => string) =>
  [
    { key: "host", label: t("settings.connHost") },
    { key: "port", label: t("settings.connPort") },
    { key: "database", label: t("settings.connDatabase") },
    { key: "baseUrl", label: t("settings.connBaseUrl") },
    { key: "bucket", label: t("settings.connBucket") },
  ] as const;

function DataSourcesTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [connectionFields, setConnectionFields] = useState<Record<string, string>>({});
  const [credentialUsername, setCredentialUsername] = useState("");
  const [credentialSecret, setCredentialSecret] = useState("");

  const { data: dataSources, isLoading } = useQuery({ queryKey: ["dataSources"], queryFn: () => dataSourcesApi.list() });
  const { data: sourceTypes } = useQuery({ queryKey: ["dataSourceTypes"], queryFn: dataSourceTypesApi.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => usersApi.list(1, 100) });
  const { data: refreshHistory } = useQuery({ queryKey: ["refreshHistory"], queryFn: () => refreshApi.history() });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateDataSourceInput>({ resolver: zodResolver(createDataSourceSchema), defaultValues: { authMethod: "NONE" } });

  const resetAll = () => {
    reset({ authMethod: "NONE" });
    setConnectionFields({});
    setCredentialUsername("");
    setCredentialSecret("");
  };

  const createMutation = useMutation({
    mutationFn: (values: CreateDataSourceInput) => {
      const connectionConfig = Object.fromEntries(Object.entries(connectionFields).filter(([, v]) => v.trim() !== ""));
      const credentials =
        credentialUsername.trim() || credentialSecret.trim()
          ? { ...(credentialUsername.trim() && { username: credentialUsername }), ...(credentialSecret.trim() && { secret: credentialSecret }) }
          : undefined;
      return dataSourcesApi.create({
        ...values,
        connectionConfig: Object.keys(connectionConfig).length > 0 ? connectionConfig : undefined,
        credentials,
      });
    },
    onSuccess: async () => {
      toast.success(t("settings.dataSourceAddSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["dataSources"] });
      resetAll();
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.dataSourceAddError")),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DataSourceStatus }) => dataSourcesApi.update(id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dataSources"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.dataSourceStatusUpdateError")),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => dataSourcesApi.testConnection(id),
    onSuccess: async (result) => {
      toast[result.success ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["dataSources"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.dataSourceTestError")),
  });

  const refreshMutation = useMutation({
    mutationFn: (dataSourceId: string) => refreshApi.trigger({ dataSourceId }),
    onSuccess: async (run) => {
      toast[run.status === "COMPLETED" ? "success" : "error"](
        run.status === "COMPLETED"
          ? t("settings.refreshSuccessMessage", {
              score: run.dataQualityScore !== null ? Math.round(run.dataQualityScore * 100) : "—",
            })
          : t("settings.refreshFailureMessage"),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dataSources"] }),
        queryClient.invalidateQueries({ queryKey: ["refreshHistory"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.refreshTriggerError")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dataSourcesApi.remove(id),
    onSuccess: async () => {
      toast.success(t("settings.dataSourceDeleteSuccess"));
      await queryClient.invalidateQueries({ queryKey: ["dataSources"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.dataSourceDeleteError")),
  });

  return (
    <div className="mt-4 space-y-6">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("settings.dataSourcesIntro")}</p>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetAll();
          }}
        >

          <DialogTrigger asChild>
            <Button>
              <Database className="h-4 w-4" /> {t("settings.addDataSource")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("settings.addDataSourceDialogTitle")}</DialogTitle>
            </DialogHeader>
            <form className="max-h-[70vh] space-y-4 overflow-y-auto pl-1" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
              <div className="space-y-2">
                <Label htmlFor="dsName">{t("settings.dsNameLabel")}</Label>
                <Input id="dsName" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t("settings.dsTypeLabel")}</Label>
                <Select value={watch("type") ?? ""} onValueChange={(v) => setValue("type", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.dsTypePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceTypes?.map((st) => (
                      <SelectItem key={st.id} value={st.typeCode}>
                        {st.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dsDescription">{t("settings.dsDescriptionLabel")}</Label>
                <Input id="dsDescription" {...register("description")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dsCategory">{t("settings.dsCategoryLabel")}</Label>
                <Input id="dsCategory" placeholder={t("settings.dsCategoryPlaceholder")} {...register("dataCategory")} />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.authMethodLabel")}</Label>
                <Select value={watch("authMethod") ?? "NONE"} onValueChange={(v) => setValue("authMethod", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {authMethodOptions(t).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.ownerLabel")}</Label>
                <Select value={watch("ownerUserId") ?? "none"} onValueChange={(v) => setValue("ownerUserId", v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.noOwner")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("settings.noOwner")}</SelectItem>
                    {users?.items.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground">{t("settings.connectionFieldsTitle")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {connectionFieldDefs(t).map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label htmlFor={`conn-${field.key}`} className="text-xs">
                        {field.label}
                      </Label>
                      <Input
                        id={`conn-${field.key}`}
                        value={connectionFields[field.key] ?? ""}
                        onChange={(e) => setConnectionFields((f) => ({ ...f, [field.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground">{t("settings.credentialsTitle")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="credUsername" className="text-xs">
                      {t("settings.credUsernameLabel")}
                    </Label>
                    <Input id="credUsername" value={credentialUsername} onChange={(e) => setCredentialUsername(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="credSecret" className="text-xs">
                      {t("settings.credSecretLabel")}
                    </Label>
                    <Input id="credSecret" type="password" value={credentialSecret} onChange={(e) => setCredentialSecret(e.target.value)} />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Spinner />}
                  {t("settings.addDataSourceSubmit")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-card">
        <CardHeader>
          <CardTitle>{t("settings.registeredDataSourcesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
          ) : !dataSources || dataSources.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.noDataSourcesYet")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.nameHeader")}</TableHead>
                  <TableHead>{t("settings.typeHeader")}</TableHead>
                  <TableHead>{t("settings.categoryHeader")}</TableHead>
                  <TableHead>{t("settings.statusHeader")}</TableHead>
                  <TableHead>{t("settings.healthHeader")}</TableHead>
                  <TableHead>{t("settings.ownerLabel")}</TableHead>
                  <TableHead>{t("settings.lastRefreshHeader")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataSources.map((ds) => (
                  <TableRow key={ds.id}>
                    <TableCell className="font-medium">{ds.name}</TableCell>
                    <TableCell className="text-muted-foreground">{sourceTypes?.find((st) => st.typeCode === ds.type)?.name ?? ds.type}</TableCell>
                    <TableCell className="text-muted-foreground">{ds.dataCategory ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={ds.status === "ACTIVE" || ds.status === "CONNECTED" ? "success" : "secondary"}>
                        {(() => {
                          const key = DATA_SOURCE_STATUS_LABEL_KEY[ds.status];
                          return key ? t(key) : ds.status;
                        })()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ds.healthStatus === "HEALTHY" ? "success" : ds.healthStatus === "WARNING" ? "warning" : "secondary"}>
                        {(() => {
                          const key = DATA_SOURCE_HEALTH_LABEL_KEY[ds.healthStatus];
                          return key ? t(key) : ds.healthStatus;
                        })()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ds.ownerUserId ? users?.items.find((u) => u.id === ds.ownerUserId)?.email ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ds.lastRefreshAt ? formatDate(ds.lastRefreshAt) : t("settings.neverRefreshed")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => refreshMutation.mutate(ds.id)}>{t("settings.runRefreshNow")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => testMutation.mutate(ds.id)}>{t("settings.testConnection")}</DropdownMenuItem>
                          {ds.status !== "ACTIVE" && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: ds.id, status: "ACTIVE" })}>
                              {t("settings.activate")}
                            </DropdownMenuItem>
                          )}
                          {ds.status !== "SUSPENDED" && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: ds.id, status: "SUSPENDED" })}>
                              {t("settings.suspend")}
                            </DropdownMenuItem>
                          )}
                          {ds.status !== "ARCHIVED" && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: ds.id, status: "ARCHIVED" })}>
                              {t("settings.archive")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(t("settings.confirmDeleteDataSource", { name: ds.name }))) deleteMutation.mutate(ds.id);
                            }}
                          >
                            {t("settings.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </div>

      <div className="glass-card">
        <CardHeader>
          <CardTitle>{t("settings.refreshHistoryTitle")}</CardTitle>
          <CardDescription>{t("settings.refreshHistoryDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!refreshHistory || refreshHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.noRefreshRunsYet")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.sourceHeader")}</TableHead>
                  <TableHead>{t("settings.statusHeader")}</TableHead>
                  <TableHead>{t("settings.dataQualityHeader")}</TableHead>
                  <TableHead>{t("settings.missingFilesHeader")}</TableHead>
                  <TableHead>{t("settings.durationHeader")}</TableHead>
                  <TableHead>{t("settings.runDateHeader")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refreshHistory.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-muted-foreground">
                      {dataSources?.find((ds) => ds.id === run.dataSourceId)?.name ?? run.dataSourceId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "destructive" : "secondary"}>
                        {(() => {
                          const key = REFRESH_RUN_STATUS_LABEL_KEY[run.status];
                          return key ? t(key) : run.status;
                        })()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.dataQualityScore !== null ? `${Math.round(run.dataQualityScore * 100)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {run.resultSummary?.missingFiles && run.resultSummary.missingFiles.length > 0
                        ? run.resultSummary.missingFiles.join(t("settings.listSeparator"))
                        : run.resultSummary?.structuralValidationError ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.durationMs !== null ? t("settings.durationSeconds", { value: (run.durationMs / 1000).toFixed(1) }) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(run.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </div>
    </div>
  );
}

const COMPANY_POLICY_TYPE_LABEL_KEY: Record<string, TranslationKey> = {
  ORGANIZATIONAL_POLICY: "settings.policyTypeOrganizational",
  PASSWORD_POLICY: "settings.policyTypePassword",
  REFRESH_POLICY: "settings.policyTypeRefresh",
  EMPLOYEE_ASSIGNMENT_POLICY: "settings.policyTypeEmployeeAssignment",
  PERMISSION_POLICY: "settings.policyTypePermission",
  ARCHIVING_POLICY: "settings.policyTypeArchiving",
};

function PoliciesTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingType, setEditingType] = useState<CompanyPolicyType | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const { data: policies, isLoading } = useQuery({ queryKey: ["companyPolicies"], queryFn: companyPoliciesApi.list });
  const { data: compliance } = useQuery({ queryKey: ["compliance"], queryFn: complianceApi.getOverview });

  const upsertMutation = useMutation({
    mutationFn: companyPoliciesApi.upsert,
    onSuccess: async () => {
      toast.success(t("settings.policySaveSuccess"));
      setEditingType(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["companyPolicies"] }),
        queryClient.invalidateQueries({ queryKey: ["compliance"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.policySaveError")),
  });

  const startEdit = (policyType: CompanyPolicyType, currentValue?: Record<string, unknown>) => {
    setEditingType(policyType);
    setDraftValue(JSON.stringify(currentValue ?? {}, null, 2));
    setDraftError(null);
  };

  const saveEdit = () => {
    if (!editingType) return;
    try {
      const parsed = JSON.parse(draftValue || "{}");
      upsertMutation.mutate({ policyType: editingType, value: parsed, isActive: true });
    } catch {
      setDraftError(t("settings.invalidJson"));
    }
  };

  return (
    <div className="mt-4 space-y-6">
      <div className="glass-card">
        <CardHeader>
          <CardTitle>{t("settings.companyPoliciesTitle")}</CardTitle>
          <CardDescription>{t("settings.companyPoliciesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.policyHeader")}</TableHead>
                  <TableHead>{t("settings.statusHeader")}</TableHead>
                  <TableHead>{t("settings.versionHeader")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {COMPANY_POLICY_TYPES.map((policyType) => {
                  const existing = policies?.find((p) => p.policyType === policyType);
                  return (
                    <TableRow key={policyType}>
                      <TableCell className="font-medium">
                        {COMPANY_POLICY_TYPE_LABEL_KEY[policyType] ? t(COMPANY_POLICY_TYPE_LABEL_KEY[policyType]) : policyType}
                      </TableCell>
                      <TableCell>
                        <Badge variant={existing?.isActive ? "success" : "secondary"}>
                          {existing
                            ? existing.isActive
                              ? t("settings.policyEnabled")
                              : t("settings.policyDisabled")
                            : t("settings.policyUndefined")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{existing?.version ?? "—"}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => startEdit(policyType, existing?.value)}>
                          {existing ? t("settings.edit") : t("settings.define")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </div>

      {editingType && (
        <div className="glass-card rise-in">
          <CardHeader>
            <CardTitle>{COMPANY_POLICY_TYPE_LABEL_KEY[editingType] ? t(COMPANY_POLICY_TYPE_LABEL_KEY[editingType]) : editingType}</CardTitle>
            <CardDescription>{t("settings.policyContentDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="min-h-[160px] w-full rounded-md border border-input bg-background p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              dir="ltr"
            />
            {draftError && <p className="text-xs text-destructive">{draftError}</p>}
          </CardContent>
          <CardContent className="flex gap-2 pt-0">
            <Button onClick={saveEdit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && <Spinner />}
              {t("settings.save")}
            </Button>
            <Button variant="outline" onClick={() => setEditingType(null)}>
              {t("settings.cancel")}
            </Button>
          </CardContent>
        </div>
      )}

      <div className="glass-card">
        <CardHeader>
          <CardTitle>{t("settings.complianceOverviewTitle")}</CardTitle>
          <CardDescription>{t("settings.complianceOverviewDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!compliance ? (
            <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
          ) : (
            <div className="space-y-2">
              <Badge variant={compliance.overallCompliant ? "success" : "warning"}>
                {compliance.overallCompliant ? t("settings.fullyCompliant") : t("settings.hasUndefinedPolicies")}
              </Badge>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {compliance.policies.map((p) => (
                  <li key={p.policyType} className="flex items-center justify-between">
                    <span>
                      {(() => {
                        const key = COMPANY_POLICY_TYPE_LABEL_KEY[p.policyType];
                        return key ? t(key) : p.policyType;
                      })()}
                    </span>
                    <Badge variant={p.isCompliant ? "success" : "secondary"}>
                      {p.isCompliant ? t("settings.compliant") : t("settings.nonCompliant")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </div>
    </div>
  );
}

function AccountTab() {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordInput) => authApi.changePassword(values),
    onSuccess: () => {
      toast.success(t("settings.changePasswordSuccess"));
      reset();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.changePasswordError")),
  });

  return (
    <div className="glass-card mt-4">
      <CardHeader>
        <CardTitle>{t("settings.changePasswordTitle")}</CardTitle>
        <CardDescription>{t("settings.changePasswordDescription")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("settings.currentPasswordLabel")}</Label>
            <Input id="currentPassword" type="password" {...register("currentPassword")} />
            {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("settings.newPasswordLabel")}</Label>
            <Input id="newPassword" type="password" {...register("newPassword")} />
            {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {t("settings.changePasswordTitle")}
          </Button>
        </CardContent>
      </form>
    </div>
  );
}

function GptTab() {
  const { t } = useTranslation();
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
      toast.success(t("settings.gptSaveSuccess"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.gptSaveError")),
  });

  const regenerateMutation = useMutation({
    mutationFn: gptApi.regenerateKey,
    onSuccess: (result) => {
      setNewKey(result.apiKey);
      toast.success(t("settings.regenerateSuccess"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("settings.regenerateError")),
  });

  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">{t("settings.loading")}</p>;

  return (
    <div className="mt-4 space-y-6">
      <div className="glass-card">
        <CardHeader>
          <CardTitle>{t("settings.gptSettingsTitle")}</CardTitle>
          <CardDescription>{t("settings.gptSettingsDescription")}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit((values) => configureMutation.mutate(values))}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("settings.gptNameLabel")}</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            {gpt && "apiKeyId" in gpt && (
              <p className="text-xs text-muted-foreground">{t("settings.apiKeyIdLabel", { id: gpt.apiKeyId })}</p>
            )}
          </CardContent>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Button type="submit" disabled={configureMutation.isPending}>
              {configureMutation.isPending && <Spinner />}
              {t("settings.save")}
            </Button>
            {gpt && "apiKeyId" in gpt && (
              <Button type="button" variant="outline" onClick={() => regenerateMutation.mutate()} disabled={regenerateMutation.isPending}>
                {regenerateMutation.isPending && <Spinner />}
                {t("settings.regenerateApiKey")}
              </Button>
            )}
          </CardContent>
        </form>
      </div>

      {newKey && (
        <div className="glass-card rise-in border-primary/50">
          <CardHeader>
            <CardTitle>{t("settings.saveApiKeyNowTitle")}</CardTitle>
            <CardDescription>{t("settings.saveApiKeyNowDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded-md border border-border bg-secondary/40 p-3 text-sm">{newKey}</code>
          </CardContent>
        </div>
      )}
    </div>
  );
}

const PAYMENT_STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  SUCCEEDED: "settings.paymentSucceeded",
  FAILED: "settings.paymentFailed",
  PENDING: "settings.paymentPending",
};

// Matches SUBSCRIPTION_STATUSES exactly (packages/schemas/src/enums.ts) —
// previously had TRIALING/PAST_DUE/CANCELED, which this enum has never had,
// while the real TRIAL/SUSPENDED values had no label and fell back to raw
// English text.
const SUBSCRIPTION_STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  TRIAL: "settings.subTrial",
  ACTIVE: "settings.subActive",
  EXPIRED: "settings.subExpired",
  SUSPENDED: "settings.subSuspended",
};

// Semantic glow per Constitution — ACTIVE reads as success, TRIAL as a
// warning (time-limited), EXPIRED/SUSPENDED as critical. Same pattern as
// team/page.tsx's STATUS_GLOW for user status badges.
const SUBSCRIPTION_STATUS_GLOW: Record<string, "glow-success" | "glow-warning" | "glow-critical" | ""> = {
  TRIAL: "glow-warning",
  ACTIVE: "glow-success",
  EXPIRED: "glow-critical",
  SUSPENDED: "glow-critical",
};

function BillingTab() {
  const { t } = useTranslation();
  const { data: subscription } = useQuery({ queryKey: ["subscriptions", "me"], queryFn: subscriptionsApi.mine });
  const { data: payments } = useQuery({ queryKey: ["payments", "me"], queryFn: () => paymentsApi.mine(1, 20) });

  // A paid plan gets the gold "premium" treatment — dark-mode only (via the
  // `dark:` variant) per the Constitution's §3.4/§3.5 guidance that
  // glow-premium must never be the sole visual cue in light mode; the plan
  // name/price text already carries the information there.
  const isPaidPlan = (subscription?.plan.priceCents ?? 0) > 0;

  return (
    <div className="mt-4 space-y-6">
      <div className="glass-hero p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="crystal-badge h-12 w-12 shrink-0 bg-primary/15 text-primary">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold leading-none tracking-tight">{t("settings.currentPlanTitle")}</h3>
              <div className={cn("mt-2 rounded-lg", isPaidPlan && "dark:glow-premium")}>
                <p className="font-medium">{subscription?.plan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {t("settings.pricePerMonth", { price: formatMoneyCents(subscription?.plan.priceCents ?? 0) })}
                </p>
              </div>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "border-transparent",
              (subscription && SUBSCRIPTION_STATUS_GLOW[subscription.status]) || "bg-secondary/60 text-muted-foreground",
            )}
          >
            {(() => {
              const key = subscription ? SUBSCRIPTION_STATUS_LABEL_KEY[subscription.status] : undefined;
              return key ? t(key) : subscription?.status;
            })()}
          </Badge>
        </div>
      </div>

      <div className="glass-card">
        <CardHeader>
          <CardTitle>{t("settings.paymentHistoryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!payments || payments.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.noPaymentsYet")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.dateHeader")}</TableHead>
                  <TableHead>{t("settings.amountHeader")}</TableHead>
                  <TableHead>{t("settings.statusHeader")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.items.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.paidAt ?? payment.createdAt)}</TableCell>
                    <TableCell>{formatMoneyCents(payment.amountCents, payment.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={payment.status === "SUCCEEDED" ? "success" : "secondary"}>
                        {(() => {
                          const key = PAYMENT_STATUS_LABEL_KEY[payment.status];
                          return key ? t(key) : payment.status;
                        })()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </div>
    </div>
  );
}
