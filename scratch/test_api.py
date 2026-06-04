import httpx

def main():
    url = "http://backend.kubi.kontactless.in/health"
    print(f"Calling {url}...")
    try:
        res = httpx.get(url, timeout=5.0)
        print(f"Response: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Error calling backend: {e}")

if __name__ == "__main__":
    main()
