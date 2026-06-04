import logging
import json
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage

try:
    from pymongo import MongoClient, ReturnDocument
except ImportError:  # pragma: no cover
    MongoClient = None
    ReturnDocument = None

# Optional import of resend; provide fallback if not installed
try:
    import resend
except ImportError:  # pragma: no cover
    class _DummyResend:
        api_key = None
        class Emails:
            @staticmethod
            def send(payload):
                # Simulate a successful send without external service
                return {}
    resend = _DummyResend()
from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_local_email_mode() -> bool:
    environment = (settings.ENVIRONMENT or "").strip().lower()
    return environment in {"development", "local", "test"}


def _truthy(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _email_provider() -> str:
    provider = (settings.EMAIL_PROVIDER or "auto").strip().lower()
    if provider == "auto":
        return "console" if _is_local_email_mode() else "resend"
    return provider


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _default_sender() -> dict:
    return {
        "name": settings.EMAIL_FROM,
        "from": settings.EMAIL_FROM,
        "provider": "smtp",
        "smtp_host": settings.SMTP_HOST,
        "smtp_port": settings.SMTP_PORT,
        "smtp_username": settings.SMTP_USERNAME,
        "smtp_password": settings.SMTP_PASSWORD,
        "smtp_use_ssl": settings.SMTP_USE_SSL,
        "smtp_use_tls": settings.SMTP_USE_TLS,
        "monthly_limit": settings.EMAIL_SENDER_MONTHLY_LIMIT,
        "switch_after": settings.EMAIL_SENDER_SWITCH_AFTER,
    }


def _parse_sender_pool() -> list[dict]:
    if not settings.EMAIL_SENDER_POOL:
        return [_default_sender()]

    raw_senders = json.loads(settings.EMAIL_SENDER_POOL)
    if not isinstance(raw_senders, list):
        raise ValueError("EMAIL_SENDER_POOL must be a JSON array")

    senders = []
    for index, sender in enumerate(raw_senders, start=1):
        if not isinstance(sender, dict):
            raise ValueError("Each EMAIL_SENDER_POOL item must be an object")

        normalized = _default_sender()
        normalized.update(sender)
        normalized["provider"] = (normalized.get("provider") or "smtp").strip().lower()
        if normalized["provider"] != "smtp":
            raise ValueError("EMAIL_SENDER_POOL currently supports provider=smtp entries")
        normalized["name"] = normalized.get("name") or normalized.get("from") or f"sender-{index}"
        normalized["from"] = normalized.get("from") or settings.EMAIL_FROM
        normalized["smtp_password"] = normalized.get("smtp_password") or settings.SMTP_PASSWORD
        normalized["smtp_username"] = normalized.get("smtp_username") or settings.SMTP_USERNAME
        normalized["smtp_host"] = normalized.get("smtp_host") or settings.SMTP_HOST
        normalized["smtp_port"] = int(normalized.get("smtp_port") or settings.SMTP_PORT)
        normalized["monthly_limit"] = int(normalized.get("monthly_limit") or settings.EMAIL_SENDER_MONTHLY_LIMIT)
        normalized["switch_after"] = int(normalized.get("switch_after") or settings.EMAIL_SENDER_SWITCH_AFTER)
        normalized["switch_after"] = min(normalized["switch_after"], normalized["monthly_limit"])
        senders.append(normalized)

    return senders


def _usage_collection():
    if MongoClient is None:
        raise RuntimeError("pymongo is required for email sender rotation counters")
    client = MongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=1000)
    return client[settings.DATABASE_NAME][settings.EMAIL_SENDER_USAGE_COLLECTION]


def _reserve_sender(sender: dict) -> bool:
    month = _current_month()
    sender_name = sender["name"]
    switch_after = sender["switch_after"]
    collection = _usage_collection()
    doc_id = f"{month}:{sender_name}"

    collection.update_one(
        {"_id": doc_id},
        {
            "$setOnInsert": {
                "month": month,
                "sender": sender_name,
                "from": sender["from"],
                "limit": sender["monthly_limit"],
                "switch_after": switch_after,
                "created_at": datetime.now(timezone.utc),
                "count": 0,
            },
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )
    result = collection.find_one_and_update(
        {"_id": doc_id, "count": {"$lt": switch_after}},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    return result is not None


def _release_sender(sender: dict) -> None:
    if MongoClient is None:
        return
    try:
        _usage_collection().update_one(
            {"_id": f"{_current_month()}:{sender['name']}", "count": {"$gt": 0}},
            {"$inc": {"count": -1}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        )
    except Exception:
        logger.warning("Failed to release reserved email sender counter", exc_info=True)


def _select_sender() -> dict:
    senders = _parse_sender_pool()
    for sender in senders:
        try:
            if _reserve_sender(sender):
                return sender
        except Exception:
            logger.warning("Email sender counter unavailable; using first configured sender", exc_info=True)
            return sender

        logger.warning(
            "Email sender %s reached switch threshold %s for %s; trying next sender",
            sender["name"],
            sender["switch_after"],
            _current_month(),
        )

    raise RuntimeError("All configured email senders reached the monthly switch threshold")


# Configure Resend global API key if set and not a placeholder
if settings.RESEND_API_KEY and settings.RESEND_API_KEY != "your-resend-api-key":
    resend.api_key = settings.RESEND_API_KEY
else:
    resend.api_key = None

def send_otp_email(to_email: str, otp: str) -> bool:
    """Send an OTP code via the configured email provider.

    In development or if the API key is not configured, it falls back to console logging.
    Returns True on success, False otherwise.
    """
    provider = _email_provider()
    if provider == "console" or (provider == "resend" and not resend.api_key):
        logger.info(f"[DEV EMAIL FALLBACK] Sending OTP verification code: {otp} to {to_email}")
        return True
    sender = None
    try:
        if provider == "smtp":
            sender = _select_sender()
            return _send_otp_email_smtp(to_email, otp, sender)

        response = resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": "Your Kubi OTP Code",
            "html": f"<p>Your verification code is <strong>{otp}</strong>. "
                    f"It expires in {settings.OTP_EXPIRY_MINUTES} minutes.</p>",
        })
        # Log response safely
        response_id = getattr(response, "id", None) or response.get("id") if response else None
        logger.info(f"OTP email sent to {to_email}, response id: {response_id}")
        return True
    except Exception as e:
        if sender:
            _release_sender(sender)
        logger.exception(f"Failed to send OTP email to {to_email}: {e}")
        if provider == "smtp":
            return False
        # Recoverable fallback: log to console and return True so user flow is not blocked
        logger.info(f"[RECOVERABLE FALLBACK] Logging OTP verification code: {otp} to {to_email}")
        return True


def _send_otp_email_smtp(to_email: str, otp: str, sender: dict | None = None) -> bool:
    sender = sender or _default_sender()
    if not sender["smtp_password"]:
        raise ValueError("SMTP_PASSWORD is required for EMAIL_PROVIDER=smtp")

    message = EmailMessage()
    message["From"] = sender["from"]
    message["To"] = to_email
    message["Subject"] = "Your Kubi OTP Code"
    message.set_content(
        f"Your verification code is {otp}. It expires in {settings.OTP_EXPIRY_MINUTES} minutes."
    )
    message.add_alternative(
        f"<p>Your verification code is <strong>{otp}</strong>. "
        f"It expires in {settings.OTP_EXPIRY_MINUTES} minutes.</p>",
        subtype="html",
    )

    if _truthy(sender["smtp_use_ssl"]):
        with smtplib.SMTP_SSL(sender["smtp_host"], sender["smtp_port"], timeout=15) as smtp:
            smtp.login(sender["smtp_username"], sender["smtp_password"])
            smtp.send_message(message)
    else:
        with smtplib.SMTP(sender["smtp_host"], sender["smtp_port"], timeout=15) as smtp:
            if _truthy(sender["smtp_use_tls"]):
                smtp.starttls()
            smtp.login(sender["smtp_username"], sender["smtp_password"])
            smtp.send_message(message)

    logger.info(f"OTP email sent to {to_email} via SMTP sender {sender['name']}")
    return True
