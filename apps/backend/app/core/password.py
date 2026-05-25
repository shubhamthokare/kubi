import bcrypt
from passlib.context import CryptContext

# Using passlib's CryptContext for convenience. It wraps bcrypt.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Return a bcrypt hash of the given password.

    Args:
        password: The plaintext password.
    Returns:
        The hashed password string.
    """
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against its bcrypt hash.

    Args:
        plain_password: The plaintext password provided by the user.
        hashed_password: The stored hash.
    Returns:
        True if the password matches, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)
