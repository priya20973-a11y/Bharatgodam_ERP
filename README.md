# 🏭 WMS Pro — Warehouse Management System

> A logistics-first warehouse management platform for agricultural and freight operations. This repository supports booking, pricing, billing, invoicing, and inventory workflows for warehouse teams.

## What’s included

- Next.js App Router frontend with reusable UI components.
- MongoDB native driver backend for transactions, invoices, warehouses, and commodities.
- Role-based auth using NextAuth.
- Invoice preview and PDF generation.
- Additional charge management and invoice adjustment support.
- Commodity rate master with seasonal pricing windows.

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster or local MongoDB instance

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env.local` file at the repository root:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/wms_db?retryWrites=true&w=majority
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<secure-random-value>
NODE_ENV=development
```

### Run locally

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Main features

- Cargo booking capture for inward and outward warehouse flows.
- Commodity rate management and valid date range pricing.
- Automated invoice creation and adjustment support.
- Payment allocation and outstanding balance tracking.
- Dashboard analytics for bookings, revenue, and inventory.

## Project structure

- `app/` — Next.js application routes, pages, and API endpoints.
- `app/actions/` — server-side action handlers for booking, invoice, and report workflows.
- `lib/` — shared utilities, MongoDB connection helpers, and validation logic.
- `components/` — reusable UI components.
- `public/` — static assets.
- `package.json` — scripts and dependencies.

## Useful commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
```

## Notes

- The repo is engineered for warehouse invoice workflows, including additional charge persistence and invoice preview caching.
- Ensure the `MONGODB_URI` and `NEXTAUTH_SECRET` values are configured before starting the app.

## License

MIT © 2026
