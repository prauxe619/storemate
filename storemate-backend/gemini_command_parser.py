import json
import os
import logging
import re

from google import genai
from google.genai import types
from dotenv import load_dotenv


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

logger = logging.getLogger(__name__)


# ============================================================
# GEMINI CLIENT
# ============================================================

# Prefer GEMINI_API_KEY.
# Keep GOOGLE_API_KEY as a fallback because some environments
# may already have it configured.
GEMINI_API_KEY = (
    os.environ.get("GEMINI_API_KEY")
    or os.environ.get("GOOGLE_API_KEY")
)


if not GEMINI_API_KEY:

    logger.warning(
        "⚠️ GEMINI_API_KEY / GOOGLE_API_KEY is not configured"
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

Your job is ONLY to understand the instruction and return
structured JSON.

NEVER respond conversationally.

NEVER explain your answer.

NEVER perform a transaction.

NEVER invent missing information.

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
quantity = 1

"5 wala Tiger biscuit"

means:

product = Tiger biscuit
price_hint = 5
quantity = 1

"10 wala Parle G"
"10 wala Parle Ji"
"10 wala Parle Jee"

all refer to:

product = Parle G

price_hint must remain 10.

"100 wale basmati chawal"

means:

product = Basmati Rice
price_hint = 100
quantity = 1

============================================================
QUANTITY VS PRICE
============================================================

Price and quantity are different fields.

"50 wala chawal 5 kilo"

means:

product = Rice
price_hint = 50
quantity = 5
unit = KG

NOT:

quantity = 50

"2 packet 10 wala Parle Ji"

means:

product = Parle G
quantity = 2
unit = PACKET
price_hint = 10

NEVER treat the "wala" price as quantity.

============================================================
CRITICAL KHATA / UDHAR RULE
============================================================

COUNTR uses Khata for customer credit/account transactions.

If the user explicitly mentions a customer's:

- khata
- khate
- khaate
- udhaar
- udhar
- account
- hisab
- hisaab
- baki
- baaki
- credit account

then the command is a CUSTOMER ACCOUNT transaction.

IMPORTANT:

A product mentioned together with Khata is STILL a Khata
transaction.

Do NOT convert it into sale.create.

============================================================
KHATA PRODUCT TRANSACTION
============================================================

Example:

"Rahul ke khate mein 2 kg sugar daalo"

MUST become:

intent = khata.credit
customer_name = Rahul
product = Sugar
quantity = 2
unit = KG
payment_type = KHATA

NOT:

intent = sale.create

------------------------------------------------------------

Example:

"Rahul ke khate mein 2 packet 10 wala Parle Ji daalo"

MUST become:

intent = khata.credit
customer_name = Rahul
product = Parle G
quantity = 2
unit = PACKET
price_hint = 10
payment_type = KHATA

NOT:

intent = sale.create

------------------------------------------------------------

Example:

"Rahul ke account mein 5 kilo chawal likh do"

MUST become:

intent = khata.credit
customer_name = Rahul
product = Rice
quantity = 5
unit = KG
payment_type = KHATA

------------------------------------------------------------

Example:

"Mohan ke udhaar mein ek 10 wala biscuit de do"

MUST become:

intent = khata.credit
customer_name = Mohan
quantity = 1
price_hint = 10
payment_type = KHATA

============================================================
MONEY ONLY KHATA
============================================================

If there is no product and the user says to put money into
someone's Khata:

"Rahul ke khate mein paanch sau rupaye daalo"

means:

intent = khata.credit
customer_name = Rahul
amount = 500
payment_type = KHATA

Do NOT create a sale.

------------------------------------------------------------

"Devendra ke khate mein dedh sau rupaye daalo"

means:

intent = khata.credit
customer_name = Devendra
amount = 150
payment_type = KHATA

============================================================
PAYMENT RECEIVED
============================================================

If money is received FROM a customer, this is different.

Examples:

"Rahul se 500 jama hue"

"Rahul ne 500 rupaye diye"

"Rahul se paanch sau mil gaye"

means:

intent = khata.payment
customer_name = Rahul
amount = 500

Do NOT treat this as a new sale.

============================================================
NORMAL SALE
============================================================

A normal sale without Khata/account language uses:

intent = sale.create

Examples:

"10 wala Parle Ji"

means:

intent = sale.create
product = Parle G
quantity = 1
price_hint = 10

------------------------------------------------------------

"50 wala chawal 5 kilo"

means:

intent = sale.create
product = Rice
quantity = 5
unit = KG
price_hint = 50

------------------------------------------------------------

"2 kg sugar"

means:

intent = sale.create
product = Sugar
quantity = 2
unit = KG

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

------------------------------------------------------------

"Parle G kitna bacha hai"

means:

intent = query.inventory
product = Parle G

------------------------------------------------------------

"Aaj ki sale kitni hui"

means:

intent = query.sales

============================================================
PRODUCT NAME NORMALIZATION
============================================================

Understand:

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

basmati chawal
basmati rice

→ Basmati Rice

IMPORTANT:

Do NOT change Basmati Rice into generic Rice.

============================================================
LOCAL HINT
============================================================

COUNTR may provide a local_interpretation.

This is generated by a deterministic local parser.

The local interpretation is strong evidence.

If local_interpretation says:

intent = khata.credit

and the spoken command explicitly contains Khata,
account, Udhaar or similar wording:

PRESERVE:

intent = khata.credit

Do not change it to sale.create.

However, Gemini should still correct the local interpretation
if the spoken command clearly contradicts it.

============================================================
AMBIGUITY
============================================================

If the command is genuinely ambiguous and intent cannot
be determined reliably:

intent = unknown

Do NOT guess sale.create.

Do NOT invent a customer.

Do NOT invent a price.

Do NOT invent quantity.

============================================================
OUTPUT
============================================================

Return ONLY one JSON object.

The object MUST contain:

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
# TEXT NORMALIZATION
# ============================================================

def _normalize_text(value):
    """
    Normalize spoken Hindi / Hinglish text for deterministic
    safety checks.

    This does NOT attempt to understand the whole command.
    It only detects explicit account / Khata language.
    """

    if value is None:
        return ""

    text = str(value)

    text = (
        text
        .replace("’", "'")
        .replace("‘", "'")
        .replace("\u00a0", " ")
    )

    text = text.lower().strip()

    # Collapse whitespace.
    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text


# ============================================================
# KHATA CONTEXT DETECTION
# ============================================================

def _contains_khata_context(text):
    """
    Detect explicit customer-account language.

    Examples:

        Rahul ke khate mein
        Rahul ke khate me
        Rahul ke account mein
        Rahul ke account me
        Rahul ke udhaar mein
        Rahul ke udhar mein
        Rahul ke hisaab mein
    """

    text = _normalize_text(text)

    if not text:
        return False

    patterns = [

        # Khata
        r"\bkhata\b",
        r"\bkhate\b",
        r"\bkhaate\b",

        # Udhaar
        r"\budhaar\b",
        r"\budhar\b",

        # Account
        r"\baccount\b",

        # Hisaab
        r"\bhisab\b",
        r"\bhisaab\b",

        # Balance / baki context
        r"\bbaki\b",
        r"\bbaaki\b",

        # English credit account phrases
        r"\bon credit\b",
        r"\bon account\b",
        r"\bcredit account\b",
    ]

    return any(
        re.search(
            pattern,
            text
        )
        for pattern in patterns
    )


# ============================================================
# KHATA CREDIT DETECTION
# ============================================================

def _looks_like_khata_credit(text):
    """
    Detect whether an explicit Khata/account command is
    adding a sale/product/amount to the customer's account.

    This is deliberately conservative.
    """

    text = _normalize_text(text)

    if not text:
        return False

    if not _contains_khata_context(text):
        return False

    # Words commonly used when adding a transaction to Khata.
    credit_patterns = [

        r"\bdaalo\b",
        r"\bdalo\b",

        r"\bdaal do\b",
        r"\bdal do\b",

        r"\blikho\b",
        r"\blikh\b",
        r"\blikh do\b",
        r"\blikh dena\b",
        r"\blikh dena\b",

        r"\bjod do\b",
        r"\bjod\b",

        r"\bjama\b",
        r"\bchadha do\b",
        r"\bchadha\b",

        r"\bde do\b",
        r"\bde dena\b",
        r"\bdena\b",
        r"\bdo\b",

        r"\badd\b",
        r"\bcredit\b",

        # Common spoken constructions.
        r"\bmein daal\b",
        r"\bme daal\b",
        r"\bmein likh\b",
        r"\bme likh\b",

    ]

    return any(
        re.search(
            pattern,
            text
        )
        for pattern in credit_patterns
    )


# ============================================================
# KHATA PAYMENT DETECTION
# ============================================================

def _looks_like_khata_payment(text):
    """
    Detect money received from a customer.

    Examples:

        Rahul se 500 rupaye jama hue
        Rahul ne 500 rupaye diye
        Rahul se paanch sau mil gaye
    """

    text = _normalize_text(text)

    if not text:
        return False

    payment_patterns = [

        r"\bse\b.*\bjama\b",
        r"\bse\b.*\bmil\b",
        r"\bse\b.*\bmile\b",
        r"\bse\b.*\bmil gaye\b",
        r"\bse\b.*\bmil gaya\b",

        r"\bne\b.*\bdiya\b",
        r"\bne\b.*\bdiye\b",
        r"\bne\b.*\bdi\b",

        r"\bpayment\b",
        r"\bpayment received\b",
        r"\bpaise mile\b",
        r"\bpaise mil gaye\b",

    ]

    return any(
        re.search(
            pattern,
            text
        )
        for pattern in payment_patterns
    )


# ============================================================
# MONEY / PRODUCT FIELD HELPERS
# ============================================================

def _has_value(value):
    return (
        value is not None
        and value != ""
    )


def _safe_number(value):
    """
    Convert numeric fields to int/float where possible.
    Preserve None when unavailable.
    """

    if not _has_value(value):
        return None

    try:

        number = float(value)

        if number.is_integer():
            return int(number)

        return number

    except (
        TypeError,
        ValueError,
    ):

        return None


# ============================================================
# DETERMINISTIC KHATA SAFETY LAYER
# ============================================================

def _apply_khata_safety(
    result,
    text,
    local_hint=None,
):
    """
    Deterministic business-rule protection.

    Gemini understands language.
    This function protects COUNTR transaction semantics.

    IMPORTANT:
    Explicit Khata / Udhaar / account context has priority
    over Gemini's sale.create interpretation.
    """

    if not isinstance(result, dict):
        return result

    local_hint = (
        local_hint
        if isinstance(local_hint, dict)
        else {}
    )

    normalized_text = _normalize_text(text)

    explicit_khata = _contains_khata_context(
        normalized_text
    )

    local_intent = local_hint.get("intent")

    result_intent = result.get("intent")

    customer_name = result.get(
        "customer_name"
    )

    product = result.get(
        "product"
    )

    amount = result.get(
        "amount"
    )

    # ========================================================
    # RULE 1
    # EXPLICIT KHATA + CUSTOMER + PRODUCT
    # ========================================================

    if (
        explicit_khata
        and customer_name
        and product
    ):

        # A product transaction explicitly targeted at
        # someone's Khata is a credit transaction.

        result["intent"] = "khata.credit"

        result["payment_type"] = "KHATA"

        logger.info(
            "🛡️ COUNTR Khata Safety: "
            "forced product transaction to khata.credit | "
            "customer=%s product=%s",
            customer_name,
            product,
        )

        return result


    # ========================================================
    # RULE 2
    # EXPLICIT KHATA + CUSTOMER + AMOUNT
    # ========================================================

    if (
        explicit_khata
        and customer_name
        and amount is not None
    ):

        result["intent"] = "khata.credit"

        result["payment_type"] = "KHATA"

        logger.info(
            "🛡️ COUNTR Khata Safety: "
            "forced money transaction to khata.credit | "
            "customer=%s amount=%s",
            customer_name,
            amount,
        )

        return result


    # ========================================================
    # RULE 3
    # LOCAL PARSER ALREADY FOUND KHATA
    # ========================================================

    if (
        explicit_khata
        and local_intent in {
            "khata.credit",
            "khata.debit",
            "khata.payment",
        }
    ):

        # Do not allow Gemini to downgrade a strong local
        # Khata interpretation to sale.create.

        if result_intent == "sale.create":

            result["intent"] = local_intent

        result["payment_type"] = "KHATA"

        logger.info(
            "🛡️ COUNTR Local Hint Protection: "
            "%s",
            local_intent,
        )

        return result


    # ========================================================
    # RULE 4
    # EXPLICIT KHATA + GEMINI SALE
    #
    # This is the exact bug we are fixing.
    # ========================================================

    if (
        explicit_khata
        and result_intent == "sale.create"
    ):

        result["intent"] = "khata.credit"

        result["payment_type"] = "KHATA"

        logger.info(
            "🛡️ COUNTR Khata Safety: "
            "Gemini sale.create overridden → khata.credit"
        )

        return result


    # ========================================================
    # RULE 5
    # ALL KHATA INTENTS MUST HAVE KHATA PAYMENT TYPE
    # ========================================================

    if result.get("intent") in {
        "khata.credit",
        "khata.debit",
        "khata.payment",
    }:

        result["payment_type"] = "KHATA"


    return result


# ============================================================
# NORMALIZE GEMINI RESULT
# ============================================================

def normalize_gemini_result(
    result,
    text=None,
    local_hint=None,
):
    """
    Convert Gemini's response into the exact structure
    expected by COUNTR.

    The deterministic Khata safety layer is applied before
    the result reaches the mobile application.
    """

    if not isinstance(
        result,
        dict
    ):

        raise ValueError(
            "Gemini response must be an object"
        )


    # --------------------------------------------------------
    # SAFETY LAYER
    # --------------------------------------------------------

    result = _apply_khata_safety(

        result=result,

        text=text or "",

        local_hint=local_hint,

    )


    # --------------------------------------------------------
    # INTENT
    # --------------------------------------------------------

    intent = result.get(
        "intent"
    )


    if intent not in ALLOWED_INTENTS:

        intent = "unknown"


    # --------------------------------------------------------
    # CONFIDENCE
    # --------------------------------------------------------

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
        ValueError,
    ):

        confidence = 0


    confidence = max(
        0,
        min(
            1,
            confidence
        )
    )


    # --------------------------------------------------------
    # NUMERIC FIELDS
    # --------------------------------------------------------

    quantity = _safe_number(
        result.get(
            "quantity"
        )
    )


    amount = _safe_number(
        result.get(
            "amount"
        )
    )


    price_hint = _safe_number(
        result.get(
            "price_hint"
        )
    )


    new_price = _safe_number(
        result.get(
            "new_price"
        )
    )


    discount_percent = _safe_number(
        result.get(
            "discount_percent"
        )
    )


    # --------------------------------------------------------
    # PAYMENT TYPE
    # --------------------------------------------------------

    payment_type = result.get(
        "payment_type"
    )


    if (
        intent in {
            "khata.credit",
            "khata.debit",
            "khata.payment",
        }
    ):

        payment_type = "KHATA"


    elif payment_type:

        payment_type = (
            str(payment_type)
            .strip()
            .upper()
        )


    # --------------------------------------------------------
    # PRODUCT
    # --------------------------------------------------------

    product = result.get(
        "product"
    )


    if isinstance(
        product,
        str
    ):

        product = product.strip()

        if not product:
            product = None


    # --------------------------------------------------------
    # CUSTOMER
    # --------------------------------------------------------

    customer_name = result.get(
        "customer_name"
    )


    if isinstance(
        customer_name,
        str
    ):

        customer_name = (
            customer_name.strip()
        )

        if not customer_name:
            customer_name = None


    # --------------------------------------------------------
    # UNIT
    # --------------------------------------------------------

    unit = result.get(
        "unit"
    )


    if isinstance(
        unit,
        str
    ):

        unit = unit.strip()

        if not unit:
            unit = None


    # --------------------------------------------------------
    # FINAL STRUCTURE
    # --------------------------------------------------------

    return {

        "intent":
            intent,

        "product":
            product,

        "quantity":
            quantity,

        "unit":
            unit,

        "price_hint":
            price_hint,

        "amount":
            amount,

        "new_price":
            new_price,

        "discount_percent":
            discount_percent,

        "customer_name":
            customer_name,

        "payment_type":
            payment_type,

        "confidence":
            confidence,

        "source":
            "GEMINI_AI",

    }


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

    Gemini interprets the command.

    Gemini does NOT execute anything.

    The result is passed through the deterministic COUNTR
    safety/normalization layer before being returned.
    """

    if not gemini_client:

        raise RuntimeError(
            "GEMINI_API_KEY / GOOGLE_API_KEY is not configured"
        )


    # --------------------------------------------------------
    # INPUT NORMALIZATION
    # --------------------------------------------------------

    text = (
        str(text or "")
        .strip()
    )


    if not text:

        raise ValueError(
            "Voice command is empty"
        )


    inventory_names = (

        inventory_names

        if isinstance(
            inventory_names,
            list
        )

        else []

    )


    customer_names = (

        customer_names

        if isinstance(
            customer_names,
            list
        )

        else []

    )


    local_hint = (

        local_hint

        if isinstance(
            local_hint,
            dict
        )

        else {}

    )


    # --------------------------------------------------------
    # GEMINI CONTEXT
    # --------------------------------------------------------

    payload = {

        "user_command":
            text,

        "known_inventory":
            inventory_names[:2000],

        "known_customers":
            customer_names[:1000],

        "local_interpretation":
            local_hint,

    }


    user_prompt = f"""
Understand this COUNTR shopkeeper voice command.

IMPORTANT:

The local_interpretation is generated by COUNTR's local
deterministic parser.

Use it as strong evidence.

If the spoken command contains explicit Khata/account/Udhaar
language, a product transaction belongs to Khata.

Do NOT convert:

"Rahul ke khate mein 2 kilo sugar daalo"

into sale.create.

It must be:

khata.credit

Context:

{json.dumps(
    payload,
    ensure_ascii=False,
    indent=2,
)}

Return ONLY the required JSON.
"""


    # --------------------------------------------------------
    # CALL GEMINI
    # --------------------------------------------------------

    try:

        response = (
            gemini_client
            .models
            .generate_content(

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
                        ],
                    }
                ],

                config=types.GenerateContentConfig(

                    temperature=0.1,

                    response_mime_type=
                        "application/json",

                ),

            )
        )


        # ----------------------------------------------------
        # RESPONSE TEXT
        # ----------------------------------------------------

        raw_text = (

            response.text

            if response

            else ""

        )


        if not raw_text:

            raise ValueError(
                "Gemini returned empty response"
            )


        # ----------------------------------------------------
        # JSON PARSE
        # ----------------------------------------------------

        try:

            result = json.loads(
                raw_text
            )

        except json.JSONDecodeError as exc:

            logger.error(
                "Gemini returned invalid JSON: %s",
                raw_text,
            )

            raise ValueError(
                "Gemini returned invalid JSON"
            ) from exc


        # ----------------------------------------------------
        # OBJECT VALIDATION
        # ----------------------------------------------------

        if not isinstance(
            result,
            dict
        ):

            raise ValueError(
                "Gemini response is not an object"
            )


        # ----------------------------------------------------
        # FINAL NORMALIZATION + SAFETY
        # ----------------------------------------------------

        return normalize_gemini_result(

            result=result,

            text=text,

            local_hint=local_hint,

        )


    except Exception as exc:

        logger.exception(
            "Gemini command parsing failed"
        )

        raise exc