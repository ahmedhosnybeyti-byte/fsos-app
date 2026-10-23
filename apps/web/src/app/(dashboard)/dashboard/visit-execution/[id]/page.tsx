"use client";
import { useParams } from "next/navigation";
import { VisitExecutionScreen } from "@/components/visit-execution/visit-execution-screen";
export default function VisitExecutionPage() {
  const params = useParams<{ id: string }>();
  return <VisitExecutionScreen id={params.id} />;
}
