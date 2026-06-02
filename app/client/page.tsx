import { ClientRoutePage } from "@/app/client/ClientRoutePage";

export const dynamic = "force-dynamic";

export default function ClientPage() {
  return <ClientRoutePage initialView="overview" />;
}
