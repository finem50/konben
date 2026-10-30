# Konben

Dinners, kitted and portioned. A week board, a bagged kit per cooking night, a
merged shopping list, and macros a plate.

A dinner that keeps can be cooked double, which turns the night after into a
no-cook night and buys its ingredients only once. That rule is the whole app.

For a tour of the tabs, the data model and the full list of mutations, see the
[field guide](DOCS.md).

## Running it

```sh
docker compose up --build
```

Then open http://localhost:3000.

State lives in SQLite on the `konben-data` volume, so it survives rebuilds and
follows you between devices on the same network. There is no login: anyone who
can reach the port can see and edit the plan, which is the intended trade for a
household app on a trusted network (LAN, Tailscale, VPN). Don't expose the port
to the internet.

## Security

- **No login.** `/api/state` returns the whole kitchen and accepts any change from
  anyone who can reach the port. Keep it on a trusted network.
- **Writes must be `application/json`.** Other content types get a 415. That stops
  a web page open in a browser on the same network from posting changes with a
  plain form or `text/plain` request.
- **Recipes upsert by id.** Posting `recipe.add` with an existing id replaces that
  recipe, built-ins included.

## Adding recipes

Write the recipe as JSON in the card format (`src/lib/schema.ts` defines it; see
`REQUIREMENTS.md` for the content standards) and post it to the running app:

```sh
node scripts/add-recipe.mjs recipe.json
node scripts/add-recipe.mjs recipes.json --url http://<your-host>:3000
```

The recipe shows up under **Recipes** on the next refresh — no rebuild. If a
field is wrong, the script prints exactly which one.

Every recipe lives in the database on the volume, including the thirteen the app
starts with, so editing any of them needs no rebuild.

You can also add one by hand in the app, under Recipes → Add a recipe. The form
writes the same card format and checks it against the same schema before saving.

## Developing

```sh
npm install
npm run dev          # http://localhost:3000, database at ./konben.db
npm test             # planning rules and the /api/state route
npm run typecheck
npm run lint
```

`npm run db:generate` writes a new migration to `drizzle/` after a schema
change; migrations are applied automatically at boot.

## How it fits together

| | |
|---|---|
| `src/lib/planning.ts` | The rules: kits, the buy list, and every plan edit |
| `src/hooks/useKitchenState.ts` | Client state, and the writes it sends |
| `src/app/api/state` | Reads the kitchen, applies row-scoped writes |
| `src/lib/schema.ts` | What a valid recipe is, enforced at the API boundary |
| `src/components/Pantry.tsx` | The Kitchen tab: what's on hand, which the picker, Roll and Recipes filter favour |
| `scripts/add-recipe.mjs` | Posts a recipe into a running instance |
| `scripts/plan-week.mjs` | Lists, picks and writes a week of dinners into a running instance |

Plan edits are applied by the pure reducers in `lib/planning.ts` and posted as
just the rows that changed, so two devices editing different nights don't
overwrite each other.

## Configuration

| Variable | Default | |
|---|---|---|
| `DATABASE_PATH` | `./konben.db` | Set to `/data/konben.db` in the container |
| `TZ` | system | Set it to your zone: the week runs on local time |
| `KONBEN_URL` | `http://localhost:3000` | Where `add-recipe.mjs` and `plan-week.mjs` post to. Set it to `http://<your-host>:3000` when the app runs on another machine |
