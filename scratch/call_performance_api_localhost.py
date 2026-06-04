import httpx

def main():
    email = "shubham@gmail.com"
    password = "12345679@mE"
    
    login_url = "http://localhost:8000/api/auth/login"
    print(f"Logging in to {login_url}...")
    try:
        login_res = httpx.post(login_url, json={"email": email, "password": password}, timeout=5.0)
        print(f"Login Response: {login_res.status_code}")
        if login_res.status_code != 200:
            print(f"Login failed: {login_res.text}")
            return
        
        login_data = login_res.json()
        token = login_data.get("access_token")
        print("Login successful! Got token.")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        stats_url = "http://localhost:8000/api/stats"
        print(f"\nCalling {stats_url}...")
        stats_res = httpx.get(stats_url, headers=headers, timeout=5.0)
        print(f"Stats Response: {stats_res.status_code}")
        print(stats_res.json())
        
        perf_url = "http://localhost:8000/api/stats/performance"
        print(f"\nCalling {perf_url}...")
        perf_res = httpx.get(perf_url, headers=headers, timeout=5.0)
        print(f"Performance Response: {perf_res.status_code}")
        print(perf_res.json())
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
