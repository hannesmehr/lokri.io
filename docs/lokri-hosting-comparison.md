# Lokri Hosting-Vergleich: Vercel-Stack vs. AWS-Stack

**Stand:** April 2026
**Annahme:** Lokri nach Connector-Framework-Launch, erste Wachstumsphase

---

## Vergleichs-Szenarien

Drei typische lokri-Betriebszustände:

| Szenario | Beschreibung | Monatliche Traffic-Größen |
|---|---|---|
| **A — Early** | Erste Pilotkunden, wenige aktive MCP-Clients | 50k Requests, 100 GB Bandbreite, 50 GB DB-Storage, 10M LLM-Tokens/Monat |
| **B — Growth** | 100+ aktive Kunden, täglicher MCP-Traffic | 2M Requests, 1 TB Bandbreite, 200 GB DB-Storage, 500M LLM-Tokens/Monat |
| **C — Scale** | 1000+ Kunden, intensive Agent-Nutzung | 20M Requests, 5 TB Bandbreite, 1 TB DB-Storage, 5 Mrd. LLM-Tokens/Monat |

---

## 1. App-Hosting

### Vercel (aktueller Stack)

**Pro-Plan:** $20/seat/month, 1 TB Fast Data Transfer inklusive, 10M Edge Requests, $20/month Credit gegen Overages.

**Pricing-Dimensionen:**
- CPU-Time: $0.128/CPU-Stunde
- Provisioned Memory: $0.0106/GB-Stunde
- Function Invocations: $0.60/Million
- Bandbreite-Overage: $0.15/GB (ab 1 TB)

**Kosten pro Szenario (ein Seat, du als Admin):**

| | Base | Compute | Bandbreite-Overage | Gesamt |
|---|---|---|---|---|
| A (Early) | $20 | ~$5 | $0 | **~$25** |
| B (Growth) | $20 | ~$80 | $0 (exakt 1 TB) | **~$100** |
| C (Scale) | $20 | ~$500 | ~$600 (4 TB × $0.15) | **~$1.100-1.300** |

Quelle: Vercel Pricing Feb 2026, [deploywise.dev](https://deploywise.dev/blog/vercel-pricing-explained)

**Schwächen:** Bandbreite-Overages eskalieren nichtlinear. Bei Szenario C übersteigen Transfer-Kosten die Compute-Kosten. Mehrere Quellen berichten von 3-7x Kostensprüngen in der Wachstumsphase.

### AWS EC2 (Graviton, t4g-Familie)

**Instance-Optionen:**
- `t4g.medium` (2 vCPU, 4 GB RAM): ~$24/month on-demand, ~$15/month mit 1-Year Savings Plan
- `t4g.large` (2 vCPU, 8 GB RAM): ~$49/month on-demand, ~$31/month Savings Plan
- `t4g.xlarge` (4 vCPU, 16 GB RAM): ~$98/month on-demand, ~$62/month Savings Plan

**Plus Fixkosten:**
- Application Load Balancer: ~$18/month + $0.008 pro LCU-Stunde
- NAT Gateway (falls benötigt): ~$35/month + $0.045 pro GB
- Data Transfer Out: $0.09/GB (erste 10 TB)
- CloudWatch Logs: $0.50/GB eingehend

**Kosten pro Szenario (1-Jahr-Savings-Plan-Preise):**

| | Instance | ALB + LCU | Data Transfer Out | CloudWatch | Gesamt |
|---|---|---|---|---|---|
| A (Early) | $31 (t4g.large) | $25 | $9 (100 GB) | $5 | **~$70** |
| B (Growth) | $62 (t4g.xlarge) | $40 | $90 (1 TB) | $20 | **~$212** |
| C (Scale) | $180 (3x t4g.xlarge) | $80 | $450 (5 TB) | $80 | **~$790** |

Quelle: [go-cloud.io EC2 Pricing 2026](https://go-cloud.io/amazon-ec2-pricing/)

**Aufwand:** Du musst den EC2-Stack selbst bauen (CDK), Auto-Scaling einrichten, SSL, Logging, Deployments. Zeitinvestition einmalig: 40-80 Stunden.

### AWS Fargate (ECS Serverless)

**Pricing:**
- vCPU: $0.04/Stunde
- Memory: $0.004/GB/Stunde
- Plus ALB, NAT, Data Transfer wie bei EC2

Laut mehrerer Quellen ist Fargate **20-30% teurer** als gleich-dimensioniertes EC2. Eine `2 vCPU + 4 GB`-Fargate-Task rund um die Uhr: ~$87/month.

**Kosten pro Szenario:**

| | Fargate Tasks | Plus-Infrastruktur | Gesamt |
|---|---|---|---|
| A (Early) | $87 (1 Task) | $39 | **~$126** |
| B (Growth) | $174 (2 Tasks) | $150 | **~$324** |
| C (Scale) | $435 (5 Tasks) | $600 | **~$1.035** |

Quelle: [cloudexmachina.io Fargate Pricing](https://www.cloudexmachina.io/blog/fargate-pricing), [flexera.com](https://www.flexera.com/blog/finops/aws-fargate-pricing-how-to-optimize-billing-and-save-costs/)

**Einschränkung:** NextJS auf Fargate ist möglich, aber Hot-Reload-Deploys und Cold-Starts brauchen Zusatzarbeit (z.B. App Runner als Alternative).

### Hetzner (Baseline, zum Abgleich)

**Dedicated Server CAX21 (4 vCPU ARM, 8 GB RAM):** €12.49/month netto (~$13).
**Cloud Server CPX31 (4 vCPU, 8 GB RAM):** €15.59/month (~$17).
**Bandbreite:** 20 TB/month inklusive bei allen Plänen.

Hetzner ist **massiv** günstiger — aber wie du richtig siehst, skaliert nicht horizontal ohne eigenen LB, keine Managed Services, kein Auto-Scaling. Gute Single-Box-Option für Szenario A+B, wird bei C zur Operations-Belastung.

---

## 2. Datenbank

### Neon (aktueller Stack)

**Preisstruktur nach November 2025 (Databricks-Acquisition brachte 15-25% Rabatt):**

- **Launch Tier:** $0.106/CU-Stunde (1 CU = 1 vCPU + 4 GB RAM)
- **Scale Tier:** $0.222/CU-Stunde
- **Storage:** $0.35/GB-month (vorher höher, aktuell gesunken)
- **Scale-to-Zero:** Kostet nichts bei Idle

**Kosten pro Szenario:**

| | Compute-Annahme | Storage | Gesamt |
|---|---|---|---|
| A (Early) | 50 CU-h/month × $0.106 = $5 | 50 GB = $18 | **~$23** |
| B (Growth) | 500 CU-h/month × $0.106 = $53 | 200 GB = $70 | **~$123** |
| C (Scale) | Permanente 2 CU durchgehend: 1.440h × 2 × $0.222 = $640 | 1 TB = $350 | **~$990** |

Quelle: [neon.com/pricing](https://neon.com/pricing), [vantage.sh](https://www.vantage.sh/blog/neon-acquisition-new-pricing)

### AWS Aurora Serverless v2

**Pricing:**
- ACU-Stunde: $0.16 (1 ACU ≈ 0.25 vCPU + 2 GB)
- **Minimum 0.5 ACU durchgehend** — kein Scale-to-Zero
- Storage: $0.225/GB-month
- I/O: entweder $0.20 pro Million bei Standard oder included bei I/O-Optimized (30% teurer)

**Fixkosten allein durch Minimum:** 0.5 × $0.16 × 730h = **$58/month** auch bei null Traffic.

**Kosten pro Szenario:**

| | ACU-Nutzung | Storage | Gesamt |
|---|---|---|---|
| A (Early) | Minimum 0.5 ACU durchgehend = $58 | 50 GB × $0.225 = $11 | **~$69** |
| B (Growth) | Ø 1 ACU = $117 | 200 GB = $45 | **~$162** |
| C (Scale) | Ø 4 ACU = $468 | 1 TB = $225 | **~$693** |

Quelle: [vantage.sh Neon vs Aurora](https://www.vantage.sh/blog/neon-vs-aws-aurora-serverless-postgres-cost-scale-to-zero)

**Kritische Differenz:** Aurora verlangt minimum 0.5 ACU. Neon scale-to-zero. Bei Szenario A zahlt Aurora **3x** mehr nur wegen Idle-Minimum.

### AWS RDS Standard (provisioned)

Für Vergleich: `db.r6g.xlarge` Multi-AZ (4 vCPU, 32 GB): **~$550/month** plus Storage. Nur relevant bei Szenario C, wenn Consistent-Throughput-Bedarf.

### Verdict DB

**Neon bleibt für Szenarien A und B klar überlegen** wegen Scale-to-Zero. Bei Szenario C (permanenter 24/7-Load) gleichen sich die Kosten an. Neon hat zusätzlich:
- Branching für Preview-Deploys
- Schlankerer Connection-Pooling
- pgvector schon eingebaut

Aurora hat zusätzlich:
- Bessere Integration mit IAM/VPC bei AWS-Stack
- Multi-Region-Replikation
- Vorhersehbarer bei Hochlast

---

## 3. AI-Inference

### Vercel AI Gateway (aktueller Stack)

Vercel AI Gateway routet an Anthropic (direkt), OpenAI etc. **Aufschlag:** Laut Vercel-Doku kein Markup auf Modell-Preise, aber Vercel-Compute-Zeit wird für die Anfragen berechnet. Effektiv nahezu identisch mit direktem API-Zugriff plus kleiner Compute-Overhead.

**Claude-Preise via Vercel AI:**
- Claude Haiku 4.5: **$0.80 / $4.00** per 1M Tokens (Input/Output)
- Claude Sonnet 4.6: **$3.00 / $15.00** per 1M Tokens
- Claude Opus 4.6: **$15.00 / $75.00** per 1M Tokens

### AWS Bedrock

**Wichtige Erkenntnis aus Research:** Bedrock-Preise für Claude **matchen die Anthropic-Direct-API-Preise exakt**. 0% Markup.

> "Claude Sonnet 4.6 costs $3/$15 per million tokens on both Bedrock and the Anthropic API." ([tokenmix.ai](https://tokenmix.ai/blog/aws-bedrock-pricing))

**Gleiche Claude-Preise wie oben.**

**Bedrock-Sparoptionen, die Vercel AI nicht hat:**
- **Batch Mode: 50% Rabatt** auf Token-Preise (bei asynchronen Workloads, 24h Turnaround)
- **Flex Tier: 50% Rabatt** durch normale APIs bei höherer Latenz-Toleranz (seit Ende 2025)
- **Prompt Caching: bis zu 90% Rabatt** auf Cache-Read-Tokens (1.25x Write, 0.1x Read bei 5min-TTL)
- **Intelligent Prompt Routing:** $1/1000 Requests, routet automatisch zwischen Haiku und Sonnet — spart bis zu 30% bei Mixed-Workloads
- **Provisioned Throughput:** Ab ~$40/Tag Token-Volumen rechnerisch günstiger

**Bedrock-Zusatzkosten:**
- OpenSearch Serverless (falls RAG über Bedrock Knowledge Bases): **Minimum $345/month**. Nicht relevant für lokri, da lokri eigenen pgvector-Stack hat.
- Bedrock Agents: 5-10x Token-Multiplikator bei Multi-Step-Agents. Nicht relevant für lokri, da lokri eigene Orchestrierung macht.
- Guardrails, Logging, CloudWatch: ~$20-50/month zusätzlich

### Kosten pro Szenario

Annahme: 80% Haiku, 20% Sonnet. Input/Output-Ratio 4:1.

**Beispielrechnung Szenario B (500M Tokens/month):**

| Modell-Split | Input-Kosten | Output-Kosten | Summe |
|---|---|---|---|
| Haiku (400M: 320M in, 80M out) | $256 | $320 | $576 |
| Sonnet (100M: 80M in, 20M out) | $240 | $300 | $540 |
| | | | **$1.116** |

Das ist **identisch** bei Vercel AI und Bedrock.

**Aber bei Bedrock mit Optimierung:**

- 40% der Haiku-Tokens als Batch (async Connector-Indexing, Background-Jobs): -20% Gesamt
- 30% Cache-Hits durch wiederholten System-Prompt-Kontext: -15% Gesamt
- Intelligent Prompt Routing: -10% Gesamt

**Realistisch 30-40% Ersparnis bei Bedrock** → **~$700-800** für Szenario B.

| | Vercel AI | Bedrock (optimiert) |
|---|---|---|
| A (Early, 10M Tokens) | ~$22 | ~$15 |
| B (Growth, 500M Tokens) | ~$1.116 | ~$750 |
| C (Scale, 5 Mrd. Tokens) | ~$11.200 | ~$6.700 |

**Bedrock ist ab Szenario B signifikant günstiger — wenn du die Optimierungen nutzt.** Ohne Optimierung Gleichstand.

Quelle: [cloudburn.io Bedrock Pricing](https://cloudburn.io/blog/amazon-bedrock-pricing), [pecollective.com](https://pecollective.com/tools/aws-bedrock-pricing/)

---

## 4. Gesamtvergleich nach Szenario

### Szenario A (Early, 50k Requests/month)

| Stack | Hosting | DB | AI | Gesamt/Monat |
|---|---|---|---|---|
| **Vercel + Neon + Vercel AI** | $25 | $23 | $22 | **~$70** |
| **AWS EC2 + Neon + Bedrock** | $70 | $23 | $15 | **~$108** |
| **AWS EC2 + Aurora + Bedrock** | $70 | $69 | $15 | **~$154** |
| **AWS Fargate + Aurora + Bedrock** | $126 | $69 | $15 | **~$210** |
| **Hetzner + Neon + Bedrock** | $17 | $23 | $15 | **~$55** |

**Winner Szenario A: Vercel-Stack oder Hetzner.** AWS hat hier noch keinen Vorteil.

### Szenario B (Growth, 2M Requests/month)

| Stack | Hosting | DB | AI | Gesamt/Monat |
|---|---|---|---|---|
| **Vercel + Neon + Vercel AI** | $100 | $123 | $1.116 | **~$1.340** |
| **AWS EC2 + Neon + Bedrock** | $212 | $123 | $750 | **~$1.085** |
| **AWS EC2 + Aurora + Bedrock** | $212 | $162 | $750 | **~$1.124** |
| **AWS Fargate + Aurora + Bedrock** | $324 | $162 | $750 | **~$1.236** |
| **Hetzner + Neon + Bedrock** | $40 | $123 | $750 | **~$915** |

**Winner Szenario B: AWS EC2 + Neon + Bedrock** (wenn Bedrock-Optimierung greift) oder Hetzner wenn Single-Box-Betrieb akzeptabel.

### Szenario C (Scale, 20M Requests/month)

| Stack | Hosting | DB | AI | Gesamt/Monat |
|---|---|---|---|---|
| **Vercel + Neon + Vercel AI** | $1.200 | $990 | $11.200 | **~$13.400** |
| **AWS EC2 + Neon + Bedrock** | $790 | $990 | $6.700 | **~$8.500** |
| **AWS EC2 + Aurora + Bedrock** | $790 | $693 | $6.700 | **~$8.180** |
| **AWS Fargate + Aurora + Bedrock** | $1.035 | $693 | $6.700 | **~$8.430** |

**Winner Szenario C: AWS EC2 + Aurora + Bedrock.** Bei diesem Volumen ist AWS 35-40% günstiger als Vercel-Stack.

---

## 5. Nicht-monetäre Faktoren

### Pro AWS-Migration

**Kontrolle:** Du hast AWS-Erfahrung (Empro-Codebase, CDK, Lambda, DynamoDB). Der Stack ist dir vertraut.

**Skalierbarkeit:** Echte Auto-Scaling-Groups, Multi-AZ, Multi-Region sind AWS-native. Vercel hat das auch, aber abstrahiert und teurer.

**Enterprise-Vertrauen:** Viele Zielgruppen (Banken, Behörden) vertrauen AWS mehr als Vercel. Für lokri als DSGVO-Pitch: **AWS Frankfurt + EU-only Bedrock-Routing** ist ein Marketing-Argument.

**Spätere Möglichkeiten:**
- Bedrock Knowledge Bases falls irgendwann vom pgvector-Ansatz abgewichen wird
- Bedrock Guardrails für Content-Safety
- Bedrock Agents als Alternative zum eigenen MCP-Framework (unwahrscheinlich, aber offen)
- Integration mit Empro-Infrastructure (wenn relevant)

**Cost-Predictability:** Bei Szenario B+C hat AWS vorhersehbarere Kosten (kein Bandwidth-Cliff wie Vercel).

### Contra AWS-Migration

**Initial-Aufwand:** CDK-Stack, GitHub-Actions-Pipeline, Deployment-Automation. 40-80 Stunden für initial Setup, danach Wartung.

**Mehr Moving Parts:** Du baust implizit eine DevOps-Rolle auf. Vercel nimmt dir das komplett ab.

**Vercel AI Gateway hat Features, die Bedrock nicht hat:**
- Model-Fallback bei Provider-Ausfällen
- Einheitliche API über Anthropic + OpenAI + Google
- Observability out-of-the-box

Bei Bedrock bist du auf Claude-only angewiesen (plus Nova, Llama). Kein direkter GPT-Zugriff via Bedrock.

**Vercel-spezifische Features aufgeben:**
- Preview-Deployments (nachbaubar, aber Arbeit)
- Edge-Middleware (nicht relevant für lokri?)
- Speed Insights, Analytics

**Lock-in-Shift:** Statt Vercel-Lock-in jetzt AWS-Lock-in. Wobei AWS portabler ist (Docker + Terraform ≈ überall deploybar).

### Risiken der AWS-Migration

1. **Performance-Regressionen bei DB-Migration** falls Neon → Aurora. Andere Query-Plans, anderes Connection-Pooling-Verhalten.
2. **Bedrock-Features, die Vercel AI hat, müssen nachgebaut werden** (z.B. Streaming-Normalisierung, Multi-Provider-Failover).
3. **Bedrock-Region-Verfügbarkeit:** Claude Opus 4.7 ist je nach Region nicht überall verfügbar. EU-West-1 (Irland) ist guter Kompromiss für DSGVO.
4. **Cold-Starts** bei EC2-Autoscaling vs. Vercel-Fluid-Compute — UX-Unterschied messbar.

---

## 6. Empfehlung — timing-abhängig

### Heute (Szenario A): Nichts ändern

Vercel-Stack ist bei $70/Monat. Kein Grund für Migration. Migration würde 40-80 Stunden Arbeit kosten für 0€ monatlichen Vorteil. **Fokus bleibt Connector-Framework und Launch.**

### Bei Szenario-B-Trigger (signifikant zahlende Kunden)

**Entscheidungspunkt:** Wenn lokri >$500/Monat Infrastruktur-Kosten hat, Migration-Gespräch eröffnen.

**Empfohlenes Szenario-B-Target-Setup:**
- AWS EC2 (t4g.xlarge, 1-Year Savings Plan) + Docker + GitHub-Actions
- Neon bleibt (DB-Migration ist riskanter als Hosting-Migration)
- Vercel AI → Bedrock für Inferenz-Traffic (Anthropic Direct als Fallback)

Das reduziert Kosten um 20-40% bei moderater Migration-Arbeit. Aurora-Umzug **nicht** gleichzeitig machen — erst wenn Szenario C naht.

### Bei Szenario-C-Trigger

**Volle Migration:** EC2 mit Auto-Scaling, Aurora Serverless v2, Bedrock mit Batch+Caching+Routing-Optimierung. 35-40% Kostenersparnis gegenüber Vercel-Äquivalent.

### Kompromiss-Strategie: Hybrid

**Option:** Behalte Vercel für die UI-Seite, migriere nur den MCP-Endpoint + Connector-Runtime auf AWS. Erlaubt:
- Vercel-UX-Vorteile weiter nutzen
- Hohe LLM-Token-Volumen über Bedrock billig abwickeln
- Schrittweise Migration statt Big-Bang

Nachteil: Zwei Stacks, doppelte Ops-Last. Nur bei speziellen Constraints sinnvoll.

---

## 7. Konkreter Fahrplan, wenn Migration kommt

**Phase 1 (1-2 Wochen):** Bedrock-Integration testen
- Parallel zum aktuellen Vercel AI Gateway laufen lassen
- Vergleich: Latenz, Stabilität, Kosten für echte lokri-Traffic-Muster
- Bei Erfolg: Umschalten, Vercel AI als Fallback

**Phase 2 (2-4 Wochen):** EC2-Deployment aufsetzen
- CDK-Stack bauen (ALB + ECS/EC2 + CloudWatch + Route53)
- GitHub-Actions-Pipeline (Docker-Build + Push zu ECR + ECS-Deploy)
- Blue-Green-Deployment etablieren
- DNS-Cutover von Vercel

**Phase 3 (optional, später):** Aurora-Migration
- Nur wenn Neon-Kosten Szenario C erreichen
- pgdump + Aurora-Import, Cutover-Fenster
- pgvector-Extension in Aurora aktivieren

---

## 8. Empfehlung in einem Satz

**Heute:** Bei Vercel + Neon + Vercel AI bleiben.

**Ab ~$1.000/month Infrastruktur-Kosten:** Bedrock-Integration als erstes, dann EC2-Migration. Neon behalten.

**Ab ~$5.000/month:** Voll-AWS-Stack mit Aurora.

**Nicht tun:** Migration heute mit Spekulation auf Szenario C. Premature Optimization gilt auch für Infrastruktur.
