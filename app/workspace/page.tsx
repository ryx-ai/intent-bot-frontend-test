import { redirect } from "next/navigation";

/** /workspace redirects to the default view (testing) */
export default function WorkspacePage() {
  redirect("/workspace/testing");
}
