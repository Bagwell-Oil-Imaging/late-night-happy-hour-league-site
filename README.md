# Late Night Happy Hour - Bowling League Website

A modern, responsive React + TypeScript website for the Late Night Happy Hour bowling league,
backed by Firebase Firestore for live data.

## Features

- Image carousel with league highlights
- Calendar view of upcoming events
- League standings with win/loss records
- Historical match scores
- Future matchup schedule
- Admin panel for managing announcements, events, carousel images, and documents
- Fully responsive design

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: CSS3 with custom properties
- **Data**: Firebase Firestore (real-time database)
- **Auth**: Firebase Authentication (admin panel)
- **Storage**: Firebase Storage (PDF uploads)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Firebase project with Firestore, Authentication, and Storage enabled

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd late-night-happy-hour-league-site
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env and fill in your Firebase project values
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3001`. Use `make run` (or `npm run dev:local`) to start both Vite and the local API server; Vite proxies `/api/*` to `http://localhost:3003`.

### Firebase Setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project.
2. Enable **Firestore Database**, **Authentication** (Email/Password), and **Storage**.
3. In Project Settings → Your Apps, register a Web App and copy the SDK config values.
4. Set the following variables in your `.env` file:

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

5. Deploy Firestore and Storage security rules:
```bash
firebase deploy --only firestore:rules,storage
```

### Building for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` folder.

## Deploying to Vercel

### Method 1: Via Vercel Dashboard (Recommended)

1. Push your code to GitHub.
2. Go to [vercel.com](https://vercel.com) and click "New Project".
3. Import your GitHub repository — Vercel auto-detects the Vite config.
4. Add your `VITE_FIREBASE_*` environment variables in the Vercel project settings.
5. Click "Deploy".

### Method 2: Via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

## Project Structure

```
late-night-happy-hour-league-site/
├── src/
│   ├── components/           # Reusable UI components
│   │   └── admin/            # Admin auth guard and layout
│   ├── hooks/                # Firestore React hooks
│   │   ├── useFirestore.ts   # Generic useCollection<T> / useDocument<T>
│   │   └── index.ts          # Domain hooks (useTeams, useMatchups, etc.)
│   ├── pages/                # Route-level page components
│   │   └── admin/            # Admin CRUD panel pages
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces (Firestore schema)
│   ├── utils/
│   │   └── admin.ts          # Admin utility helpers
│   ├── firebase.ts           # Firebase app initialization
│   ├── App.tsx
│   └── main.tsx
├── api/                      # Vercel serverless functions
│   ├── reingest-week.js      # Re-fetch and overwrite one scored week
│   ├── local-admin-write.js  # Local-only service-account bridge for bypassed admin schedule writes
│   └── upload-to-drive.js    # Upload admin documents to Google Drive
├── scripts/                  # Node.js data pipeline
│   ├── fetch-league-data.js  # Fetches raw data from LeaguePals API
│   └── transform-data.js     # Transforms and writes to Firestore
├── firestore.rules           # Firestore security rules
├── firestore.indexes.json    # Composite index definitions
├── storage.rules             # Firebase Storage security rules
├── firebase.json             # Firebase project config
├── .env.example              # Required environment variable template
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Updating Data

League data is managed via the data pipeline or the admin panel:

### Automated Pipeline (League Stats)

Runs nightly or on-demand to pull fresh data from the LeaguePals API:

```bash
# Fetch raw API data + transform and write to Firestore
npm run update-data
```

Requires `FIREBASE_SERVICE_ACCOUNT_PATH` set in `.env` pointing to a Firebase service account JSON file.

### Admin Panel (Announcements, Events, Carousel, Documents)

Navigate to `/admin/login` in the browser. Log in with a Firebase Auth email/password account. Manage content through the admin panels at `/admin/announcements`, `/admin/events`, `/admin/carousel`, and `/admin/documents`.

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite on `http://localhost:3001` with `/api/*` proxied to the local API dev server on `http://localhost:3003` |
| `npm run dev:api` | Start the local API dev server on `http://localhost:3003` |
| `npm run build` | TypeScript compile + Vite production build |
| `npm run fetch` | Fetch raw data from LeaguePals API |
| `npm run transform` | Transform data and write to Firestore |
| `npm run update-data` | `fetch` + `transform` in sequence |
| `npm run verify-seed` | Validate Firestore collection document counts |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) if present for development guidelines.

## License

This project is open source and available for the Late Night Happy Hour bowling league.
