"""Canonicalize the observed SQL UTC instant; never renew its timestamp."""
import datetime as dt
import re


def canonical_sql_utc(value):
    if not isinstance(value, str) or not re.fullmatch(
        r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00(?::?00)?)?', value
    ):
        raise ValueError('INVALID_OBSERVED_SQL_UTC')
    text = value.replace(' ', 'T', 1).replace('Z', '+00:00')
    observed = dt.datetime.fromisoformat(text)
    if observed.tzinfo is None:
        # Input is exclusively the SQL column explicitly named checked_at_utc.
        observed = observed.replace(tzinfo=dt.timezone.utc)
    if observed.utcoffset() != dt.timedelta(0):
        raise ValueError('NON_UTC_SQL_INSTANT')
    return observed.isoformat(timespec='microseconds').replace('+00:00', 'Z')
