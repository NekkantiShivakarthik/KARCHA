# WealthPath Mobile App (Expo)

WealthPath is an AI-assisted personal finance app that helps users break financial fog by:

- auto-classifying transactions,
- auditing spending against the 50/30/20 framework,
- generating proactive savings nudges.

## Implemented Features

- **Dashboard tab**
  - Monthly cashflow snapshot
  - Live 50/30/20 ratio bars with targets
  - Category leak radar
- **Transactions tab**
  - Manual transaction logging
  - AI-like categorization preview (merchant pattern + rule engine)
  - Confidence and explanation per classification
  - Manual bucket overrides (Needs/Wants/Savings)
- **Insights tab**
  - Subscription creep detection
  - Wants-overage alerts
  - Savings gap nudges
  - Estimated monthly impact per recommendation

## Tech Stack

- Expo Router + React Native + TypeScript
- Local in-memory data state through React Context

## Run Locally

```bash
npm install
npm run start
```

Then press:

- `a` for Android emulator
- `i` for iOS simulator
- `w` for web

## Project Structure

- `app/(tabs)/index.tsx`: Dashboard
- `app/(tabs)/transactions.tsx`: Transaction entry and overrides
- `app/(tabs)/insights.tsx`: AI insight feed
- `context/finance-context.tsx`: Shared finance state
- `lib/finance-ai.ts`: Classification, 50/30/20 summary, and insights logic
- `lib/demo-data.ts`: Seed transactions
- `lib/types.ts`: Domain types

