import ipaddress
import requests


def get_client_ip(request):
    """
    Get the original client IP when the app is behind Railway/proxies.
    """

    # Railway/proxy normally provides X-Forwarded-For.
    x_forwarded_for = request.headers.get("X-Forwarded-For")

    if x_forwarded_for:
        # First IP is generally the original client.
        return x_forwarded_for.split(",")[0].strip()

    return request.remote_addr


def is_private_or_local_ip(ip_address):
    """
    Safely determine whether an IP is private/local.
    """

    if not ip_address:
        return True

    try:
        ip = ipaddress.ip_address(ip_address)

        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
        )

    except ValueError:
        return True


def resolve_ip_location(ip_address):
    """
    Resolve public IP to city, state and country.

    Returns quickly if the IP is private/local.
    """

    # Development / private network
    if is_private_or_local_ip(ip_address):
        return {
            "city": "Local",
            "state": "Local",
            "country": "Local",
            "is_local_dev": True
        }

    try:
        url = (
            f"https://ip-api.com/json/{ip_address}"
            "?fields=status,city,regionName,country"
        )

        response = requests.get(
            url,
            timeout=2.0
        )

        if response.status_code == 200:

            data = response.json()

            if data.get("status") == "success":
                return {
                    "city": data.get("city") or "Unknown City",
                    "state": data.get("regionName") or "Unknown State",
                    "country": data.get("country") or "Unknown Country",
                    "is_local_dev": False
                }

    except requests.RequestException as e:
        print(f"⚠️ GeoIP lookup failed: {e}")

    except Exception as e:
        print(f"⚠️ GeoIP unexpected error: {e}")

    return {
        "city": "Unknown City",
        "state": "Unknown State",
        "country": "Unknown Country",
        "is_local_dev": False
    }