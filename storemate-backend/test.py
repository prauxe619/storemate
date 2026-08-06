import os
from dotenv import load_dotenv
from google import genai

print("=" * 70)
print("🧪 StoreMate Environment Test")
print("=" * 70)

# Load .env
load_dotenv()

# Read API Key
api_key = os.getenv("GOOGLE_API_KEY")

print(f"Current Working Directory : {os.getcwd()}")
print(f".env Loaded              : {api_key is not None}")

if api_key:
    print(f"API Key Starts With      : {api_key[:10]}...")
    print(f"API Key Length           : {len(api_key)}")
else:
    print("❌ GOOGLE_API_KEY NOT FOUND")
    exit()

print("-" * 70)

try:
    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Reply with exactly: StoreMate Environment OK"
    )

    print("✅ Gemini Connection Successful")
    print("Gemini Response:")
    print(response.text)

except Exception as e:
    print("❌ Gemini Connection Failed")
    print(type(e).__name__)
    print(e)

print("=" * 70)