"""Shared-secret check for POST /forecast — Analytics Service has no
concept of user identity (it's a stateless calculator, per CLAUDE.md),
so this isn't per-user auth, only a check that the caller is really
web/'s server and not an open, unauthenticated public endpoint
(improvements.md S04.11). A separate secret from finance-api's
INTERNAL_API_SECRET — a leak of one must not compromise the other.
"""

import os

from fastapi import Header, HTTPException

_SECRET = os.environ["ANALYTICS_API_SECRET"]


def verify_shared_secret(x_analytics_secret: str | None = Header(default=None)) -> None:
    if x_analytics_secret != _SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing analytics secret")
