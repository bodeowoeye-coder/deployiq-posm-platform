import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function NewCampaignRedirectPage() {
  redirect("/workspace/admin/projects/new");
}
