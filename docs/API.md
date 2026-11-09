# WaterBill API reference

Base path: `/api`. Requests and responses are JSON. Authenticated routes need `Authorization: Bearer <accessToken>`.
Errors look like `{ "error": "message" }`. Money is in integer cents and water volume in integer litres.
Lists accept `?page=&limit=` and return `{ items, total, page, pages }`.

## Authentication — `/auth`

| Method | Path | Notes |
|---|---|---|
| POST | `/customer/sign-in` | `{ accountNumber, pin }`. `pin` may be a one-time code. Locks for 15 minutes after 5 failures. |
| POST | `/customer/register` | Self-registration. The one-time code goes only by SMS. |
| POST | `/customer/forgot-pin` | `{ phone }`. Same response whether or not the number exists. |
| POST | `/customer/change-pin` | `{ newPin }` |
| GET | `/customer/me` | Current customer |
| POST | `/staff/sign-in` | `{ email, password }` |
| POST | `/staff/change-password` | `{ currentPassword, newPassword }` |
| GET | `/staff/me` | Current staff member |
| POST | `/refresh` | `{ refreshToken }`. Tokens rotate: each works once. |
| POST | `/sign-out` | `{ refreshToken }` |

## Public — `/public`

`GET /tariffs` · `POST /estimate` `{ tariffClass, m3 }` · `GET /outages`

## Customer portal — `/portal`

Everything is scoped to the signed-in customer.

| Area | Endpoints |
|---|---|
| Account | `GET /summary`, `PATCH /profile` |
| Bills | `GET /invoices`, `GET /invoices/:id` |
| Usage | `GET /usage`, `POST /readings` `{ totalLitres, photoUrl? }` |
| Payments | `GET /payments`, `POST /payments` `{ invoiceId?, amountCents, channel, payerPhone? }` |
| Payment plans | `GET /plans`, `POST /plans` `{ invoiceId, months, reason? }` |
| Support | `GET /tickets`, `POST /tickets`, `GET /tickets/:id`, `POST /tickets/:id/messages`, `POST /tickets/:id/rating` |
| Leaks | `GET /leaks`, `POST /leaks` `{ address, description?, lat?, lng? }` |
| Notifications | `GET /notifications`, `POST /notifications/read` |

## Field app — `/field`

`GET /jobs`, `GET /jobs/history`, `POST /jobs/:id/accept`, `POST /jobs/:id/start`,
`POST /jobs/:id/complete` `{ report, parts? }`, `GET /route`, `POST /readings`, `POST /position`,
`POST /leaks`, `POST /illegal-connections`.

## Operations — `/ops`

Access depends on the staff role; `ADMIN` can do everything.

| Area | Endpoints |
|---|---|
| Overview | `GET /overview`, `GET /reports/water-balance?days=` |
| Customers | `GET,POST /customers`, `GET,PATCH /customers/:id`, `POST /customers/:id/approve`, `/reject`, `/disconnect`, `/reconnect`, `/reset-pin` |
| Meters | `GET,POST /meters`, `GET,PATCH /meters/:id`, `POST /meters/:id/readings`, `GET /readings/pending`, `POST /readings/:id/review` |
| Tariffs | `GET /tariffs`, `PUT /tariffs/:tariffClass` |
| Billing | `GET,POST /billing-runs`, `GET /invoices`, `GET /invoices/:id`, `POST /invoices/:id/void`, `/adjust` |
| Payments | `GET /payments`, `POST /payments/counter`, `GET /payments-reconciliation` |
| Collections | `GET /collections/aging`, `GET /plans`, `POST /plans/:id/decide` |
| Support | `GET /tickets`, `GET,PATCH /tickets/:id`, `POST /tickets/:id/messages` |
| Alerts | `GET /alerts`, `PATCH /alerts/:id` |
| Network | `GET /network`, `POST /network/branches`, `/zones`, `/pipelines`, `PATCH /network/stations/:id`, `POST /network/stations/:id/readings` |
| Losses | `GET,POST /leaks`, `PATCH /leaks/:id`, `POST /leaks/:id/dispatch`, `GET,POST /illegal-connections`, `PATCH /illegal-connections/:id` |
| Outages | `GET,POST /outages`, `PATCH /outages/:id` |
| Work | `GET /agents`, `GET,POST /work-orders`, `POST /work-orders/:id/assign`, `/cancel` |
| HR | `GET,POST /employees`, `PATCH,DELETE /employees/:id`, `GET /payslips`, `POST /payslips/generate`, `PATCH /payslips/:id`, `GET,POST /leave`, `POST /leave/:id/decide` |
| Inventory | `GET,POST /stock`, `GET,POST /stock/:id/movements` |
| Admin | `GET,PUT /settings`, `GET /branches`, `GET,POST /team`, `PATCH /team/:id`, `GET /audit`, `GET /notifications`, `POST /notifications/read` |

## Integrations — `/integrations`

| Method | Path | Header | Body |
|---|---|---|---|
| POST | `/payments/:provider` (`mpesa`, `airtel`, `orange`, `mtn`) | `X-Webhook-Secret` | `{ reference, amountCents, status: "SUCCESS", externalRef? }` |
| POST | `/meters/readings` | `X-Device-Key` | `{ serial, totalLitres, readAt, batteryPct?, rssi?, tampered? }` |

Payment callbacks are idempotent, and a callback whose amount differs from the payment is refused.

## Real-time events (Socket.IO)

Connect to the API origin with `auth: { token: accessToken }`.

- **Customers:** `notification`, `payment:confirmed`, `payment:failed`, `ticket:message`
- **Staff:** `notification`, `alert:new`, `payment:confirmed`, `plan:requested`, `ticket:new`, `ticket:message`, `leak:new`, `job:assigned`, `job:done`, `agent:position`
- **Field app sends:** `agent:position` `{ lat, lng }`
