import { redirect } from "next/navigation";

/**
 * Full-Site SEO Audit is now unified into the primary SEO Health & Audit hub (/workspace/seo).
 * Redirect all direct visits to /workspace/seo.
 */
export default function SiteAuditRedirectPage() {
  redirect("/workspace/seo");
}
