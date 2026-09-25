"""Shared-secret check for POST /forecast — Analytics Service has no
concept of user identity (it's a stateless calculator, per CLAUDE.md),
so this isn't per-user auth, only a check that the caller is really
web/'s server and not an open, unauthenticated public endpoint
(improvements.md S04.11). A separate secret from finance-api's
INTERNAL_API_SECRET — a leak of one must not compromise the other.
"""

import hmac
import os

from fastapi import Header, HTTPException

_SECRET = os.environ["ANALYTICS_API_SECRET"]


def verify_shared_secret(x_analytics_secret: str | None = Header(default=None)) -> None:
    # hmac.compare_digest requires both arguments to be str/bytes, so the
    # None-check (missing header) has to happen before it, and the actual
    # comparison uses it so an attacker can't use response-timing
    # differences to guess the secret one byte at a time (Epic 15 Story 1
    # final review, promoted from Minor since this is a security-hardening
    # story).
    if x_analytics_secret is None or not hmac.compare_digest(x_analytics_secret, _SECRET):
        raise HTTPException(status_code=401, detail="Invalid or missing analytics secret")
