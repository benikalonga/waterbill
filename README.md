# WaterBill

**Billing, customer care and network operations for water utilities.**

WaterBill runs the whole life of a water account: sign-up, metering, tiered billing, mobile money payments,
collections, leak and fraud detection, field crews and the back office. Customers get a mobile-first portal,
field agents get a simple phone app, and the utility's staff get one operations console.

---

## What it does

### For customers (`/portal`)
- **Account at a glance:** amount due, recent usage, service notices.
- **Clear bills:** each cubic metre shown by price band, with VAT and fees itemised. Printable.
- **Pay online** with M-Pesa, Airtel Money, Orange Money, MTN MoMo or card, in full or in part. Overpayments become account credit that is applied to the next bill.
- **Usage history** by month, compared with the network average.
- **Personal usage limit,** with an alert when it is passed.
- **Send a meter reading** to avoid an estimated bill.
- **Payment plans:** spread a bill over 2 to 12 months, with no late fees while the plan is kept.
- **Possible-leak warnings** when consumption looks abnormal.
- **Report a leak,** with GPS location, and follow its status.
- **Outage notices** for planned works and emergencies, in the app and by SMS.
- **Support tickets** with a conversation thread and a rating. Disputing a bill pauses late fees on it.
- **Bill calculator** on the public home page, no account needed.

### For field agents (`/field`)
- Assigned jobs with accept, start and complete steps, directions and one-tap calling.
- A **reading route** listing the meters still to read this month.
- Report leaks and illegal connections on the spot, with GPS.
- Finishing a job updates the account, the leak and the stock automatically.

### For the utility (`/ops`)

| Area | What you can do |
|---|---|
| **Dashboard** | Collection rate, cash today, overdue debt, 6-month billing chart, and queues waiting for action |
| **Customers** | Create and search accounts, review self-registrations with a checklist, reset PINs |
| **Meters** | Mechanical, electronic and smart meters; review customer and suspicious readings |
| **Billing** | Monthly billing runs with actual, estimated and flat bills; adjustments; cancellations that protect money already paid |
| **Tariffs** | Price bands per customer class, validated so there are no gaps or overlaps |
| **Payments** | All channels, with counter payments for cash and bank transfers |
| **Collections** | Debt aging, largest debtors, payment plan approvals |
| **Support** | Tickets ordered by response deadline |
| **Alerts** | Automatic alerts from meters, with severity and workflow |
| **Network** | Map of stations, leaks and field agents; pipelines, zones, water quality |
| **Leaks & fraud** | Dispatch repair crews; manage illegal connection cases |
| **Work orders** | Create, assign and track all field work |
| **Outage notices** | Publish a notice and text every customer in the area |
| **Water balance** | Non-revenue water: produced against metered consumption |
| **HR & payroll** | Employees, payslips with approval, leave requests |
| **Inventory** | Stock levels, movements, low-stock alerts, parts used on jobs |
| **Administration** | Billing rules, nine staff roles, and an audit log of every sensitive action |

---

## How billing works

1. **Reading.** Smart meters post readings through a gateway, agents enter them on their route, and customers can send their own for review.
2. **Run.** A monthly run bills each active account once, from the previous closing index to the latest accepted reading.
3. **No reading?** The bill is estimated from the last three real bills. The next real reading corrects any difference automatically, because it bills from the estimated closing index.
4. **Price.** Usage is charged band by band, per litre, plus the class's fixed charge and VAT.
5. **Credit.** Any account credit is applied immediately.
6. **Overdue.** After the due date and grace period, a bill is marked overdue and takes a single late fee. Bills on a plan or in dispute are exempt.
7. **Disconnection.** Accounts seriously overdue get a notice and a field job. Clearing the debt queues a reconnection automatically; the reconnection fee goes on the next bill.

All of these periods and fees are editable under **Settings**. Money is stored as integer cents and volume as integer litres, so totals never drift through rounding.

### Automatic detection

Each accepted reading is checked against the meter's history:

| Signal | Rule |
|---|---|
| High or low consumption | More than 2.5 standard deviations from the meter's recent readings |
| Stopped meter | No change three readings in a row |
| Night flow | Smart meter flow between 01:00 and 05:00 on three or more nights |
| Reverse flow | Index lower than the last reading; held for review, not billed |
| Tampering | Reported by the meter; the meter is flagged |
| Offline or low battery | Silent for 48 hours, or battery under 15% |

---

## Security

- Customers can only reach their own data: every portal query is scoped to the signed-in account.
- Payment webhooks and meter gateways are authenticated with shared secrets. Payment callbacks are idempotent and reject amount mismatches.
- PINs and passwords are hashed with bcrypt; one-time codes and refresh tokens are stored only as hashes.
- Access tokens last 15 minutes; refresh tokens rotate and work once.
- PIN sign-in locks after five failures. Trivially guessable PINs are refused.
- One-time codes for self-registration go only to the customer's phone.
- Role checks run on every request against the live staff record, so deactivating someone takes effect at once.
- The API refuses to start without strong secrets.

---

## Tech stack

| Layer | Technology |
|---|---|
| Web | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Leaflet |
| API | Node.js 20, Express 4, TypeScript, Zod, Socket.IO, node-cron |
| Database | MySQL 8 with Prisma |
| SMS | Twilio (printed to the console in development) |
| Deployment | Docker Compose |

```
waterbill/
├── api/
│   ├── prisma/schema.prisma   Data model
│   └── src/
│       ├── domain/            Billing, payments, tariffs, reading analysis, notifications
│       ├── routes/            auth, public + integrations, portal, field, ops/*
│       ├── lib/               Config, auth, database, real-time, HTTP helpers
│       ├── jobs.ts            Overdue bills, reminders, plan defaults, meter health
│       └── seed.ts            Demo data
├── web/
│   ├── app/                   Public site, /portal, /field, /ops
│   ├── components/            UI kit, app shells, map
│   └── lib/                   API client, hooks, formatting, sockets
└── docs/API.md                Endpoint and event reference
```

---

## Run it locally

You need Node.js 20+ and MySQL 8.

```bash
npm install
cp api/.env.example api/.env        # set DATABASE_URL and the two JWT secrets
cp web/.env.example web/.env.local
npm run db:push
```

Load demo data, choosing your own test password and PIN:

```bash
SEED_STAFF_PASSWORD='YOUR_PASSWORD' SEED_CUSTOMER_PIN='YOUR_PIN' npm run db:seed
```

Then start each app in its own terminal:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open <http://localhost:3000>. The seed prints the demo logins:

- **Customer:** account `WB-DEMO0001` with your PIN.
- **Staff** (use the "Staff" tab): `your_admin_email@fakeemail.com`, `your_commercial_email@fakeemail.com`, `your_technical_email@fakeemail.com`, `your_billing_email@fakeemail.com`, `your_collections_email@fakeemail.com`, `your_audit_email@fakeemail.com`, or `your_agent_email@fakeemail.com` with your password. `agent@` opens the field app.

Outside production, SMS messages print in the API terminal and online payments are confirmed instantly, so every flow can be tried without outside accounts.

Run the billing unit tests with:

```bash
npm test
```

## Deploy

```bash
cp .env.example .env    # fill in every secret and your public URLs
docker compose up -d --build
```

Put a TLS reverse proxy in front of ports 3000 and 4000. The schema is applied when the API starts.
Create the first administrator:

```bash
docker compose exec api node dist/scripts/createAdmin.js YOUR_EMAIL@fakeemail.com 'YOUR_PASSWORD' "YOUR_NAME"
```

Then sign in and set up your **Tariffs** and branches and zones (under **Assets**) before the first billing run.

### Connecting real services

| Service | What to do |
|---|---|
| **Mobile money** | Have each operator call `POST /api/integrations/payments/<provider>` with `X-Webhook-Secret`. The call that asks the operator to charge the customer still has to be added for each operator you sign with. |
| **Smart meters** | Have your gateway post to `POST /api/integrations/meters/readings` with `X-Device-Key`. |
| **SMS** | Set the `TWILIO_*` variables. |

See [docs/API.md](docs/API.md) for the full reference.

---

## License

MIT. See [LICENSE](LICENSE).
