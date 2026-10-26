# Bobby-the-game

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_c1kZ2bAsLeFa4AEjdfXMZDPmMkVt)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

## AI Self-Play Simulation

Run reproducible matches between AI strategies to compare win rates, repeated-position draws, card pickups, and invalid moves:

```bash
pnpm simulate:ai -- --games=100 --players=3 --protagonist=hard --opponent=medium --seed=20261026
```

Supported strategies are `easy`, `medium`, and `hard`. Use `--max-turns=5000` to change the per-game decision limit. A repeated full game position is reported as a draw.

During play, rate each computer move as good or bad. For a bad move, select a legal alternative—including taking cards when the AI played—or record the correction without one. Feedback is saved in browser storage and can be downloaded as `bobby-ai-evaluations.json` from the prompt or the game-over screen. The saved decision context includes the AI's own hand and public game history, but not opponents' hidden cards. Medium and hard AI compare legal plays against taking three or all available cards; taking is also considered when no legal play exists.
