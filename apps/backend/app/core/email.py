import os
import logging
from resend import Resend
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize Resend client using the API key from settings (or env)
_resend_client = Resend(settings.RESEND_API_KEY) if settings.RESEND_API_KEY else None

def send_otp_email(to_email: str, otp_code: str) -> bool:
    """Send an OTP code via email using Resend.

    Returns True on success, False otherwise.
    """
    if not _resend_client:
        logger.error("Resend client not configured – missing RESEND_API_KEY.")
        return False
    try:
        response = _resend_client.emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": "Your Kubi OTP Code",
            "html": f"<p>Your verification code is <strong>{otp_code}</strong>. "
                    "It expires in {settings.OTP_EXPIRY_MINUTES} minutes.</p>",
        })
        logger.info(f"OTP email sent to {to_email}, response id: {response.id}")
        return True
    except Exception as e:
        logger.exception(f"Failed to send OTP email to {to_email}: {e}")
        return False
