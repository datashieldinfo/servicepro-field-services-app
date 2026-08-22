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
- `contracts` — `plan_type` (monthly/quarterly/biannual/annual), `visits_included`, `visits_used`, `price_jod`, `start_date`, `end_date`, `auto_renew`, `status` (new/active/expired/cancelled/pending), `contract_number`, `filter_category`

**Contracts, devices and stock (20260802):**
- `contract_devices` — which registered devices a contract covers, and the filter class fitted to each
- `branches` — stock locations (store/van/workshop), one `is_default`
- `inventory_transactions` — the stock ledger; `inventory_branch_stock` is the per-branch view over it
- `customer_devices.usage_type` / `inventory.usage_type` — home or industrial use

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

- **DB:** `contracts` (migration `20260529000003_four_features.sql`), extended by
  `20260802000001_contract_devices_and_usage_type.sql` with `contract_number` (`CT-YYYY-NNN` from
  `next_contract_number()`, existing rows backfilled), `filter_category` (home/industrial), the
  `new` status, and the `contract_devices` join table (contract ↔ `customer_devices`, each link
  carrying its own `filter_category`).
- **`ContractModal`** — the single create/edit form, used by Manager and Admin. Picking the customer
  loads their registered devices; all are ticked by default at the class each device was registered
  with, and the contract's own class follows them until it is set by hand. The status list is only
  offered once a customer has contract history — a first contract is `new` and never typed.
  Saving generates the number, syncs `contract_devices`, and opens the printable copy.
- **`PrintableContract`** — the signable document: both parties, what was agreed, the devices covered
  with their filter class, the terms, and two signature blocks. Print via `window.print()`
  (`data-print-overlay`, rendered into `<body>`), plus WhatsApp and email share.
- **`src/lib/contractTerms.ts`** — the Jordanian terms and conditions (Civil Code No. 43/1976,
  Consumer Protection Law No. 7/2017, Electronic Transactions Law No. 15/2015; Amman jurisdiction;
  the Arabic text governs). **A template, not legal advice** — have counsel read it, then bump
  `TERMS_VERSION`, which is printed on every copy.
- **UI — Manager:** contracts tab lists number, plan, filter class and health, with print and edit
  actions on each row.
- **UI — Owner:** KPI cards for contract MRR (calculated from `price_jod` × frequency) and renewal rate (% of contracts with `auto_renew = true`).
- **UI — Customer:** Fetches own active contract and displays plan type, visits used/included, expiry date.

### Customer devices

- **DB:** `customer_devices` (migration `20260529000003_four_features.sql`), plus `usage_type`
  (home/industrial) from `20260802000001`. `inventory` carries the same column so a priced device
  model states what it is for.
- **`DeviceCatalogue`** — the devices screen, in Manager and Admin: grouped by usage type, then by
  model, each group expanding to the customers who have that model (with serial, install date and
  warranty). Catalogue models with nothing installed are listed too, priced from `inventory`.
  Search covers model, customer and serial number.
- **`DeviceModal`** — registers and edits a device, including its usage type.
- **UI — Admin:** also a "Devices" button per customer row, listing that customer's devices.
- **UI — Customer:** Fetches and displays own registered devices in dashboard.

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

### Portal access, one-time login link + first-login password change

- **DB:** `20260728150000_portal_access_and_first_login.sql` adds `customers.portal_access`
  (checkbox at registration) and `profiles.must_change_password`.
- A login is created **only** when portal access is ticked (which requires an email); an email alone
  no longer creates an account.
- `create-user` returns `login_link` — a one-time magic link from `auth.admin.generateLink` — and sets
  `must_change_password` on both the auth user and the profile. `AddCustomerModal` shows the link with
  copy / WhatsApp / email share, and keeps the generated temporary password as the fallback for when
  the link expires.
- **`ChangePasswordGate`** is rendered by `ProtectedRoute` whenever `profile.must_change_password` is
  true, so every dashboard is blocked until the user picks their own password.

### Post-creation actions (offer / installation / visit)

The success screen of `AddCustomerModal` offers three next steps, all reusable elsewhere:

- **`QuotationModal`** — price offer. Lines are quoted from `inventory` (now carrying `category`:
  part/device/accessory/service, with the device models seeded and priced) or typed by hand. Saves to
  `quotations` with a `QT-YYYY-NNN` number from the `next_quote_number()` DB helper, then shares over
  WhatsApp or email and records `sent_at`/`sent_channel`. Accepting converts to an installation.
- **`NewInstallationModal`** — registers one or more `customer_devices` rows (brand, model, serial,
  location, warranty months) **and** books the `installation` visit in a single save, linking the
  visit to the first device and updating the customer's install/warranty dates. When it came from an
  offer, the quotation is marked accepted with `converted_appointment_id`.
- **`ScheduleVisitModal`** — the general scheduler for every other visit type.

### Stock: branches, movements and the item card

- **DB:** `20260802000002_inventory_branches_and_transactions.sql` adds `branches` (seeded with a
  main store, `is_default` guarded to exactly one row) and `inventory_transactions` — the ledger:
  direction (in/out), reason, branch, quantity, `counterparty` (supplier it came from or technician
  it went to), reference, batch, expiry, `performed_by` and note. Existing stock is carried in as an
  `opening` row so ledger and counter agree from day one.
- **`inventory_branch_stock`** — a `security_invoker` view: quantity, last fill and nearest expiry
  per item per branch, derived from the ledger.
- **`inventory.quantity` cannot drift.** A movement recomputes it; a quantity typed straight into
  the old inventory screen writes its own `adjustment` movement, so every number on the card is
  explained by a row underneath it.
- **`src/lib/inventoryLedger.ts`** — `fetchBranches`, `fetchBranchStock`, `fetchItemLedger`,
  `recordMovement`, `summariseLedger` (totals in/out, last entry, last issue, nearest expiry),
  `branchLabel`.
- **`InventoryItemCard`** — opened from the inventory list in Manager and Admin: stock per branch,
  last fill (date, who booked it, who it came from), nearest expiry, low-stock and expiry warnings,
  the full movement history, and a form to book a movement.

### Multi-tenancy and module access (20260804)

**One deployment, many companies, and a permission matrix per person.**

- **DB:** `20260804000001_tenants_and_module_permissions.sql` adds `tenants`, the `modules`
  catalogue, `tenant_modules` (what a company bought), `permission_sets` +
  `permission_set_modules` (module × view/create/edit/delete), `profile_module_overrides`
  (one tick for one person), and on `profiles`: `tenant_id`, `permission_set_id`,
  `is_platform_admin`, `active`. Every company-owned table gains `tenant_id`, backfilled to the
  founding tenant, and a BEFORE INSERT trigger fills it from the writer — **no screen passes
  tenant_id**, which is what stops leaks.
- **`20260804000002_tenant_scoped_rls.sql` rewrites every policy.** It must replace rather than
  add: policies are OR-ed, and the database previously carried several `USING (true)` policies
  (customers, appointments, invoices read; invoices update; job_tasks; notifications) that let any
  signed-in account — including a customer portal login — read the whole book. Those are gone.
- **Three layers, each only able to narrow:** `tenant_modules` → `permission_sets` →
  `profile_module_overrides`. Resolved in `can_module(module, action)`; `my_permissions()` returns
  the whole answer for the client in one call.
- **`writes_own_only()`** backs the technician default: a set flagged `own_records_only` may only
  write rows that are its own work (their appointments and the job rows under them).
- **A platform admin** (`is_platform_admin`) is above every tenant and is the only account not
  scoped. `seed_tenant_defaults()` copies the five standard sets to a new company.
- **UI:** `src/lib/permissions.ts` + `AuthContext` expose `tenant`, `permissions`, `isPlatformAdmin`
  and `can(module, action)`. `PlatformAdminPage` (`/platform`) creates companies, switches their
  modules and suspends them. `AccessControlPage` (`/access`) edits permission sets, assigns them to
  people, and sets per-person exceptions (allow / follow the set / deny).
- **Hiding a button is courtesy, not security** — every rule is enforced by RLS as well.

### The superadmin, and viewing the app as someone else (20260805)

- **DB:** `20260805000001_platform_admin_and_impersonation.sql`. `platform_admin_emails` names the
  account (`datashield.info@gmail.com`); a BEFORE INSERT trigger on `profiles` re-applies the flag if
  that user is ever recreated, so it cannot be lost by deleting and re-inviting.
- **`acting_uid()` replaces `auth.uid()` wherever access is decided** — `current_tenant_id()`,
  `is_platform_admin()`, `can_module()`, `my_customer_ids()`, `writes_own_only()`, and every policy
  that asks "is this row mine?". That is what makes impersonation real: the rows returned are the
  rows that user would have received, not a repainted screen.
- **`is_platform_admin()` answers false while impersonating.** The superadmin genuinely loses their
  own reach for the duration — that is the point, and it is why `/platform` and `/access` bounce them
  to the target's dashboard mid-session. `is_real_platform_admin()` is the one that stays true, and
  it guards the impersonation controls themselves.
- **Guard rails:** read-only by default (a RESTRICTIVE policy per table refuses every write unless
  the session was started with `allow_changes`), expires after 60 minutes on its own, a platform
  admin can never be impersonated, and `impersonation_log` records who, whom, why and when.
  `guard_privileged_profile_columns()` stops anyone writing `is_platform_admin` or the impersonation
  columns directly — only `start_impersonation()` / `stop_impersonation()` do, and they check first.
  Stopping is keyed on the real `auth.uid()` and is SECURITY DEFINER, so the way back is never
  blocked by the restrictions being imposed.
- **`src/lib/impersonation.ts`** — start/stop/read the state, `platform_directory()` (everyone with
  their email, superadmin only) and `impersonation_history()`.
- **`AuthContext`** exposes `realProfile` (the account) alongside `profile` (whoever it is acting
  as), plus `impersonation`, `viewAs()`, `stopViewingAs()` and `isSuperadmin`.
- **`ImpersonationBanner`** renders above every page, with the countdown and two ways back.
- **UI:** `/platform` gained a people list per company (name, role, email) with **View as**, a link
  to that company's access screen, the allow-changes switch and the audit log. `/access` gained a
  **company picker** for the superadmin (`?tenant=<id>`) — without it, an unscoped list showed every
  company's people in one pile — and a View-as action per person.

### Adding people to a company (20260818)

- **The tenant must be carried explicitly through `create-user`.** The edge function runs as the
  service role, which belongs to no company; `set_tenant_id` copies the *writer's* tenant, and for
  the service role that is nobody. Every account and customer it created would have landed with
  `tenant_id` NULL — invisible to the office that created it, and shown an empty app on sign-in.
  `targetTenant` is taken from the caller (or named by a platform admin) and written onto the
  profile, the customers row and the portal login.
- **Who may create whom.** The function's own check admits every owner, manager and office admin,
  which is right for hiring a technician and wrong for minting an owner. `mayCreate` limits each
  role to at or below its own level; a platform admin is exempt.
- **`AddStaffModal`** replaces the technician-only form: any role the caller is allowed to create,
  with the permission set chosen at creation (defaulting to the company's standard set for that
  role) and the credentials shown once. Used by `AccessControlPage` and `AdminDashboard`.
- **`/platform` moves people between companies** — the permission set moves with them, because a set
  belongs to one company. Anyone with no company at all is listed first, in amber, to be adopted.

### Managing people who already exist (20260822)

- **`manage-user` edge function** — edit, disable, re-enable, reset password, delete. Creating a
  login needs the service role and so does taking one away: the browser can flip a column, but only
  the service role bans an account or removes it from `auth.users`.
- **Every guard is in the function, not the screen.** The caller's `team` edit right is asked as
  *them* (`can_module`, so their set and personal exceptions both count); the target must be in the
  caller's own company; a platform account cannot be touched from a company screen; each role may
  only act on roles at or below its own; nobody may disable, delete or re-role themselves.
- **`hasLogin`** — not every profile has an `auth.users` row behind it (old seed rows, customers
  registered without portal access). Without checking, the auth API answers "User not found", which
  explains nothing. Disable then flips `active` alone, delete removes the profile row directly, and
  a password reset says plainly that there is no login to change.
- **Disable is the normal action, delete is the exception.** Disabling bans the login and clears
  `active`, so `can_module()` refuses them everywhere and they cannot sign in — while their history
  keeps its author. Delete is refused for an account with visits, invoices or a customer record
  against it, and the screen says how many rather than failing on a foreign key.
- **`EditStaffModal`** is where all of it lives, opened from the people list on `/access`;
  `src/lib/staffAdmin.ts` is the single client path to the function.

### Who is calling — phone lookup + phone contacts

The office answers on the landline and technicians answer on their own mobiles,
so the caller has to be recognisable on both.

- **DB:** `20260803000001_customer_phone_lookup.sql` adds generated, indexed
  `customers.phone_key` and `contact_phone_key`. The rule: digits only → drop
  `00962`/`962` → drop leading zeros → last 9. Dropping the country code *before*
  the zeros is what makes landlines work — `+962 6 551 2345` and `06 551 2345`
  are one line, but their last nine digits differ.
- **`src/lib/phoneLookup.ts`** — `phoneKey()` **must stay identical to the SQL**
  or nothing matches; plus `findCustomersByPhone()` (matches the customer's own
  number or their contact person's) and `formatPhone()`.
- **`LookupPage`** (`/lookup`) — reached three ways, all ending at the 360
  record: `?c=<id>` from a saved phone contact, `?phone=…` from the phone system
  or a paste, or typing digits. One match opens straight away, several show a
  shortlist with status badges, none offers to register the caller with the
  number already filled in (`AddCustomerModal presetPhone`). Open to every
  office role via `ProtectedRoute allowedRoles`, and reachable from the phone
  button in `Navbar`.
- **`src/lib/vcard.ts`** — the mirror of the `.vcf` importer: `buildVCard()`,
  `buildVCardBook()`, `saveToPhoneContacts()` (Web Share first, download
  otherwise), `downloadVCardBook()`. Cards are vCard 3.0 with CRLF, names
  prefixed `ServisGo —`, and the 360 link in `URL` — so a saved contact shows
  the customer's name when they ring and is one tap from their record.
- Saving one customer is an action in `CustomerNextStep` (so it appears on every
  screen that lists customers); the whole book exports from the Manager and
  Admin customer tabs.
- **Not possible from the PWA:** opening a page by itself when the phone rings —
  no browser exposes call state. The automatic version needs the office line to
  pass through a PBX that can call a webhook (planned next), or a native Android
  app. iOS gives apps no access to the incoming number at all.

### Customer status

- **`customerStatus()`** in `src/lib/statusMeta.ts` derives where a customer stands from their
  traces: `underContract`, `contractExpiring`, `contractExpired`, `offerSent`, `scheduled`,
  `served`, `dormant` (nothing for a year) or `new`. First match wins, top to bottom.
- **`loadCustomerActionState()`** returns those statuses alongside the "awaiting action" set and the
  open offers, in the same round trip, so a customer list can badge every row.
- **`CustomerStatusBadge`** renders it; Manager and Admin customer lists show it, and so does the
  header of `Customer360Panel`.
- Customer lists are ordered newest-registration-first, and office appointment lists newest-visit-
  first. The technician's day view stays in chronological order — that is the order they work in.
- `Customer360Panel` also shows the **last price offer** the customer received (number, date, total,
  status, lines) with a button to reopen the printable offer, via `loadLatestOffer()`.

### Installable app (Android / iOS / Windows / macOS)

There is no native build and no app-store listing — the same deployed web app installs itself on
every platform as a PWA, so one URL covers phones, tablets and desktops.

- **`public/manifest.webmanifest`** — name, `standalone` display, navy theme, and the icon set.
  Linked from `index.html` alongside the Apple meta tags iOS needs (`apple-touch-icon`,
  `apple-mobile-web-app-*`).
- **`public/sw.js`** — the service worker that makes the app installable and keeps the shell
  openable without signal: network-first for page loads (falling back to the cached shell and then
  `public/offline.html`), cache-first for hashed `/assets/*` and Google Fonts, and **nothing from
  Supabase is ever cached**. Bump `CACHE_VERSION` when the rules change; stale caches are dropped on
  activate.
- **`public/_headers`** — Netlify caching: `sw.js`, `manifest.webmanifest` and `index.html` must
  revalidate, hashed assets are immutable.
- **`public/icons/*.png`** — committed app icons (192/512, plus maskable and Apple variants),
  regenerated with `python3 scripts/generate-icons.py` (needs Pillow) when the brand mark changes.
- **`src/lib/pwa.ts`** — `initPwa()` (called once from `main.tsx`) registers the worker in
  production only and captures Chromium's `beforeinstallprompt`, which fires long before the user
  reaches the install screen. Also `detectPlatform()`, `detectBrowser()`, `isStandalone()`,
  `canInstallDirectly()`, `promptInstall()`, `onInstallStateChange()`.
- **`GetAppPage`** (`/download`, with `/install` and `/app` redirecting to it) — public page: a
  one-tap install button where the browser supports it, per-platform steps otherwise (the detected
  device's card first), and copy / WhatsApp / email sharing of the install link for technicians and
  customers. Reached from the login page and from the `Navbar` download button, both hidden once the
  app already runs standalone.
- iOS never exposes `beforeinstallprompt`: on iPhone/iPad the page tells the user to open it in
  Safari and use Share → Add to Home Screen.

### Internationalization

- `src/i18n/index.ts` initialises i18next with `ar` (default) and `en` locales from `src/locales/`.
- Language preference is persisted to `localStorage` under key `servisgo-lang`.
- Changing language also flips `document.documentElement.dir` between `rtl` and `ltr`.
- Always use `useTranslation()` and `t('key')` for UI strings. Never hardcode Arabic or English text in JSX.
- Use Tailwind's logical properties (`start`, `end`, `ps-*`, `pe-*`, `ms-*`, `me-*`) instead of `left`/`right` so RTL layout is automatic.

### Shared libraries

One definition each — these were previously copied between dashboards and drifted apart.

- **`src/lib/format.ts`** — `fmtDate` / `fmtDateTime` / `fmtLongDate` / `fmtTime`, `timeAgo` (returns
  the i18n key + count so the caller renders it), `phoneDigits`, `whatsAppLink`, `shareOnWhatsApp`,
  `mailtoLink`, `downloadCsv`.
- **`src/lib/operations.ts`** — the writes more than one dashboard makes: `setInventoryQuantity`,
  `markInvoicePaid`, `dismissServiceRequest`, `confirmAppointment`. Each returns Supabase's
  `{ error }` so the caller keeps its own toast and local state update.
- **`src/lib/invoiceRows.ts`** — `INVOICE_SELECT`, `fetchInvoices`, `invoiceEmbeds`, `toInvoiceData`,
  `one()` (flattens a PostgREST embed), `startOfMonth`.
- **`src/lib/customerActionState.ts`** — which customers have no visit and no offer, and each one's
  open offer.
- **`src/lib/deviceFields.ts`** — `DEVICE_BRANDS`, `WARRANTY_MONTHS`, `DeviceRecord`.
- **`src/lib/language.ts`** — `toggleLanguage()`.
- **`src/lib/pwa.ts`** — installing the app on a device: service-worker registration, the captured
  install prompt, and platform/browser detection.
- **`src/lib/portalAccess.ts`** — `issuePortalAccess()`; grants 360 access or re-issues a lost
  one-time login link via the `create-user` edge function's `invite` mode.

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
- `Logo` — custom SVG shield with wrench/gear.
- `PrintableInvoice` — bilingual printable invoice overlay (print + WhatsApp share).
- `GetAppPage` — the public install page at `/download` (see "Installable app").
- `CustomerNextStep` — the post-registration "what's next?" actions (offer / installation / visit /
  offer decision / offer print / portal access), as a row dropdown or a card list.
- `DeviceModal` — one form for registering and editing a `customer_devices` row.
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
- **Real-time subscriptions** — not implemented; dashboards fetch on mount only.
- **Revenue chart** (`OwnerDashboard`) — hardcoded static array; `ReportsPage` is now DB-connected.
- **WhatsApp number** — hardcoded to `0778068705` in `PrintableInvoice.tsx`; should be configurable. Emergency WhatsApp link in `CustomerDashboard` hardcoded to `+962791234567`.
- **Contract terms** — `src/lib/contractTerms.ts` is a template drafted against Jordanian law; it needs a lawyer's review before the first signed contract, after which `TERMS_VERSION` should be bumped.
- **Contract signature capture** — the printed copy has signature blocks, but a signed contract is not recorded back onto the row (no `signed_at`).
- **Customer edit UI** — the new structured fields can be created and imported, but there is no edit screen for an existing customer yet (`AddCustomerModal` is create-only).
- **`.xlsx` import** — only CSV is parsed (no spreadsheet dependency); `.xlsx` uploads are rejected with a "save as CSV" message.
- **Contact Picker import** — implemented behind feature detection; only Android Chrome-family browsers expose `navigator.contacts` today.
- **Payment/invoicing for admin-created jobs** — invoice creation is only triggered from the Technician dashboard job completion flow.
- **`get_my_role()` helper function** — referenced in `invoices` RLS policies; must exist in the DB (not in any migration file in this repo — likely created outside or in a missing migration).
- **`inventory_part_name_unique` index conflict** — migration `20260529000002` uses `ON CONFLICT DO NOTHING` (no unique index); migration `20260529000003` creates `CREATE UNIQUE INDEX inventory_part_name_unique` and uses `ON CONFLICT (part_name) DO UPDATE`. If both migrations ran, the index creation in `_000003` may fail if `_000002` left duplicate `part_name` rows. The deduplication SQL (DELETE duplicates then CREATE UNIQUE INDEX) must be run before applying `_000003`.
- **Feature 2 missing** — `20260529000003_four_features.sql` implements Features 1, 3, and 4 but contains no Feature 2 section; its scope is unknown.
