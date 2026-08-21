import json
import os
import logging
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


# ============================================================
# GEMINI CLIENT
# ============================================================

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    logger.warning(
        "⚠️ GEMINI_API_KEY is not configured"
    )
    gemini_client = None
else:
    gemini_client = genai.Client(
        api_key=GEMINI_API_KEY
    )


# ============================================================
# MODEL
# ============================================================

GEMINI_MODEL = "gemini-2.5-flash"


# ============================================================
# ALLOWED INTENTS
# ============================================================

ALLOWED_INTENTS = [

    "sale.create",

    "khata.credit",
    "khata.debit",
    "khata.payment",

    "customer.create",

    "inventory.add",
    "inventory.update",
    "inventory.update_price",

    "query.inventory",
    "query.sales",
    "query.khata",

    "pos.apply_discount",
    "pos.checkout",

    "expense.create",

    "unknown",
]


# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are COUNTR's voice-command understanding engine.

COUNTR is an Indian retail / kirana shop POS application.

The shopkeeper speaks naturally in:

- Hindi
- English
- Hinglish
- phonetic Hindi written in English
- mixed Hindi + English

The user does NOT want a conversation.

The user is giving an instruction.

Your job is ONLY to understand the instruction and return structured JSON.

NEVER respond conversationally.

NEVER explain your answer.

NEVER invent missing information.

NEVER perform a transaction.

NEVER assume a product price if the user did not specify it.

============================================================
LANGUAGE UNDERSTANDING
============================================================

Understand examples such as:

"paanch sau"
"sau"
"dedh sau"
"dhai sau"
"ek hazaar"
"paanch kilo"
"do packet"

Interpret:

sau = 100
paanch sau = 500
dedh sau = 150
dhai sau = 250
ek hazaar = 1000

============================================================
PRODUCT PRICE VARIANTS
============================================================

"WALA" price means the selling-price variant.

Examples:

"10 wala Kurkure"

means:

product = Kurkure
price_hint = 10

"5 wala Tiger biscuit"

means:

product = Tiger biscuit
price_hint = 5

"10 wala Parle G"
"10 wala Parle Ji"
"10 wala Parle Jee"

all refer to the same product concept:

Parle G

but price_hint must remain 10.

"100 wale basmati chawal"

means:

product = Basmati Rice
price_hint = 100

============================================================
QUANTITY VS PRICE
============================================================

These are different.

"50 wala chawal 5 kilo"

means:

price_hint = 50
quantity = 5
unit = KG

NOT:

quantity = 50

Similarly:

"2 packet 10 wala Parle Ji"

means:

quantity = 2
unit = PACKET
price_hint = 10

============================================================
KHATA
============================================================

If the user explicitly mentions:

khata
khate
udhaar
udhar
account

then understand the transaction as a customer-account transaction.

Examples:

"Rahul ke khate mein 2 kg sugar daalo"

means:

intent = sale.create
customer_name = Rahul
product = Sugar
quantity = 2
unit = KG
payment_type = KHATA

"Rahul ke khate mein 2 packet 10 wala Parle Ji daalo"

means:

intent = sale.create
customer_name = Rahul
product = Parle G
quantity = 2
unit = PACKET
price_hint = 10
payment_type = KHATA

============================================================
MONEY ONLY KHATA
============================================================

If there is no product and the user says to put money into
someone's khata:

"Rahul ke khate mein paanch sau rupaye daalo"

means:

intent = khata.credit
customer_name = Rahul
amount = 500

Do NOT create a sale.

============================================================
PAYMENT RECEIVED
============================================================

Examples:

"Rahul se 500 jama hue"

"Rahul ne 500 rupaye diye"

"Rahul se paanch sau mil gaye"

means money was received from Rahul.

Use:

intent = khata.payment

customer_name = Rahul

amount = 500

============================================================
INVENTORY
============================================================

"2 kg sugar stock mein daalo"

means:

intent = inventory.add

product = Sugar

quantity = 2

unit = KG

============================================================
QUERIES
============================================================

"Rahul ka khata kitna hai"

means:

intent = query.khata

customer_name = Rahul

"Parle G kitna bacha hai"

means:

intent = query.inventory

product = Parle G

"आज की बिक्री कितनी हुई"

means:

intent = query.sales

============================================================
IMPORTANT SAFETY RULE
============================================================

If the command is ambiguous and you cannot determine the
intent reliably:

intent = unknown

Do NOT guess sale.create.

Do NOT guess a customer.

Do NOT guess a price.

Do NOT guess a quantity.

============================================================
PRODUCT NAME NORMALIZATION
============================================================

Understand common spoken variants:

Parle Ji
Parle Jee
Parle G

→ Parle G

shakkar
chini
cheeni

→ Sugar

chawal
rice

→ Rice

but DO NOT change:

Basmati Rice

into generic Rice.

============================================================
OUTPUT
============================================================

Return ONLY the JSON object.

The object must contain:

intent
product
quantity
unit
price_hint
amount
new_price
discount_percent
customer_name
payment_type
confidence

Use null when a field does not apply.

confidence must be between 0 and 1.

Allowed intents:

""" + ", ".join(ALLOWED_INTENTS)


# ============================================================
# GEMINI PARSER
# ============================================================

def parse_with_gemini(
    text,
    inventory_names=None,
    customer_names=None,
    local_hint=None,
):
    """
    Parse an ambiguous voice command using Gemini.

    Gemini ONLY interprets the command.
    It does not execute anything.
    """

    if not gemini_client:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured"
        )


    inventory_names = (
        inventory_names
        if isinstance(inventory_names, list)
        else []
    )

    customer_names = (
        customer_names
        if isinstance(customer_names, list)
        else []
    )


    local_hint = (
        local_hint
        if isinstance(local_hint, dict)
        else {}
    )


    payload = {

        "user_command": text,

        "known_inventory": inventory_names[:2000],

        "known_customers": customer_names[:1000],

        "local_interpretation": local_hint,

    }


    user_prompt = f"""
Understand this COUNTR shopkeeper voice command.

Context:

{json.dumps(
    payload,
    ensure_ascii=False
)}

Return ONLY the required JSON.
"""


    try:

        response = gemini_client.models.generate_content(

            model=GEMINI_MODEL,

            contents=[
                {
                    "role": "user",
                    "parts": [
                        {
                            "text":
                                SYSTEM_PROMPT
                                + "\n\n"
                                + user_prompt
                        }
                    ]
                }
            ],

            config=types.GenerateContentConfig(

                temperature=0.1,

                response_mime_type="application/json",

            ),
        )


        raw_text = (
            response.text
            if response
            else ""
        )


        if not raw_text:
            raise ValueError(
                "Gemini returned empty response"
            )


        result = json.loads(
            raw_text
        )


        if not isinstance(
            result,
            dict
        ):
            raise ValueError(
                "Gemini response is not an object"
            )


        return normalize_gemini_result(
            result
        )


    except Exception as exc:

        logger.exception(
            "Gemini command parsing failed"
        )

        raise exc


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_gemini_result(result):

    intent = result.get(
        "intent"
    )

    if intent not in ALLOWED_INTENTS:
        intent = "unknown"


    confidence = result.get(
        "confidence",
        0
    )

    try:

        confidence = float(
            confidence
        )

    except (
        TypeError,
        ValueError
    ):

        confidence = 0


    confidence = max(
        0,
        min(
            1,
            confidence
        )
    )


    quantity = result.get(
        "quantity"
    )

    amount = result.get(
        "amount"
    )

    price_hint = result.get(
        "price_hint"
    )

    new_price = result.get(
        "new_price"
    )

    discount_percent = result.get(
        "discount_percent"
    )


    payment_type = result.get(
        "payment_type"
    )


    if (
        intent in {
            "khata.credit",
            "khata.debit",
            "khata.payment",
        }
        and not payment_type
    ):

        payment_type = "KHATA"


    return {

        "intent":
            intent,

        "product":
            result.get(
                "product"
            ),

        "quantity":
            quantity,

        "unit":
            result.get(
                "unit"
            ),

        "price_hint":
            price_hint,

        "amount":
            amount,

        "new_price":
            new_price,

        "discount_percent":
            discount_percent,

        "customer_name":
            result.get(
                "customer_name"
            ),

        "payment_type":
            payment_type,

        "confidence":
            confidence,

        "source":
            "GEMINI_AI",

    }