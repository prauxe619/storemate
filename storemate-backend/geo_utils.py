import requests

def get_client_ip(request):
    """
    Extracts the real client IP address, even behind Nginx, cloud proxies, or local networks.
    """
    x_forwarded_for = request.headers.get('X-Forwarded-For')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.remote_addr
    return ip

def resolve_ip_location(ip_address):
    """
    Resolves an IP address to City, State (Region), and Country using a lightweight, non-blocking lookup.
    """
    # 1. Development / Private IP handling
    if not ip_address or ip_address in ['127.0.0.1', 'localhost'] or ip_address.startswith(('192.168.', '10.', '172.')):
        return {
            "city": "Gurgaon",
            "state": "Haryana",
            "country": "India",
            "is_local_dev": True
        }

    # 2. Public IP Lookup (Fast 2-second timeout to prevent API lag)
    try:
        url = f"http://ip-api.com/json/{ip_address}?fields=status,city,regionName,country"
        response = requests.get(url, timeout=2.0)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'success':
                return {
                    "city": data.get("city", "Unknown City"),
                    "state": data.get("regionName", "Unknown State"),
                    "country": data.get("country", "India"),
                    "is_local_dev": False
                }
    except Exception as e:
        print(f"⚠️ GeoIP Lookup Timeout or Failure: {e}")

    return {"city": "Unknown City", "state": "Unknown State", "country": "India", "is_local_dev": False}