import { redirect } from "next/navigation";

export default function OperationalBuildPage() {
  redirect("/workspace/build/projects");
}
