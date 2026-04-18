"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PlanOption {
  id: string;
  name: string;
  isSeatBased: boolean;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  pricePerSeatMonthlyCents: number | null;
  pricePerSeatYearlyCents: number | null;
}

interface AccountMatch {
  id: string;
  name: string;
  type: "personal" | "team";
  planId: string;
  memberCount: number;
}

interface PreviewResponse {
  ok: boolean;
  preview?: {
    account: {
      id: string;
      name: string;
      currentPlan: string;
      currentExpiry: string | null;
    };
    plan: { id: string; name: string };
    period: "monthly" | "yearly";
    grossCents: number;
    netCents: number;
    taxCents: number;
    taxRate: number;
    description: string;
    customer: { name: string; email: string };
    newPlanExpiry: string | null;
    sendEmail: boolean;
    invoiceUserId: string;
  };
  error?: string;
}

interface CommitResponse {
  ok: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  orderId?: string;
  emailSent?: boolean;
  error?: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: "Account",
  2: "Parameter",
  3: "Preview",
  4: "Bestätigen",
  5: "Ergebnis",
};

export function NewTeamInvoiceWizard({ plans }: { plans: PlanOption[] }) {
  const [step, setStep] = useState<Step>(1);

  // Step 1: Account
  const [accountQuery, setAccountQuery] = useState("");
  const [account, setAccount] = useState<AccountMatch | null>(null);

  // Step 2: Parameters
  const defaultPlanId = plans.find((p) => p.isSeatBased)?.id ?? plans[0]?.id ?? "";
  const [planId, setPlanId] = useState(defaultPlanId);
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const [grossEuros, setGrossEuros] = useState("");
  const [description, setDescription] = useState("Team-Abo");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [extendPlanExpiry, setExtendPlanExpiry] = useState(true);

  // Step 3/4/5
  const [preview, setPreview] = useState<PreviewResponse["preview"] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResponse | null>(null);

  // Populate customer defaults when account changes.
  useEffect(() => {
    if (!account) return;
    if (!customerName) setCustomerName(account.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  function goToStep(next: Step) {
    setStep(next);
  }

  function buildCommonPayload() {
    if (!account) return null;
    const grossCents = Math.round(Number(grossEuros.replace(",", ".")) * 100);
    if (!Number.isFinite(grossCents) || grossCents < 0) return null;
    return {
      ownerAccountId: account.id,
      planId,
      period,
      grossCents,
      description: description.trim(),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      expiresAt: expiresAt ? new Date(expiresAt + "T23:59:59Z").toISOString() : undefined,
      sendEmail,
      extendPlanExpiry,
    };
  }

  async function runPreview() {
    const common = buildCommonPayload();
    if (!common) {
      toast.error("Parameter prüfen — Betrag und Felder müssen gesetzt sein.");
      return;
    }
    if (!common.customerEmail || !common.customerName || !common.description) {
      toast.error("Beschreibung, Kundenname und -email sind Pflicht.");
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch("/api/admin/billing/manual-team-invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...common, mode: "preview" }),
      });
      const body = (await res.json()) as PreviewResponse;
      if (!res.ok || !body.ok || !body.preview) {
        toast.error(body.error ?? "Preview konnte nicht erzeugt werden.");
        return;
      }
      setPreview(body.preview);
      goToStep(3);
    } finally {
      setPreviewing(false);
    }
  }

  async function commit() {
    const common = buildCommonPayload();
    if (!common) return;
    setCommitting(true);
    try {
      const res = await fetch("/api/admin/billing/manual-team-invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...common, mode: "commit" }),
      });
      const body = (await res.json()) as CommitResponse;
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "Commit fehlgeschlagen.");
        return;
      }
      setResult(body);
      goToStep(5);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {step === 1 ? (
        <Step1Account
          query={accountQuery}
          onQuery={setAccountQuery}
          selected={account}
          onSelect={(a) => {
            setAccount(a);
            setCustomerName(a.name);
          }}
          onNext={() => goToStep(2)}
        />
      ) : null}

      {step === 2 && account ? (
        <Step2Params
          account={account}
          plans={plans}
          planId={planId}
          onPlanId={setPlanId}
          period={period}
          onPeriod={setPeriod}
          grossEuros={grossEuros}
          onGrossEuros={setGrossEuros}
          description={description}
          onDescription={setDescription}
          customerName={customerName}
          onCustomerName={setCustomerName}
          customerEmail={customerEmail}
          onCustomerEmail={setCustomerEmail}
          expiresAt={expiresAt}
          onExpiresAt={setExpiresAt}
          sendEmail={sendEmail}
          onSendEmail={setSendEmail}
          extendPlanExpiry={extendPlanExpiry}
          onExtendPlanExpiry={setExtendPlanExpiry}
          onBack={() => goToStep(1)}
          onNext={() => void runPreview()}
          previewing={previewing}
        />
      ) : null}

      {step === 3 && preview ? (
        <Step3Preview
          preview={preview}
          onBack={() => goToStep(2)}
          onNext={() => goToStep(4)}
        />
      ) : null}

      {step === 4 && preview ? (
        <Step4Confirm
          preview={preview}
          committing={committing}
          onBack={() => goToStep(3)}
          onCommit={() => void commit()}
        />
      ) : null}

      {step === 5 && result ? <Step5Result result={result} /> : null}
    </div>
  );
}

/* ── Stepper ────────────────────────────────────────────────────────── */

function Stepper({ current }: { current: Step }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <li key={n} className="flex items-center gap-2">
          <span
            className={
              n < current
                ? "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
                : n === current
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white"
                  : "flex h-6 w-6 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground"
            }
          >
            {n < current ? <Check className="h-3 w-3" /> : n}
          </span>
          <span
            className={
              n === current ? "font-medium text-foreground" : "text-muted-foreground"
            }
          >
            {STEP_LABELS[n]}
          </span>
          {n < 5 ? <span className="text-muted-foreground">→</span> : null}
        </li>
      ))}
    </ol>
  );
}

/* ── Step 1: Account ────────────────────────────────────────────────── */

function Step1Account({
  query,
  onQuery,
  selected,
  onSelect,
  onNext,
}: {
  query: string;
  onQuery: (v: string) => void;
  selected: AccountMatch | null;
  onSelect: (a: AccountMatch) => void;
  onNext: () => void;
}) {
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<AccountMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/admin/accounts?q=${encodeURIComponent(debounced)}&type=team&pageSize=10`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((j: { accounts: AccountMatch[] }) => setResults(j.accounts ?? []))
      .catch(() => {
        /* ignore abort */
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schritt 1 · Team-Account wählen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Suche nach Team-Name…"
            className="pl-8"
            autoFocus
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Suche läuft…
          </div>
        ) : null}

        <ul className="divide-y rounded-md border">
          {results.length === 0 && debounced ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              Keine Team-Accounts gefunden.
            </li>
          ) : null}
          {results.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  Plan: {a.planId} · {a.memberCount} Mitglieder
                </div>
              </div>
              <Button
                size="sm"
                variant={selected?.id === a.id ? "default" : "outline"}
                onClick={() => onSelect(a)}
              >
                {selected?.id === a.id ? "Gewählt" : "Wählen"}
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <Button onClick={onNext} disabled={!selected}>
            Weiter <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Step 2: Parameters ─────────────────────────────────────────────── */

function Step2Params(props: {
  account: AccountMatch;
  plans: PlanOption[];
  planId: string;
  onPlanId: (v: string) => void;
  period: "monthly" | "yearly";
  onPeriod: (v: "monthly" | "yearly") => void;
  grossEuros: string;
  onGrossEuros: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  customerName: string;
  onCustomerName: (v: string) => void;
  customerEmail: string;
  onCustomerEmail: (v: string) => void;
  expiresAt: string;
  onExpiresAt: (v: string) => void;
  sendEmail: boolean;
  onSendEmail: (v: boolean) => void;
  extendPlanExpiry: boolean;
  onExtendPlanExpiry: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
  previewing: boolean;
}) {
  const plan = props.plans.find((p) => p.id === props.planId);

  function useSuggestedPrice() {
    if (!plan) return;
    let cents: number | null = null;
    if (plan.isSeatBased) {
      const perSeat =
        props.period === "yearly"
          ? plan.pricePerSeatYearlyCents
          : plan.pricePerSeatMonthlyCents;
      if (perSeat != null && props.account.memberCount > 0) {
        cents = perSeat * props.account.memberCount;
      }
    } else {
      cents =
        props.period === "yearly"
          ? plan.priceYearlyCents
          : plan.priceMonthlyCents;
    }
    if (cents != null && cents > 0) {
      props.onGrossEuros((cents / 100).toFixed(2).replace(".", ","));
    } else {
      toast.info("Kein Tarif für diese Plan/Period-Kombi hinterlegt.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schritt 2 · Parameter für {props.account.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Plan</Label>
            <select
              value={props.planId}
              onChange={(e) => props.onPlanId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {props.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id}){p.isSeatBased ? " · seat-basiert" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Periode</Label>
            <select
              value={props.period}
              onChange={(e) =>
                props.onPeriod(e.target.value as "monthly" | "yearly")
              }
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="monthly">Monatlich</option>
              <option value="yearly">Jährlich</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Brutto-Betrag (€)</Label>
            <div className="flex items-center gap-2">
              <Input
                value={props.grossEuros}
                onChange={(e) => props.onGrossEuros(e.target.value)}
                placeholder="z.B. 1.200,00"
                inputMode="decimal"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={useSuggestedPrice}
              >
                Tarif übernehmen
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Netto und USt. werden automatisch aus Brutto heraus-gerechnet
              (aktueller Satz: {(Number(process.env.NEXT_PUBLIC_TAX_RATE ?? "19"))}{" "}
              %).
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ablaufdatum</Label>
            <Input
              type="date"
              value={props.expiresAt}
              onChange={(e) => props.onExpiresAt(e.target.value)}
            />
            <div className="text-[10px] text-muted-foreground">
              leer = +1 Monat bzw. +1 Jahr ab heute
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Beschreibung (auf der Rechnung)</Label>
          <Input
            value={props.description}
            onChange={(e) => props.onDescription(e.target.value)}
            placeholder="z.B. Team-Abo 2026 (10 Seats, jährlich)"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Kundenname (Rechnungsadressat)</Label>
            <Input
              value={props.customerName}
              onChange={(e) => props.onCustomerName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kunden-Email</Label>
            <Input
              type="email"
              value={props.customerEmail}
              onChange={(e) => props.onCustomerEmail(e.target.value)}
              placeholder="kunde@firma.tld"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-md border p-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.extendPlanExpiry}
              onChange={(e) => props.onExtendPlanExpiry(e.target.checked)}
            />
            <span>
              Plan-Laufzeit verlängern (Account auf Plan + Expiry setzen)
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.sendEmail}
              onChange={(e) => props.onSendEmail(e.target.checked)}
            />
            <span>Rechnungs-Mail mit PDF-Link an Kunden senden</span>
          </label>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={props.onBack}>
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <Button onClick={props.onNext} disabled={props.previewing}>
            {props.previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Preview <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Step 3: Preview ────────────────────────────────────────────────── */

function Step3Preview({
  preview,
  onBack,
  onNext,
}: {
  preview: NonNullable<PreviewResponse["preview"]>;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schritt 3 · Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Account">
            {preview.account.name}
            <div className="text-xs text-muted-foreground">
              Aktuell: Plan "{preview.account.currentPlan}"
              {preview.account.currentExpiry
                ? ` (Ablauf: ${new Date(preview.account.currentExpiry).toLocaleDateString("de-DE")})`
                : " (kein Ablauf)"}
            </div>
          </Row>
          <Row label="Neuer Plan">
            {preview.plan.name} · {preview.period}
          </Row>
          <Row label="Beschreibung">{preview.description}</Row>
          <Row label="Kunde">
            {preview.customer.name} · {preview.customer.email}
          </Row>
          <Row label="Netto">{formatCents(preview.netCents)}</Row>
          <Row label={`USt. (${(preview.taxRate * 100).toFixed(0)}%)`}>
            {formatCents(preview.taxCents)}
          </Row>
          <Row label="Brutto" strong>
            {formatCents(preview.grossCents)}
          </Row>
          <Row label="Neue Expiry">
            {preview.newPlanExpiry
              ? new Date(preview.newPlanExpiry).toLocaleDateString("de-DE")
              : "+ Standard-Periode ab heute"}
          </Row>
          <Row label="Email">
            {preview.sendEmail ? "Wird gesendet" : "Nicht gesendet"}
          </Row>
        </dl>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <Button onClick={onNext}>
            Weiter <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Step 4: Confirm ────────────────────────────────────────────────── */

function Step4Confirm({
  preview,
  committing,
  onBack,
  onCommit,
}: {
  preview: NonNullable<PreviewResponse["preview"]>;
  committing: boolean;
  onBack: () => void;
  onCommit: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const expected = preview.account.name;
  const canCommit = confirm.trim() === expected && !committing;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schritt 4 · Bestätigen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          Achtung: Im nächsten Schritt wird ein Order-Eintrag{" "}
          <strong>gestellt</strong> (paymentMethod <code>manual</code>,
          status <code>captured</code>), die Rechnung erzeugt und als PDF
          abgelegt. Diese Aktion ist nicht per-Klick rückgängig zu machen
          — Rechnungen sind immutable.
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            Zur Bestätigung bitte den Account-Namen eintippen:{" "}
            <code>{expected}</code>
          </Label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={expected}
            autoFocus
          />
        </div>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <Button
            onClick={onCommit}
            disabled={!canCommit}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            {committing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Rechnung anlegen"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Step 5: Result ─────────────────────────────────────────────────── */

function Step5Result({ result }: { result: CommitResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Check className="h-5 w-5 text-emerald-600" />
          Fertig
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          Rechnungsnummer:{" "}
          <span className="font-mono">{result.invoiceNumber}</span>
        </div>
        {result.emailSent ? (
          <div className="text-emerald-700 dark:text-emerald-400">
            Rechnungs-Mail wurde versendet.
          </div>
        ) : (
          <div className="text-muted-foreground">
            Keine Mail versendet (oder Mail-Versand fehlgeschlagen — Logs prüfen).
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/admin/invoices/${result.invoiceId}`} />}
          >
            Rechnung öffnen
          </Button>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={`/api/admin/invoices/${result.invoiceId}/pdf`}
                target="_blank"
                rel="noopener"
              />
            }
          >
            PDF öffnen
          </Button>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/admin/invoices" />}
          >
            Zur Rechnungsliste
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Utils ──────────────────────────────────────────────────────────── */

function formatCents(c: number): string {
  return (c / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className={strong ? "mt-0.5 text-lg font-semibold tabular-nums" : "mt-0.5"}>
        {children}
      </dd>
    </div>
  );
}
