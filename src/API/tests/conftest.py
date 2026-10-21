"""Keep automated tests independent of developer credentials and live services."""
import os

from app.infrastructure.settings import Settings

# Apply before test-module collection imports app.main and builds its default app.
# Tests can still pass an explicit _env_file or set their own environment values.
Settings.model_config["env_file"] = None
for name in list(os.environ):
    if name.startswith("FINANCE_COMPANION_"):
        os.environ.pop(name)
