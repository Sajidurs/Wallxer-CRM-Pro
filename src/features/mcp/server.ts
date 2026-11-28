import { createMcpHandler } from "mcp-handler";

import { registerCatalogTools } from "./tools/catalog";
import { registerContactTools } from "./tools/contacts";
import { registerDashboardTools } from "./tools/dashboard";
import { registerFinanceTools } from "./tools/finance";
import { registerInvoiceTools } from "./tools/invoices";
import { registerPipelineTools } from "./tools/pipeline";
import { registerProjectTools } from "./tools/projects";
import { registerProposalTools } from "./tools/proposals";
import { registerRenewalTools } from "./tools/renewals";
import { registerTaskTools } from "./tools/tasks";

/**
 * Stateless Streamable HTTP MCP server.
 *
 * Tools close over nothing about the caller. Each request binds a context
 * before this handler runs, and the tool reads it back from that request.
 */
export const mcpHandler = createMcpHandler(
  (server) => {
    registerDashboardTools(server);
    registerContactTools(server);
    registerPipelineTools(server);
    registerProjectTools(server);
    registerTaskTools(server);
    registerProposalTools(server);
    registerInvoiceTools(server);
    registerFinanceTools(server);
    registerRenewalTools(server);
    registerCatalogTools(server);
  },
  {
    serverInfo: { name: "wallxer-crm", version: "1.0.0" },
    instructions: [
      "Wallxer CRM. You are acting as the person linked to the API key.",
      "Read tools need the read scope (write implies read).",
      "Write tools need the write scope, and the linked person's role still applies.",
      "Finance and invoice tools need the finance scope and finance access on that person.",
      "Money inputs are major units (1500 or \"1500.50\"). Money outputs are minor units: amount_poisha, *_minor. Divide by 100.",
      "Deal amounts are already major-unit decimals.",
      "There are no delete tools. Credential tools return label, category, url, and username only.",
      "Updates replace the fields the form edits. Read the record first.",
    ].join(" "),
  },
);
