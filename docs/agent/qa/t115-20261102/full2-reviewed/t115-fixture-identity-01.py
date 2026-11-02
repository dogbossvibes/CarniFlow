"""Pure, fail-closed synthetic fixture comparison; no I/O or execution permission."""
import datetime as dt
import re

STAMP = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])")

def instant(value):
    if type(value) is not str or STAMP.fullmatch(value) is None:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(dt.timezone.utc)
    except (ValueError, OverflowError):
        return None

def matches(table, expected, actual):
    if type(expected) is not dict or type(actual) is not dict:
        return False
    if not all(type(expected.get(k)) is str and expected[k] for k in ("id", "owner_id", "dog_id")):
        return False
    for field, value in expected.items():
        if field not in actual:
            return False
        observed = actual[field]
        if table == "dog_vet_appointments" and field == "appointment_at":
            wanted, got = instant(value), instant(observed)
            if wanted is None or got is None or wanted != got:
                return False
        elif type(observed) is not type(value) or observed != value:
            return False
    return True
