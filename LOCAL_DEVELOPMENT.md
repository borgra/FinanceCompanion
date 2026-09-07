# Local development

The canonical local stack needs no Azure, Entra, Alpha Vantage, or `.env.local` credentials.

```powershell
docker compose -f docker-compose.local.yml up --build
# UI: http://localhost:5173  API health: http://localhost:8000/api/v1/health
docker compose -f docker-compose.local.yml down
.\reset-local.ps1
```

The API uses deterministic seed data and persists edits to `.local-data/finance.json`, mounted into the container. The JSON store assumes a single API writer; do not run multiple API replicas against the same file. Missing data initializes from the committed seed logic. Invalid JSON fails startup with an explicit path and error.

For the development server scripts, use `start-local.ps1` and `stop-local.ps1`; the container stack above is the credential-free production-shaped path.

## Automatically rebuild the Docker UI

Use the watcher when you want the production-shaped Docker UI container to rebuild after every save:

```powershell
.\scripts\watch-docker-ui.ps1
```

It performs an initial detached rebuild, then watches `src/UI` and debounces save bursts before rebuilding and recreating only the `ui` service. Generated folders such as `node_modules`, `dist`, and `.vite` are ignored. Press `Ctrl+C` to stop watching; it leaves the Docker services running. Use `-Once` for a single rebuild.
