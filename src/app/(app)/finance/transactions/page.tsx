import { redirect } from "next/navigation";

/**
 * The ledger moved onto /finance itself, where it sits under the reports with
 * a Load more button. This stays as a redirect rather than being deleted so a
 * bookmark or an old link still lands somewhere useful.
 */
export default function TransactionsPage() {
  redirect("/finance");
}
