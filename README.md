# Late Night Happy Hour - Bowling League Website

A modern, responsive React + TypeScript website for the Late Night Happy Hour bowling league.

## Features

- 📸 Image carousel with league highlights
- 📅 Calendar view of upcoming events
- 🎯 League standings with win/loss records
- 📊 Historical match scores
- 🔮 Future matchup schedule
- 📱 Fully responsive design

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: CSS3 with custom properties
- **Data**: JSON files (no backend required)

## Getting Started

### Prerequisites

- Node.js 18+ and npm

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

3. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The production-ready files will be in the `dist` folder.

## Deploying to Vercel

### Method 1: Via Vercel Dashboard (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Vercel will auto-detect the Vite configuration
6. Click "Deploy"

### Method 2: Via Vercel CLI

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

For production deployment:
```bash
vercel --prod
```

## Project Structure

```
late-night-happy-hour-league-site/
├── src/
│   ├── components/         # React components
│   │   ├── Calendar.tsx
│   │   ├── Carousel.tsx
│   │   ├── FutureMatchups.tsx
│   │   ├── Header.tsx
│   │   ├── HistoricalScores.tsx
│   │   ├── LeagueStandings.tsx
│   │   └── UpcomingEvents.tsx
│   ├── data/              # JSON data files
│   │   ├── carouselImages.json
│   │   ├── events.json
│   │   ├── historicalMatches.json
│   │   ├── matchups.json
│   │   └── teams.json
│   ├── types/             # TypeScript type definitions
│   │   └── index.ts
│   ├── App.tsx            # Main app component
│   ├── App.css
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles
├── public/                # Static assets
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json           # Vercel configuration
```

## Updating Data

All data is stored in JSON files in the `src/data/` directory. To update:

### Teams
Edit `src/data/teams.json` to update team standings

### Events
Edit `src/data/events.json` to add or modify league events

### Matchups
Edit `src/data/matchups.json` for future matchups

### Historical Scores
Edit `src/data/historicalMatches.json` to add completed game scores

### Carousel Images
Edit `src/data/carouselImages.json` to change hero images

## Customization

### Colors
Modify the CSS variables in `src/index.css`:
```css
:root {
  --primary-color: #2c5f8d;
  --secondary-color: #d4af37;
  --background-color: #1a1a1a;
  /* ... more colors */
}
```

## License

This project is open source and available for the Late Night Happy Hour bowling league.