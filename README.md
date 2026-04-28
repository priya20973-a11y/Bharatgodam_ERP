# 🏭 WMS Pro — Warehouse Management System

> A production-grade, logistics-focused Warehouse Management System built for agricultural and freight operations. Engineered to replace Excel-based workflows with a fully automated digital platform covering cargo intake, commodity rate management, automated billing, settlement invoicing, and real-time inventory tracking.

[![Next.js](https://img.shields.io/badge/Next.js-14%2B-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Native%20Driver-green?logo=mongodb)](https://www.mongodb.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%203-cyan?logo=tailwindcss)](https://tailwindcss.com/)
[![NextAuth.js](https://img.shields.io/badge/NextAuth.js-v4-purple?logo=auth0)](https://next-auth.js.org/)
[![Zod](https://img.shields.io/badge/Zod-Validation-orange)](https://zod.dev/)

---

## ✨ Key Features

### 📦 Deep Logistics & Cargo Entry
The booking engine mirrors your **existing Excel workflow** column-for-column — capturing 18+ data points per cargo entry:

| Field Group | Fields |
|---|---|
| **Flow** | Inward/Outward direction, Entry Date |
| **Stakeholders** | Client Name, Client Location, Supplier |
| **Tracking** | Commodity Name, CAD No, Stack No, LOT No, DO No, CDF No |
| **Gate** | Gate Pass No, Pass reference |
| **Quantities** | Bags (Qty), Pala Bags, **MT (Metric Tons)** |
| **Billing** | Storage Duration, Auto-generated Invoice |

The `S No.` (Serial Number) is atomically auto-incremented via MongoDB's `counters` collection, producing a guaranteed unique row number matching your ledger exactly.

---

### 💰 Commodity Rate Master
The `Commodity Rate Master` (`/dashboard/rates`) allows warehouse owners to configure **seasonal pricing** with validity windows:

```
Rate Formula:  Total = (MT × Rate/MT × ⌈Days/30⌉) + 18% Tax
```

- Rates are tied to specific **Start → End** date ranges.
- Rates automatically transition to **`Expired`** status when the system detects `currentDate > endDate` — no cron jobs required.
- The Billing Engine performs a live `$lookup` joining the active rate to the cargo's commodity at withdrawal time.

---

### 🧾 Automated Billing & Invoice Engine

When a booking is created, the system immediately generates an **Invoice** document in MongoDB:

| Status | Description |
|---|---|
| `UNPAID` | Auto-generated at booking creation |
| `PAID` | Toggled by staff when payment is received |
| `PENDING_SETTLEMENT` | Generated at Outward Withdrawal |

- **Optimistic UI Toggle**: Staff can one-click switch between Pending ↔ Completed in the Invoice Table.
- **PDF Generation**: Each invoice renders to a downloadable PDF via `@react-pdf/renderer`.
- **Integer Math Engine**: All currency calculations use Paise-level integer math (`× 100 → compute → ÷ 100`) to eliminate floating-point corruption.

---

### 🏛️ Commodity Master
Manage the full catalogue of accepted cargo types at `/dashboard/commodities`:

- Full **CRUD** operations (Create, Read, Update, Delete).
- **Duplicate Guard** prevents accidentally registering the same commodity twice.
- **`useOptimistic` Hook** delivers 0ms perceived latency on UI mutations.
- Seamlessly integrates with the Booking Form — selecting a commodity auto-displays its current ₹/MT rate.

---

### 📊 Dashboard Analytics
The main dashboard (`/dashboard`) provides real-time operational metrics:

- Monthly booking volume trends via **Recharts line charts**.
- Revenue summaries and commodity breakdowns.
- Live inventory status per warehouse zone.

---

## 🏗️ Architecture & Data Model

### MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | Auth accounts with `ADMIN / MANAGER / STAFF` roles |
| `bookings` | Full 18-field logistics ledger (replacing Excel rows) |
| `invoices` | Immutable financial records auto-generated per booking |
| `commodities` | Master catalogue — commodity names, units, base rates |
| `commodity_rates` | Seasonal price overrides with validity date ranges |
| `commodity_price_history` | Append-only audit trail of every rate change |
| `counters` | Atomic auto-increment for `S No.` sequence |
| `warehouse_config` | Global warehouse settings and zone configuration |

### Key Architectural Decisions

- **Server Actions**: All database mutations use Next.js Server Actions — no standalone REST API endpoints needed.
- **SSR Safety**: All MongoDB `ObjectId` and `Date` objects are stringified before passing to Client Components.
- **Auth**: `next-auth` with a MongoDB-backed credential provider for RBAC.
- **Native MongoDB Driver**: Bypasses Mongoose for lower bundle size and superior connection pooling.

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js `>= 18.x`
- MongoDB Atlas cluster (or local `mongod`)

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/wms-pro.git
cd wms-pro/wms-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root of `wms-app/`:

```env
# ─── MongoDB ──────────────────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/wms_db?retryWrites=true&w=majority

# ─── NextAuth ─────────────────────────────────────────────────────────────────
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-random-string-here

# ─── App Config ───────────────────────────────────────────────────────────────
NODE_ENV=development
```

> **Tip**: Generate a secure `NEXTAUTH_SECRET` with:
> ```bash
> openssl rand -base64 32
> ```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app will redirect unauthenticated visitors to `/login`.

---

## 📁 Project Structure

```
wms-app/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── auth/[...nextauth]/    # NextAuth.js route handler
│   │   ├── actions/                   # All Server Actions (DB mutations)
│   │   │   ├── billing.ts             # Booking + Invoice creation
│   │   │   ├── commodities.ts         # Commodity CRUD
│   │   │   ├── invoices.ts            # Invoice status toggle
│   │   │   ├── rates.ts               # Seasonal rate management
│   │   │   └── withdrawal.ts          # Outward settlement engine
│   │   └── dashboard/
│   │       ├── bookings/page.tsx      # Cargo entry form
│   │       ├── commodities/page.tsx   # Commodity master
│   │       ├── invoices/page.tsx      # Invoice ledger
│   │       ├── rates/page.tsx         # Seasonal rate master
│   │       └── page.tsx               # Analytics dashboard
│   ├── components/
│   │   └── features/
│   │       ├── bookings/              # 18-field cargo entry form
│   │       ├── commodities/           # CRUD dashboard + modal
│   │       ├── invoices/              # Invoice table + PDF
│   │       └── rates/                 # Rate master dashboard
│   ├── lib/
│   │   ├── mongodb.ts                 # Native driver connection
│   │   ├── pricing-engine.ts          # Duration + tax calculation
│   │   ├── withdrawal-math.ts         # Integer-safe settlement math
│   │   └── validations/               # Zod schemas
│   │       ├── booking.ts
│   │       ├── commodity.ts
│   │       └── rate-master.ts
│   ├── types/
│   │   └── schemas.ts                 # Shared TypeScript interfaces
│   └── middleware.ts                  # Route protection via NextAuth
├── .env.local                         # Environment variables (not committed)
├── next.config.js
└── package.json
```

---

## 🛣️ Future Roadmap

| Feature | Priority | Description |
|---|---|---|
| 🔖 **Barcode / QR Scanning** | High | Scan truck gate passes via camera for instant cargo lookup |
| 📄 **PDF Gate Pass** | High | Generate printable gate passes alongside invoices |
| 📧 **Email Integration** | Medium | Auto-email PDF invoices via `Resend` on settlement |
| 📱 **SMS Alerts** | Medium | Notify clients via Twilio when cargo is ready for pickup |
| 📈 **Price Trend Charts** | Medium | Recharts line graph showing rate history per commodity |
| 🗺️ **Heat Map View** | Low | Visual floor-plan layout showing occupied vs. free zones |
| 🔄 **TanStack Query** | Low | Real-time dashboard refresh without page reload |
| 🚀 **Production Deploy** | High | Vercel deployment with MongoDB Atlas IP whitelisting |

---

## 🔒 Security Notes

- **RBAC**: Role-based access is enforced at the `middleware.ts` level using `getServerSession`.
- **Input Sanitization**: All form inputs pass through Zod validation before touching the database.
- **Immutable Audit Logs**: Price history records are insert-only — no `DELETE` or `UPDATE` paths exist for the `commodity_price_history` collection.
- **Currency Integrity**: Financial calculations use integer-based paise math to prevent floating-point errors.

---

## 📜 License

MIT © 2026 WMS Pro. Built for agricultural logistics operations.# erp_system
# Bharatgodam_ERP
