import { redirect } from "next/navigation";

/** /workspace redirects to the default view (dashboard) */
export default function WorkspacePage() {
  redirect("/workspace/dashboard");
}
