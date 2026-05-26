import bcrypt

def hash_password(password: str) -> str:
    """Return a bcrypt hash of the given password.

    Args:
        password: The plaintext password.
    Returns:
        The hashed password string.
    """
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against its bcrypt hash.

    Args:
        plain_password: The plaintext password provided by the user.
        hashed_password: The stored hash.
    Returns:
        True if the password matches, False otherwise.
    """
    try:
        password_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False

