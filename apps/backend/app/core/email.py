import logging
import resend
from app.core.config import settings

logger = logging.getLogger(__name__)

# Configure Resend global API key if set and not a placeholder
if settings.RESEND_API_KEY and settings.RESEND_API_KEY != "your-resend-api-key":
    resend.api_key = settings.RESEND_API_KEY
else:
    resend.api_key = None

def send_otp_email(to_email: str, otp: str) -> bool:
    """Send an OTP code via email using Resend.

    In development or if the API key is not configured, it falls back to console logging.
    Returns True on success, False otherwise.
    """
    if not resend.api_key or settings.ENVIRONMENT == "development":
        logger.info(f"[DEV EMAIL FALLBACK] Sending OTP verification code: {otp} to {to_email}")
        return True
    try:
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
        logger.exception(f"Failed to send OTP email to {to_email}: {e}")
        return False
