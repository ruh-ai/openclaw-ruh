import { redirect } from "next/navigation";
import { agentsRoute } from "@/shared/routes";

// Redirect root to agents page (the default view)
export default function DashboardPage() {
  redirect(agentsRoute);
}
