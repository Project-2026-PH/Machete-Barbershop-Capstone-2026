# DemoShop

### Barbershop operations platform · 2026 capstone

DemoShop is a full-stack web platform for coordinating customer bookings and day-to-day barbershop operations. It brings customer, staff, cashier, and inventory workflows into one application.

## Product workflows

- **Bookings and queue management** — appointments, walk-ins, service selection, barber assignment, and queue status.
- **Staff operations** — role-based workspaces, barber schedules, shift management, and customer communications.
- **Cashier and transactions** — service sales, reservation payments, receipts, and payment-evidence handling.
- **Inventory** — stock counts, purchase orders, consumable tracking, and forecasting tools.
- **Customer experience** — storefront, service discovery, account flows, and appointment management.
- **Operational visibility** — dashboards, reports, audit history, and real-time status updates.
- **Offline-aware workflows** — selected front-desk flows can continue through temporary connectivity interruptions and reconcile when service returns.

## Technology

| Area | Stack |
| --- | --- |
| Web client | React 19, Vite, TypeScript, React Router |
| API | Node.js 22+, Express 5, TypeScript |
| Shared contracts | TypeScript workspace package in `packages/shared-types` |
| Data services | PostgreSQL through Supabase, Redis, and SQLite for local/offline support |
| Integrations | Google GenAI, receipt OCR, email, and receipt printing |

## Architecture

The web client talks to an Express API. Backend code is organized around routes, controllers, services, and repositories, with shared TypeScript contracts used across the workspace. Realtime updates and offline-aware client flows support front-desk work during a busy day.

## Repository layout

```text
demoshop-frontend/       React web client
demoshop-backend/        Express API
packages/shared-types/   Shared TypeScript contracts
```

## Portfolio snapshot

This repository is an anonymized portfolio snapshot. Client names, branch identifiers, custom domains, contact details, and branded media were replaced or removed. The original Git history, production configuration, database migrations and sample data, tests, CI workflows, and operational runbooks are not included.

Because those pieces were removed, this snapshot is not configured for local deployment and should not be connected to live services. Use synthetic data and separately provisioned demo infrastructure for demonstrations.

## License

No license is included in this snapshot. Contact the repository owner before reusing the code.
