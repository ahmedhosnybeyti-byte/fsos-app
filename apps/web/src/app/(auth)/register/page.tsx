"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { registerSchema, type RegisterInput } from "@field-sales-os/schemas";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const mutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Your 14-day trial has started.");
      router.push("/dashboard");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  return (
    <Card className="glass-hero rise-in rise-d1 relative border-0">
      <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
      <CardHeader className="relative">
        <CardTitle>Start your free trial</CardTitle>
        <CardDescription>Creates your company workspace and a 14-day trial — no card required.</CardDescription>
      </CardHeader>
      <form className="relative" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company name</Label>
            <Input id="companyName" placeholder="Acme Field Sales" {...register("companyName")} />
            {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Your name</Label>
            <Input id="fullName" autoComplete="name" placeholder="Jane Doe" {...register("fullName")} />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            <p className="text-xs text-muted-foreground">
              At least 10 characters, with an uppercase letter, number, and symbol.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            Create workspace
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Log in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
