import os
import logging
import requests

logger = logging.getLogger(__name__)

VAULT_ADDR = os.getenv("VAULT_ADDR", "").rstrip("/")
VAULT_TOKEN = os.getenv("VAULT_TOKEN", "")
VAULT_SECRET_PATH = os.getenv("VAULT_SECRET_PATH", "secret/data/kubi")

_vault_cache = {}
_vault_loaded = False

def load_vault_secrets():
    global _vault_cache, _vault_loaded
    if _vault_loaded:
        return _vault_cache

    if not VAULT_ADDR or not VAULT_TOKEN:
        logger.info("Vault credentials not provided (VAULT_ADDR and/or VAULT_TOKEN missing). Falling back to environment/dotenv.")
        _vault_loaded = True
        return _vault_cache

    headers = {"X-Vault-Token": VAULT_TOKEN}
    
    # Paths to try:
    # 1. Specified path (e.g. secret/data/kubi)
    # 2. KV v2 path if specified was KV v1 (e.g. secret/data/kubi if secret/kubi was given)
    # 3. KV v1 path if specified was KV v2 (e.g. secret/kubi if secret/data/kubi was given)
    paths_to_try = []
    path = VAULT_SECRET_PATH.strip("/")
    paths_to_try.append(f"{VAULT_ADDR}/v1/{path}")
    
    if "/data/" not in path:
        parts = path.split("/", 1)
        if len(parts) == 2:
            paths_to_try.append(f"{VAULT_ADDR}/v1/{parts[0]}/data/{parts[1]}")
    else:
        parts = path.split("/data/", 1)
        if len(parts) == 2:
            paths_to_try.append(f"{VAULT_ADDR}/v1/{parts[0]}/{parts[1]}")

    for url in paths_to_try:
        try:
            logger.info(f"Attempting to load Vault secrets from: {url}")
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code == 200:
                data_json = response.json()
                # Check for KV v2 structure
                if "data" in data_json and isinstance(data_json["data"], dict) and "data" in data_json["data"]:
                    _vault_cache = data_json["data"]["data"]
                    logger.info(f"Successfully loaded {len(_vault_cache)} secrets from Vault KV v2.")
                    _vault_loaded = True
                    return _vault_cache
                # Check for KV v1 structure
                elif "data" in data_json and isinstance(data_json["data"], dict):
                    _vault_cache = data_json["data"]
                    logger.info(f"Successfully loaded {len(_vault_cache)} secrets from Vault KV v1.")
                    _vault_loaded = True
                    return _vault_cache
            else:
                logger.warning(f"Vault request to {url} returned status {response.status_code}: {response.text}")
        except Exception as e:
            logger.warning(f"Failed to fetch secrets from Vault at {url}: {e}")

    logger.warning("Could not fetch secrets from Vault. Falling back to environment variables.")
    _vault_loaded = True
    return _vault_cache

def get_secret(key: str, default=None):
    secrets = load_vault_secrets()
    if key in secrets and secrets[key] is not None:
        return secrets[key]
    return os.getenv(key, default)
