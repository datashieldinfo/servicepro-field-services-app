# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (http://localhost:5173)
npm run build      # TypeScript compile + Vite production build
npm run typecheck  # Type-check only (no emit), uses tsconfig.app.json
npm run lint       # ESLint across all files
npm run preview    # Preview production build locally
```

There are no tests. There is no test runner configured.

## Architecture

**ServisGo / BioFamily Jordan** is a field-service management SPA (water filter maintenance) with five distinct user roles, each with its own dashboard.

### Role → Route mapping

| Role | Route | File |
|---|---|---|
| `owner` | `/dashboard/owner` | `OwnerDashboard.tsx` |
| `technician` | `/dashboard/technician` | `TechnicianDashboard.tsx` |
| `admin` | `/dashboard/admin` | `AdminDashboard.tsx` |
| `manager` | `/dashboard/manager` | `ManagerDashboard.tsx` |
| `customer` | `/dashboard/customer` | `CustomerDashboard.tsx` |

`App.tsx` wraps everything in `<AuthProvider>` → `<ToastProvider>`. The `<RootRedirect>` component reads `profile.role` from `AuthContext` and redirects to the correct dashboard. `<ProtectedRoute allowedRole="…">` enforces role gating on every dashboard route.

### Auth & Supabase

- `src/lib/supabase.ts` — single `createClient` export; credentials come from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`.
- `src/contexts/AuthContext.tsx` — listens to `supabase.auth.onAuthStateChange`, fetches the `profiles` row, exposes `{ user, session, profile, loading, signOut, refreshProfile }`.
- A Postgres trigger (`handle_new_user`) auto-creates a `profiles` row on signup, reading `full_name` and `role` from `raw_user_meta_data`.
- Demo login: `LoginPage` calls `signInWithPassword`; on failure it falls back to `signUp` and upserts the profile. All demo accounts use password `demo1234`.

### Database schema (Supabase / all tables have RLS)

**Core (Phase 1):**
- `profiles` — auth users with `role` (owner/admin/technician/customer)
- `customers` — customer records with `user_id` FK to profiles, `contract_type`, `warranty_expires`, `device_install_date`, `address`
- `appointments` — jobs with `technician_id`, `status` (pending/in_progress/awaiting_approval/completed/cancelled), `approval_notes`, `approval_granted`, `tds_before`, `tds_after`, `followup_recommended`, `followup_days`, `followup_reason`, `confirmed`
- `inventory` — parts with `cost_price`, `selling_price`, `replacement_interval_months`; unique index on `part_name`
- `activity_log`

**Phase 3:**
- `job_tasks` — checklist items per appointment
- `job_parts` — inventory items consumed per job
- `job_photos` — photo URLs per job (Storage not yet configured)
- `notifications` — user notifications (type: reminder/offer/alert)
- `filter_status` — per-customer filter health (`health_percent`, `next_due`, `last_replaced`, `filter_type`, `location`)

**Phase 4 — visit trigger system:**
- `service_requests` — trigger_type (schedule/part_due/complaint/followup/test_fail/warranty/emergency/unknown_history/customer_request), urgency, triggered_by, status (pending/scheduled/dismissed), `linked_appointment_id`, `suggested_date`
- `job_readings` — TDS readings per appointment (`tds_before`, `tds_after`)

**BioFamily / invoicing (20260529):**
- `invoices` — `invoice_number` (auto-generated INV-YYYY-NNN), `appointment_id`, `customer_id`, `technician_id`, `parts_used` (jsonb), `labor_cost`, `parts_cost`, `total_amount`, `payment_method` (cash/bank_transfer/cliq/other), `payment_status` (pending/paid/partial), `issued_at`, `paid_at`, `created_by`
- `customer_devices` — device registry per customer: `device_brand` (BioFamily 4-Stage/7-Stage/Ruhens Cooler/Family Cooler/Other), `device_model`, `serial_number`, `installation_date`, `warranty_expires`, `location_in_premises`
- `contracts` — `plan_type` (monthly/quarterly/biannual/annual), `visits_included`, `visits_used`, `price_jod`, `start_date`, `end_date`, `auto_renew`, `status` (active/expired/cancelled/pending)

Migrations live in `supabase/migrations/` in timestamp order. The `appointments` table has a `technician_id` FK to `profiles` (aliased in queries as `technician:profiles!appointments_technician_id_fkey`).

**Seeded BioFamily inventory parts** (10 items with cost/selling price): PP Sediment Filter 5um, Pre-Carbon Block Filter, Post-Carbon Filter, RO Membrane 75 GPD, Mineral Alkaline Filter, UV Sterilizer Lamp, Hygiene Guard Filter, O-Ring Kit, Food-Grade Silicone Grease, Booster Pump.

### Visit trigger system

- `service_requests` rows are created by: (1) DB trigger on `filter_status` changes (`check_filter_triggers()` SECURITY DEFINER function), (2) technician completing a job with TDS > 50 or recommending a followup, (3) customer submitting a request/complaint/emergency from CustomerDashboard.
- **Two-phase job flow**: `in_progress + !approval_granted` = Phase 1 assessment; approval request sets status `awaiting_approval`; customer accept → `in_progress + approval_granted=true` = Phase 2 work.
- Service report is printable — `@media print` hides everything except `#print-report-overlay`; `window.print()` triggered from button.
- TDS readings are stored both on `appointments.tds_before/tds_after` and in `job_readings` table.
- `check_filter_triggers()` fires AFTER INSERT OR UPDATE on `filter_status` FOR EACH STATEMENT; checks part_due (medium: next_due ≤ today+14; high: health < 25%), unknown_history (medium: no filter_status rows), warranty (medium: expires ≤ today+30). Deduplicates via recent pending check (7–30 day windows).

### Invoice system

- **DB:** `invoices` table (migration `20260529000001_create_invoices.sql`); uses helper `get_my_role()` in RLS policies.
- **UI — Technician:** After completing a job, a modal prompts to create an invoice. Auto-generates `invoice_number` (INV-YYYY-NNN, sequential per year). Saves to `invoices`, then opens `PrintableInvoice` overlay.
- **UI — Admin:** "Invoices" tab shows all invoices with CSV export, "Mark Paid" action, and "View Invoice" to reopen the printable overlay. Fetches customer name, technician name, and appointment details in a single joined query.
- **`PrintableInvoice.tsx`** — bilingual (AR/EN) invoice overlay. Print via `window.print()` (`@media print` hides everything except `#print-invoice-overlay`). WhatsApp share button encodes invoice summary and opens `wa.me`. **WhatsApp number is hardcoded to `0778068705`** — should be configurable.

### Contract management

- **DB:** `contracts` table (migration `20260529000003_four_features.sql`).
- **UI — Admin:** Fetches contracts per customer on demand (inline with customer row). Dashboard shows a banner when contracts are expiring within 30 days. No create/edit UI yet — read-only view only.
- **UI — Owner:** KPI cards for contract MRR (calculated from `price_jod` × frequency) and renewal rate (% of contracts with `auto_renew = true`).
- **UI — Customer:** Fetches own active contract and displays plan type, visits used/included, expiry date.

### Customer devices

- **DB:** `customer_devices` table (migration `20260529000003_four_features.sql`).
- **UI — Admin:** "Devices" button on each customer row opens a modal showing that customer's registered devices (brand, model, serial number, installation date, warranty expiry, location).
- **UI — Customer:** Fetches and displays own registered devices in dashboard.
- **No create/edit UI** for devices in any dashboard — admin can only view, not add or edit.

### Customer records (individual / corporate) + import

One shape, one table, one UI — every role that can add customers renders the same modal.

- **DB:** migration `20260728000001_customer_types_and_structured_address.sql` extends `customers` with
  `customer_type` (individual/corporate), `country_code`, structured address
  (`state`, `city`, `area`, `street`, `building_type` villa|building, `villa_name`/`villa_number`,
  `building_name`/`building_number`/`flat_number`), map pin (`latitude`, `longitude`, `location_label`),
  `notes`, `source` (manual/excel/vcf/contacts) and corporate fields (`company_name`, `trade_name`,
  `industry`, `commercial_reg_no`, `tax_number`, `branch_count`, `payment_terms`, `billing_email`,
  `contact_person_*`). `customers.address` still holds the composed one-line address for existing views.
- **`src/lib/customerFields.ts`** — `CustomerForm` shape, country dial codes, Jordan governorates/cities,
  Amman areas, corporate picklists, `composeAddress()`, `toCustomerRow()`, `validateCustomer()`.
- **`src/lib/customerService.ts`** — single write path. `createCustomer()` generates a temporary password
  (the UI no longer asks for one) and calls the `create-user` edge function when an email is given, then
  completes the `customers` row; with no email it writes the record only (no portal login).
  `createCustomersBulk()` inserts imported rows directly, isolating bad rows on batch failure.
- **`src/lib/geocoding.ts`** — OpenStreetMap/Nominatim place search + reverse geocoding,
  `navigator.geolocation`, and a paste-parser for coordinates / Google Maps links. No API key, fails soft.
- **`src/components/CustomerFields.tsx`** — the fieldset itself (record type → identity → contact →
  structured address → map pin → notes). Rendered by **both** `AddCustomerModal` and
  `CustomerFullEditPage`, so creating and editing a customer are the same form for every role.
- **`AddCustomerModal`** — record-type selector, mandatory phone with dial-code picklist, structured
  address, `LocationPicker` map pin. Phone + name (+ city) are the only required fields.
- **`CustomerFullEditPage`** — the same fieldset plus contract/warranty dates, devices, contracts and
  filter status; hydrates via `fromCustomerRow()` and saves via `toCustomerUpdate()` (which preserves
  `source`).
- **`ImportCustomersModal`** — CSV template download/parse, `.vcf` (vCard 2.1/3.0/4.0, incl.
  quoted-printable) parse, and the mobile Contact Picker API when the browser exposes it. Preview table
  allows per-row edit/exclude before import. `.xlsx` is **not** parsed — users are told to save as CSV.

### Visit workflow (typed visits — phase A)

- **DB:** migration `20260728120000_visit_types_and_confirmation.sql` extends `appointments` with
  `visit_type` (installation/preventive_maintenance/scheduled_visit/repair/emergency/survey),
  `device_id` → `customer_devices`, the confirmation gate (`confirmed_at`, `confirmed_by`,
  `confirmation_channel`), `created_by` and `next_visit_of`. A BEFORE UPDATE trigger
  (`sync_appointment_confirmation`) keeps the legacy `confirmed` boolean and `confirmed_at` in
  agreement whichever one a screen writes. Existing rows were backfilled from `service_type` text.
- **`src/lib/visitFields.ts`** — `VISIT_TYPES` (badge colours, whether the type needs or registers a
  device), confirmation channels, `VisitForm`, `toAppointmentRow()`, `validateVisit()`, and the
  next-visit interval defaults used later by the follow-up scheduler.
- **`ScheduleVisitModal`** — the single scheduler. Customer search (or preset), visit type, device
  picker scoped to that customer, technician with a ±2h double-booking check, address defaulted from
  the customer, notes, and the confirmation gate. Replaces the old inline form in `AdminDashboard`
  and is reused by `ManagerDashboard` and the post-creation step in `AddCustomerModal`.
- **`VisitTypeBadge`** — shared coloured badge, rendered in admin/manager/technician lists.
- `service_type` is still written (the visit type's English label) so older queries and search keep
  working; it is no longer typed by hand.

### Internationalization

- `src/i18n/index.ts` initialises i18next with `ar` (default) and `en` locales from `src/locales/`.
- Language preference is persisted to `localStorage` under key `servisgo-lang`.
- Changing language also flips `document.documentElement.dir` between `rtl` and `ltr`.
- Always use `useTranslation()` and `t('key')` for UI strings. Never hardcode Arabic or English text in JSX.
- Use Tailwind's logical properties (`start`, `end`, `ps-*`, `pe-*`, `ms-*`, `me-*`) instead of `left`/`right` so RTL layout is automatic.

### Styling conventions

- Tailwind CSS 3 with custom colors: `navy` (#1E3A8A), `gold` (#F59E0B) — see `tailwind.config.js`.
- Card pattern: `bg-white rounded-2xl shadow-sm border border-slate-100`.
- Mobile-first: Technician and Customer dashboards use a fixed bottom nav (`sm:hidden`) and `pb-20 sm:pb-8` body padding.
- Toast notifications via `useToast()` from `src/components/Toast.tsx` (context-based, global).

### Shared components

- `Navbar` — top bar with logo, search input (UI only), language toggle, notification bell, user avatar, logout.
- `NotificationDropdown` — hardcoded demo data, not DB-connected.
- `ProtectedRoute` — redirects to `/login` if unauthenticated or wrong role.
- `Toast` / `useToast` — `showToast(message, 'success' | 'error' | 'warning')`.
- `LoadingSkeleton` — animated placeholder.
- `Logo` — custom SVG shield with wrench/gear.
- `PrintableInvoice` — bilingual printable invoice overlay (print + WhatsApp share).
- `ErrorBoundary` — wraps the app for unhandled render errors.

### ReportsPage

Accessible from `OwnerDashboard`. DB-connected: queries `appointments` (status=completed) joined with `profiles`, `job_tasks`, `job_parts`. Renders per-technician bar chart (jobs, tasks done, parts used) and monthly job counts. Date range filter. Revenue chart on `OwnerDashboard` itself remains a hardcoded static array.

---

## What's built — summary by phase

| Phase | What | Status |
|---|---|---|
| 1 | Core tables, auth, four-role dashboards, seed data | ✅ Complete |
| 3 | Technician job flow (tasks, parts, photos UI), filter status, notifications | ✅ Complete (photos upload stub) |
| 4 | Visit trigger system, approval flow, TDS readings, service report print | ✅ Complete |
| — | Customer portal (user_id link, RLS, self-service requests) | ✅ Complete |
| — | ReportsPage (DB-connected, date filter, charts) | ✅ Complete |
| — | Invoice system (create, save, print, admin view, CSV export) | ✅ Complete |
| — | Customer devices (DB + view-only UI in admin + customer) | ✅ DB done, UI read-only |
| — | Contract management (DB + view-only UI in admin/owner/customer) | ✅ DB done, UI read-only |
| — | BioFamily inventory catalog (10 parts with prices + intervals) | ✅ Complete |

---

## Known stubs / incomplete features / pending tasks

- **Photo upload** — UI present in `TechnicianDashboard` job detail modal with an `AlertTriangle` warning; Supabase Storage buckets not configured.
- **Navbar search** — input rendered but has no filtering logic; AdminDashboard appointment/customer search inputs are wired.
- **Technician "Settings" tab** — renders only an icon and label, no content.
- **`TechnicianDashboard-1.tsx`** — duplicate/unused file; the active file is `TechnicianDashboard.tsx`.
- **Real-time subscriptions** — not implemented; dashboards fetch on mount only.
- **Revenue chart** (`OwnerDashboard`) — hardcoded static array; `ReportsPage` is now DB-connected.
- **WhatsApp number** — hardcoded to `0778068705` in `PrintableInvoice.tsx`; should be configurable. Emergency WhatsApp link in `CustomerDashboard` hardcoded to `+962791234567`.
- **Contract create/edit UI** — DB table exists; Admin/Owner/Customer can view contracts but no UI to create or edit them.
- **Customer devices create/edit UI** — DB table exists; Admin can view devices per customer but no UI to register or edit devices.
- **Customer edit UI** — the new structured fields can be created and imported, but there is no edit screen for an existing customer yet (`AddCustomerModal` is create-only).
- **`.xlsx` import** — only CSV is parsed (no spreadsheet dependency); `.xlsx` uploads are rejected with a "save as CSV" message.
- **Contact Picker import** — implemented behind feature detection; only Android Chrome-family browsers expose `navigator.contacts` today.
- **Payment/invoicing for admin-created jobs** — invoice creation is only triggered from the Technician dashboard job completion flow.
- **`get_my_role()` helper function** — referenced in `invoices` RLS policies; must exist in the DB (not in any migration file in this repo — likely created outside or in a missing migration).
- **`inventory_part_name_unique` index conflict** — migration `20260529000002` uses `ON CONFLICT DO NOTHING` (no unique index); migration `20260529000003` creates `CREATE UNIQUE INDEX inventory_part_name_unique` and uses `ON CONFLICT (part_name) DO UPDATE`. If both migrations ran, the index creation in `_000003` may fail if `_000002` left duplicate `part_name` rows. The deduplication SQL (DELETE duplicates then CREATE UNIQUE INDEX) must be run before applying `_000003`.
- **Feature 2 missing** — `20260529000003_four_features.sql` implements Features 1, 3, and 4 but contains no Feature 2 section; its scope is unknown.
