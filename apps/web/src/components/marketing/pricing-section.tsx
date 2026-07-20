"use client";

import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { plansApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoneyCents } from "@/lib/utils";

export function PricingSection() {
  const { data: plans, isLoading, isError } = useQuery({ queryKey: ["plans", "public"], queryFn: plansApi.listPublic });

  return (
    <section id="pricing" className="container py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple, transparent pricing</h2>
        <p className="mt-3 text-muted-foreground">Every plan starts with a 14-day trial. No credit card required.</p>
      </div>

      {isLoading && (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      )}

      {isError && (
        <p className="mt-12 text-center text-sm text-muted-foreground">
          Pricing is temporarily unavailable. Please try again shortly.
        </p>
      )}

      {plans && plans.length === 0 && (
        <p className="mt-12 text-center text-sm text-muted-foreground">No plans are available right now. Check back soon.</p>
      )}

      {plans && plans.length > 0 && (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <Card key={plan.id} className={plan.code === "professional" ? "border-primary shadow-lg shadow-primary/10" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {plan.code === "professional" && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Popular</span>
                  )}
                </CardTitle>
                <div className="pt-2">
                  {plan.features?.customPricing ? (
                    <span className="text-2xl font-semibold">Custom</span>
                  ) : (
                    <>
                      <span className="text-3xl font-semibold">{formatMoneyCents(plan.priceCents, plan.currency)}</span>
                      <span className="text-muted-foreground">/mo</span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <FeatureRow label={`Up to ${plan.maxUsers ?? "unlimited"} users`} />
                <FeatureRow label={`${plan.features?.analysisPerMonth ?? "—"} analyses / month`} />
                <FeatureRow label="Company-wide Custom GPT" />
                <FeatureRow label={`${plan.features?.support ?? "community"} support`} />
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full" variant={plan.code === "professional" ? "default" : "outline"}>
                  <Link href="/register">Start free trial</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function FeatureRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Check className="h-4 w-4 shrink-0 text-primary" />
      <span>{label}</span>
    </div>
  );
}
