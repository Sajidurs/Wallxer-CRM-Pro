"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { importContacts, type ImportSummary } from "../actions";
import {
  FIELD_LABELS,
  IMPORT_FIELDS,
  guessMapping,
  parseCsv,
  type ImportField,
} from "../csv";

const IGNORE = "__ignore__";

interface Option {
  id: string;
  name: string;
}

interface ImportWizardProps {
  owners: Option[];
  brands: Option[];
  currentUserId: string;
}

type Step = "upload" | "map" | "done";

export function ImportWizard({ owners, brands, currentUserId }: ImportWizardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [busy, setBusy] = useState(false);

  const [updateExisting, setUpdateExisting] = useState(true);
  const [ownerId, setOwnerId] = useState<string>(currentUserId);
  const [brandId, setBrandId] = useState<string>(IGNORE);
  const [status, setStatus] = useState<"lead" | "active">("lead");

  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseCsv(text);

      if (rows.length < 2) {
        toast.error("That file has a header but no rows.");
        return;
      }

      setCsv(text);
      setHeaders(rows[0]);
      setPreview(rows.slice(1, 6));
      setMapping(guessMapping(rows[0]));
      setStep("map");
    };
    reader.onerror = () => toast.error("That file could not be read.");
    reader.readAsText(file);
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    const result = await importContacts({
      csv,
      mapping,
      dryRun,
      options: {
        updateExisting,
        ownerId: ownerId === IGNORE ? null : ownerId,
        brandId: brandId === IGNORE ? null : brandId,
        status,
      },
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setSummary(result.data);
    if (!dryRun) {
      setStep("done");
      router.refresh();
    }
  }

  const mappedEmail = mapping.includes("email");
  const mappedAnyName =
    mapping.includes("firstName") ||
    mapping.includes("lastName") ||
    mapping.includes("companyName");

  // ---------------------------------------------------------------- upload
  if (step === "upload") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Choose a file</CardTitle>
          <CardDescription>
            A CSV with a header row. Columns are matched to fields automatically,
            and you can correct the guesses before anything is written.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) readFile(file);
            }}
            className="rounded-lg border border-dashed p-10 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readFile(file);
              }}
            />
            <FileUp className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="text-sm">
              Drop a CSV here, or{" "}
              <button
                type="button"
                className="font-medium underline underline-offset-4"
                onClick={() => inputRef.current?.click()}
              >
                choose a file
              </button>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Up to 5,000 rows at a time. Existing contacts are matched by email.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------------------------------ done
  if (step === "done" && summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            Import finished
          </CardTitle>
          <CardDescription>
            {summary.created} created, {summary.updated} updated,{" "}
            {summary.skipped} skipped, {summary.failed} failed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.failed > 0 && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                {summary.failed} row{summary.failed === 1 ? "" : "s"} could not be
                imported. They are listed below with the reason. Everything else
                was saved.
              </AlertDescription>
            </Alert>
          )}

          {summary.withoutEmail > 0 && (
            <Alert>
              <AlertTriangle />
              <AlertDescription>
                {summary.withoutEmail} row
                {summary.withoutEmail === 1 ? " has" : "s have"} no email address.
                Duplicates are detected by email, so importing this file again
                would create {summary.withoutEmail === 1 ? "it" : "them"} a second
                time.
              </AlertDescription>
            </Alert>
          )}

          <RowReport rows={summary.rows} />

          <div className="flex gap-2">
            <Button onClick={() => router.push("/contacts")}>View contacts</Button>
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setSummary(null);
                setCsv("");
              }}
            >
              Import another file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------------------------------- map
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Match the columns</CardTitle>
          <CardDescription>
            {headers.length} column{headers.length === 1 ? "" : "s"} found. Set
            anything you do not want to import to &ldquo;Ignore&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!mappedAnyName && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                No column is mapped to a name or a company. Every row will fail —
                a contact needs something to be called.
              </AlertDescription>
            </Alert>
          )}

          {!mappedEmail && (
            <Alert>
              <AlertTriangle />
              <AlertDescription>
                No column is mapped to email. Duplicates are detected by email, so
                without it every row will be imported as a new contact.
              </AlertDescription>
            </Alert>
          )}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">Column in your file</TableHead>
                  <TableHead className="w-56">Imports as</TableHead>
                  <TableHead>First few values</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {headers.map((header, index) => (
                  <TableRow key={`${header}-${index}`}>
                    <TableCell className="font-medium">{header || "(no name)"}</TableCell>
                    <TableCell>
                      <Select
                        value={mapping[index] ?? IGNORE}
                        onValueChange={(value) =>
                          setMapping((current) => {
                            const next = [...current];
                            next[index] = value === IGNORE ? null : (value as ImportField);
                            return next;
                          })
                        }
                      >
                        <SelectTrigger aria-label={`Map column ${header}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={IGNORE}>Ignore</SelectItem>
                          {IMPORT_FIELDS.map((field) => (
                            <SelectItem key={field} value={field}>
                              {FIELD_LABELS[field]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {preview
                        .map((row) => row[index])
                        .filter((v) => v && v.trim())
                        .slice(0, 3)
                        .join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings for every imported row</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="importOwner">Owner</FieldLabel>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="importOwner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={IGNORE}>Unassigned</SelectItem>
                {owners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="importBrand">Brand</FieldLabel>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger id="importBrand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={IGNORE}>No brand</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="importStatus">Status</FieldLabel>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as "lead" | "active")}
            >
              <SelectTrigger id="importStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="sm:col-span-3">
            <label className="flex items-start gap-2">
              <Checkbox
                checked={updateExisting}
                onCheckedChange={(value) => setUpdateExisting(value === true)}
              />
              <span className="text-sm">
                Update contacts that already exist
                <span className="block text-xs text-muted-foreground">
                  Matched on email. Unticked, existing contacts are left exactly
                  as they are and the row is skipped.
                </span>
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      {summary?.dryRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Preview: {summary.created} to create, {summary.updated} to update,{" "}
              {summary.skipped} skipped, {summary.failed} would fail
            </CardTitle>
            <CardDescription>
              Nothing has been written yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
          {summary.withoutEmail > 0 && (
            <Alert>
              <AlertTriangle />
              <AlertDescription>
                {summary.withoutEmail} row
                {summary.withoutEmail === 1 ? " has" : "s have"} no email address.
                Duplicates are detected by email, so importing this file again
                would create {summary.withoutEmail === 1 ? "it" : "them"} a second
                time.
              </AlertDescription>
            </Alert>
          )}

            <RowReport rows={summary.rows} />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setStep("upload");
            setSummary(null);
          }}
          disabled={busy}
        >
          <ArrowLeft />
          Back
        </Button>

        <Button variant="secondary" onClick={() => run(true)} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          Preview without saving
        </Button>

        <Button onClick={() => run(false)} disabled={busy || !mappedAnyName}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          Import
        </Button>
      </div>
    </div>
  );
}

function RowReport({ rows }: { rows: ImportSummary["rows"] }) {
  if (rows.length === 0) return null;

  const variant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    created: "default",
    updated: "secondary",
    skipped: "outline",
    failed: "destructive",
  };

  return (
    <div className="max-h-80 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead className="w-28">Outcome</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.line}-${row.outcome}`}>
              <TableCell className="text-xs text-muted-foreground">
                {row.line}
              </TableCell>
              <TableCell>
                <Badge variant={variant[row.outcome] ?? "outline"}>
                  {row.outcome}
                </Badge>
              </TableCell>
              <TableCell className="truncate text-sm">{row.label}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.reason ?? ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
