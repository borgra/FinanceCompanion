# Source

This folder contains the Finance Companion application:

- [UI](UI/README.md): React holdings and passive-income workflows.
- [API](API/README.md): FastAPI use cases, domain validation and JSON/Cosmos persistence.

Live mode uses Foundry for security search, a dedicated GPT-6 Luna stock-details agent, and a separate dividend-history agent. Offline mode uses deterministic stubs throughout. See [local testing](../Docs/Local%20Live%20Distribution%20Testing.md) for setup and persistence checks, and [the stock-agent specification](../Docs/Foundry%20Stock%20Details%20Agent.md) for data contracts and acceptance criteria.
