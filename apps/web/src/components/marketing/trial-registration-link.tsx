"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PublicTrialRegistration } from "./public-trial-registration";

export function TrialRegistrationLink() {
  return (
    <PublicTrialRegistration>
      <Button size="lg" asChild className="shadow-[0_0_32px_-6px_hsl(var(--primary)/0.7)]">
        <Link href="/register">
          Start free trial <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </PublicTrialRegistration>
  );
}
