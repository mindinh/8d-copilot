# CNMA Proresolve

CNMA Proresolve application built with **SAP CAP (Node.js/TypeScript)** on the backend and **React (Vite + `@cnma/react-ui`)** on the frontend.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v18 or v20+
- **npm**: v8+

### 2. Installation
Install dependencies for root (Backend) and UI (Frontend):

```bash
# Install root dependencies
npm install

# Install frontend dependencies
npm install --prefix app/cnma_proresolve_ui
```

### 3. Deploy Local SQLite Database (First-Time Setup)
Deploy data model schema & seed data to local SQLite database (`sqlite.db`):

```bash
npm run deploy:sqlite
```

### 4. Run Full-Stack Locally
Run the combined CAP Backend (`http://localhost:4004`) and React Frontend (`http://localhost:5544`):

```bash
# Recommended (cleans old port bindings on 4004 & 5544, then starts dev servers)
npm run dev:all
```

Or run via npm script directly:
```bash
npm run dev
```

#### Development URLs & Login Info:
- **React Frontend**: `http://localhost:5544`
- **CAP Backend Service**: `http://localhost:4004`
- **Local Dev User**: `Local Developer` (Admin role enabled automatically)

---

## 🛠️ Individual Commands

| Command | Description |
|:---|:---|
| `npm run dev:all` | Auto-cleans ports 4004/5544 & launches Backend + Frontend concurrently |
| `npm run dev:backend` | Starts CAP through the local TSX runner so `srv/server.ts` bootstrap and seed hooks run |
| `npm run dev --prefix app/cnma_proresolve_ui` | Starts only React Frontend (`vite`) |
| `npm run deploy:sqlite` | Deploys schema to local SQLite database (`sqlite.db`) |
| `npm run clean` | Cleans temporary build directories & Makefiles |

---

## 📦 Production Build & Deployment (SAP BTP Cloud Foundry)

### 1. Build MTA Package
Generates the Cloud Foundry MTAR archive and UI deployment resources:

```bash
npm run build:cf
```

### 2. Deploy to SAP BTP
Deploy the built MTAR package to your BTP Cloud Foundry space:

```bash
cf deploy mta_archives/cnma_proresolve_0.0.1.mtar
```
