import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AUTH_COOKIE_NAMES } from "@field-sales-os/schemas";
import { canViewSfaPreview } from "@/lib/sfa-preview-access";
import { SfaSetupScreen } from "@/components/sfa-setup-screen";

export const dynamic = "force-dynamic";

export default async function SfaPreviewPage() {
  const token = (await cookies()).get(AUTH_COOKIE_NAMES.accessToken)?.value;
  if (!token) redirect("/login");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl || !await canViewSfaPreview(apiUrl, `${AUTH_COOKIE_NAMES.accessToken}=${token}`)) notFound();
  return <SfaSetupScreen preview />;
}
