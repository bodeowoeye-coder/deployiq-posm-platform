import { ClientRoutePage } from "@/app/client/ClientRoutePage";

export const dynamic = "force-dynamic";

export default function ClientAccountPage() {
  return <ClientRoutePage initialView="profile" />;
}
