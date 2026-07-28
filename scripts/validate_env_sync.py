#!/usr/bin/env python3
"""
Validate that .env.example documents every environment variable used in config.py.

Usage:
    python scripts/validate_env_sync.py

Exit codes:
    0 — all variables are documented
    1 — one or more variables are missing from .env.example
"""

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

CONFIG_PATH = PROJECT_ROOT / "backend" / "app" / "config.py"
ENV_EXAMPLE_PATH = PROJECT_ROOT / ".env.example"


def get_config_env_vars(path: Path) -> set[str]:
    """Extract all env var names referenced via os.getenv() in config.py."""
    text = path.read_text()
    # Match os.getenv("VAR") and os.getenv('VAR'), including multi-line calls
    # with default values. Uses a backreference (\1) so the closing quote
    # matches the opening quote style.
    matches = re.findall(
        r'os\.getenv\s*\(\s*(["\'])([^"\']+)\1',
        text,
        re.DOTALL,
    )
    # matches is a list of (quote_char, var_name) tuples
    return {m[1] for m in matches}


def get_env_example_vars(path: Path) -> set[str]:
    """Extract all documented variable names from .env.example.

    Ignores comment lines and blank lines. Parses lines of the form:
        VAR_NAME=value
        VAR_NAME="value"
    """
    text = path.read_text()
    vars_found: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        # Skip blank lines and full-line comments
        if not stripped or stripped.startswith("#"):
            continue
        # Match a variable name at the start of the line (before =)
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=", stripped)
        if match:
            vars_found.add(match.group(1))
    return vars_found


def main() -> int:
    errors = []

    if not CONFIG_PATH.exists():
        print(f"ERROR: {CONFIG_PATH} not found", file=sys.stderr)
        return 1

    if not ENV_EXAMPLE_PATH.exists():
        print(f"ERROR: {ENV_EXAMPLE_PATH} not found", file=sys.stderr)
        return 1

    config_vars = get_config_env_vars(CONFIG_PATH)
    example_vars = get_env_example_vars(ENV_EXAMPLE_PATH)

    # Every env var read in config.py should be documented in .env.example
    missing = sorted(config_vars - example_vars)
    for var in missing:
        errors.append(f"  {var} — used in config.py but missing from .env.example")

    # Warn about vars in .env.example that aren't in config.py
    # (not an error — .env.example can have extras for future use or documentation)
    extra = sorted(example_vars - config_vars)
    if extra:
        print(
            "INFO: The following vars are in .env.example but not referenced in config.py:"
        )
        for var in extra:
            print(f"  {var}")

    if errors:
        print(
            "ERROR: The following env vars are missing from .env.example:",
            file=sys.stderr,
        )
        for err in errors:
            print(err, file=sys.stderr)
        print(file=sys.stderr)
        print("Run the validation again after adding them.", file=sys.stderr)
        return 1

    print("OK: All env vars from config.py are documented in .env.example")
    return 0


if __name__ == "__main__":
    sys.exit(main())
