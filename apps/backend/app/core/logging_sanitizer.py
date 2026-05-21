from typing import Any

def sanitize_log(value: Any) -> str:
    """
    Sanitize values to prevent log injection (S5145) by stripping or replacing
    newline (\\n) and carriage return (\\r) characters.
    """
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    return value.replace("\n", "_").replace("\r", "_")
