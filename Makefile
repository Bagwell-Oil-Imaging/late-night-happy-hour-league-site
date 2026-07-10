.PHONY: run build fetch transform update-data standings lint deploy-rules

# Start Vite and the local API bridge together.
run:
	npm run dev:local

# TypeScript compile + production build
build:
	npm run build

# Fetch raw data from LeaguePals API
fetch:
	npm run fetch

# Transform fetched data and write to Firestore
transform:
	npm run transform

# Fetch + transform in sequence (run after each league night)
update-data:
	npm run update-data

# Download weekly standings PDFs via Puppeteer
standings:
	npm run standings

# Run ESLint
lint:
	npm run lint

# Deploy Firestore rules and indexes
deploy-rules:
	npm run deploy:rules
