import os
import re
import json
import logging
from rapidfuzz import process, fuzz

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.5


# ===========================================================================
# HINGLISH & PHONETIC DICTIONARY
# ===========================================================================

SYNONYMS = {

    # -----------------------------------------------------------------------
    # Sell / Billing
    # -----------------------------------------------------------------------

    "cell": "sell",
    "sel": "sell",
    "sal": "sell",
    "sall": "sell",
    "sale": "sell",

    "becho": "sell",
    "bechi": "sell",
    "de do": "sell",
    "bikri": "sell",
    "bill": "sell",

    # -----------------------------------------------------------------------
    # Add / Inventory
    # -----------------------------------------------------------------------

    "jodo": "add",
    "daalo": "add",
    "dalo": "add",
    "bhandar": "add",
    "stock": "add",
    "ad": "add",
    "plus": "add",

    # -----------------------------------------------------------------------
    # Khata
    # -----------------------------------------------------------------------

    "udhaar": "khata",
    "udhar": "khata",
    "baki": "khata",
    "khaata": "khata",
    "khatas": "khata",

    "nagad": "cash",
    "rokar": "cash",
    "naqad": "cash",

    # -----------------------------------------------------------------------
    # Payment
    # -----------------------------------------------------------------------

    "jama": "received",
    "diye": "received",
    "diya": "received",
    "pay": "received",
    "paid": "received",
    "receive": "received",
    "mil": "received",
    "mile": "received",

    # -----------------------------------------------------------------------
    # Hindi Numbers
    # -----------------------------------------------------------------------

    "ek": "1",
    "do": "2",
    "teen": "3",
    "char": "4",
    "chaar": "4",
    "panch": "5",
    "paanch": "5",
    "chhe": "6",
    "che": "6",
    "saat": "7",
    "aath": "8",
    "nau": "9",
    "das": "10",

    # -----------------------------------------------------------------------
    # Product Synonyms
    # -----------------------------------------------------------------------

    "shakkar": "sugar",
    "chini": "sugar",
    "cheeni": "sugar",

    "tel": "oil",
    "tail": "oil",
    "oils": "oil",

    "dal": "daal",
    "daal": "daal",
}


SALES_QUERY_PHRASES = [
    "today sale",
    "aaj ki bikri",
    "kitna bika",
    "sale today",
    "sales today",
    "bikri kitni",
]


KHATA_QUERY_PHRASES = [
    "kitna baki",
    "balance",
    "how much owe",
    "kitna dena",
    "kitna udhar",
    "kitna udhaar",
    "bacha hai",
]


ACCOUNT_CREATE_PHRASES = [
    "create account",
    "new account",
    "make account",
    "open account",
    "create customer",
    "new customer",
    "add customer",
    "make customer",
    "open customer",
    "naya customer",
    "customer banao",
    "customer bana do",
    "naya khata",
    "khata bnao",
    "khata banao",
    "khata bana do",
    "account banao",
    "account bana do",
    "account kholo",
    "account khol do",
]


# ===========================================================================
# NORMALIZATION HELPERS
# ===========================================================================

def _normalize_possessives(text: str) -> str:
    return re.sub(r"'s\b", "", text)


def _normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _normalize_unit(unit):
    """
    Convert all spoken unit variants into COUNTR canonical units.
    """

    if not unit:
        return None

    unit = str(unit).strip().lower()

    unit_map = {

        # Weight
        "kg": "kg",
        "kgs": "kg",
        "kilo": "kg",
        "kilos": "kg",
        "kilogram": "kg",
        "kilograms": "kg",

        "g": "g",
        "gm": "g",
        "gms": "g",
        "gram": "g",
        "grams": "g",

        # Liquid
        "l": "liter",
        "ltr": "liter",
        "litre": "liter",
        "liter": "liter",
        "litres": "liter",
        "liters": "liter",

        "ml": "ml",
        "milliliter": "ml",
        "millilitre": "ml",

        # Quantity
        "pcs": "pcs",
        "pc": "pcs",
        "piece": "pcs",
        "pieces": "pcs",

        "pack": "packet",
        "packet": "packet",
        "packets": "packet",

        "can": "can",
        "cans": "can",

        "bottle": "bottle",
        "bottles": "bottle",
    }

    return unit_map.get(unit, unit)


# ===========================================================================
# RESULT CONTRACT
# ===========================================================================

def _result(
    intent,
    confidence,
    product=None,
    qty=1,
    unit=None,
    discount_percent=None,
    new_price=None,
    customer_name=None,
    time_period=None,
    source="rules",
    payment_type=None,
    price_hint=None,
    amount=None,
):
    """
    COUNTR canonical voice command result.

    IMPORTANT:

    Older code used:
        qty

    Mobile execution uses:
        quantity

    Therefore BOTH fields are intentionally returned.
    """

    # Normalize quantity
    quantity = qty

    if quantity is not None:

        try:
            quantity = float(quantity)

            if quantity.is_integer():
                quantity = int(quantity)

        except (TypeError, ValueError):
            quantity = None

    # Normalize unit
    unit = _normalize_unit(unit)

    # price_hint compatibility
    if price_hint is None:
        price_hint = new_price

    return {

        # ---------------------------------------------------------------
        # Intent
        # ---------------------------------------------------------------

        "intent": intent,

        # ---------------------------------------------------------------
        # Product
        # ---------------------------------------------------------------

        "product": product,

        # ---------------------------------------------------------------
        # Quantity
        # ---------------------------------------------------------------

        # Canonical mobile field
        "quantity": quantity,

        # Backward compatibility
        "qty": quantity,

        # ---------------------------------------------------------------
        # Unit
        # ---------------------------------------------------------------

        "unit": unit,

        # ---------------------------------------------------------------
        # Pricing
        # ---------------------------------------------------------------

        "price_hint": price_hint,

        "amount": amount,

        "discount_percent": discount_percent,

        "new_price": new_price,

        # ---------------------------------------------------------------
        # Customer
        # ---------------------------------------------------------------

        "customer_name": customer_name,

        # ---------------------------------------------------------------
        # Time
        # ---------------------------------------------------------------

        "time_period": time_period,

        # ---------------------------------------------------------------
        # Confidence
        # ---------------------------------------------------------------

        "confidence": confidence,

        # ---------------------------------------------------------------
        # Source
        # ---------------------------------------------------------------

        "source": source,

        # ---------------------------------------------------------------
        # Payment
        # ---------------------------------------------------------------

        "payment_type": payment_type,
    }


# ===========================================================================
# ACCOUNT CREATION
# ===========================================================================

def _extract_account_creation_customer(text_raw: str):

    text = _normalize_spaces(
        text_raw.lower()
    )

    patterns = [

        # create Ravi account
        r"^(?:create|make|open|add)\s+(?:an?\s+)?(.+?)\s+(?:account|customer|khata)$",

        # create account for Ravi
        r"^(?:create|make|open|add)\s+(?:an?\s+)?(?:account|customer|khata)\s+(?:for|of)\s+(.+)$",

        # new Ravi account
        r"^new\s+(.+?)\s+(?:account|customer|khata)$",

        # Ravi ka account banao
        r"^(.+?)\s+(?:ka|ke\s+naam\s+ka|ke\s+naam\s+ki|ke)\s+(?:account|khata|customer)\s+(?:banao|bnao|bana|bana\s+do|banado|khol(?:o)?|khol\s+do)$",

        # Ravi ka naya khata banao
        r"^(.+?)\s+(?:ka|ke\s+naam\s+ka|ke)\s+(?:naya\s+)?(?:account|khata|customer)\s+(?:banao|bnao|bana|bana\s+do|banado|khol(?:o)?|khol\s+do)$",
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:

            candidate = match.group(1).strip()

            candidate = re.sub(
                r"^(?:the|an|a|new)\s+",
                "",
                candidate,
                flags=re.IGNORECASE,
            ).strip()

            if candidate:
                return candidate.title()

    return None


# ===========================================================================
# MAIN RULE PARSER
# ===========================================================================

def parse_with_rules(
    text: str,
    inventory_names: list = None,
    customer_names: list = None,
):

    # -----------------------------------------------------------------------
    # Input safety
    # -----------------------------------------------------------------------

    if text is None:
        text = ""

    text_raw = _normalize_spaces(
        _normalize_possessives(
            str(text).lower()
        )
    )

    if not text_raw:
        return _result(
            intent="unknown",
            confidence=0.0,
            product=None,
            qty=None,
            unit=None,
            source="rules_local",
        )

    # -----------------------------------------------------------------------
    # Normalize spoken words
    # -----------------------------------------------------------------------

    words = text_raw.split()

    normalized_words = [
        SYNONYMS.get(w, w)
        for w in words
    ]

    text_clean = " ".join(
        normalized_words
    )

    combined = f"{text_raw} {text_clean}"

    # -----------------------------------------------------------------------
    # 1. Query intents
    # -----------------------------------------------------------------------

    if any(
        phrase in combined
        for phrase in SALES_QUERY_PHRASES
    ):

        return _result(
            "query.sales",
            confidence=0.95,
            time_period="today",
            source="rules_local",
        )

    if any(
        phrase in combined
        for phrase in KHATA_QUERY_PHRASES
    ):

        cust_match = re.search(
            r"(?:ka|ki|ke)?\s*"
            r"([a-zA-Z]+)\s*"
            r"(?:ka|ki|ke)?\s*"
            r"(?:baki|bacha|owe|khata)",
            text_raw,
        )

        c_name = (
            cust_match.group(1).title()
            if cust_match
            and cust_match.group(1)
            not in [
                "kitna",
                "udhar",
                "udhaar",
                "baki",
            ]
            else None
        )

        return _result(
            "query.khata",
            confidence=0.90,
            customer_name=c_name,
            source="rules_local",
        )

    # -----------------------------------------------------------------------
    # 2. Customer account creation
    # -----------------------------------------------------------------------

    account_customer = (
        _extract_account_creation_customer(
            text_raw
        )
    )

    if account_customer:

        return _result(
            "customer.create",
            confidence=0.98,
            customer_name=account_customer,
            product=None,
            qty=1,
            unit=None,
            source="rules_local",
        )

    # Existing exact/common phrases
    if any(
        phrase in combined
        for phrase in ACCOUNT_CREATE_PHRASES
    ):

        name_match = (
            re.search(
                r"^([a-zA-Z]+)\s+"
                r"(?:ka|ke\s+naam|ke\s+khate)",
                text_raw,
            )
            or
            re.search(
                r"(?:name|customer|account|of|for)\s+"
                r"([a-zA-Z]+)",
                text_raw,
            )
        )

        c_name = (
            name_match.group(1).title()
            if name_match
            else None
        )

        return _result(
            "customer.create",
            confidence=0.95,
            customer_name=c_name,
            product=None,
            qty=1,
            unit=None,
            source="rules_local",
        )

    # -----------------------------------------------------------------------
    # 3. Payment type
    # -----------------------------------------------------------------------

    payment_type = None

    if any(
        word in text_clean
        for word in [
            "khata",
            "udhaar",
            "udhar",
            "baki",
        ]
    ):

        payment_type = "KHATA"

    elif any(
        word in text_clean
        for word in [
            "cash",
            "nagad",
            "rokar",
        ]
    ):

        payment_type = "CASH"

    # -----------------------------------------------------------------------
    # 4. Quantity + Unit
    # -----------------------------------------------------------------------

    qty = 1
    unit = None

    # -----------------------------------------------------------------------
    # Explicit numeric quantity
    #
    # Examples:
    #   1 kg rice
    #   2 kilo rice
    #   500 g sugar
    #   3 packet Kurkure
    #   10 pcs Parle G
    # -----------------------------------------------------------------------

    qty_match = re.search(
        r"(\d+(?:\.\d+)?)"
        r"\s*"
        r"(kg|kgs|kilo|kilos|kilogram|kilograms|"
        r"g|gm|gms|gram|grams|"
        r"liter|litre|liters|litres|ltr|l|"
        r"ml|"
        r"pcs|pc|piece|pieces|"
        r"pack|packet|packets|"
        r"can|cans|"
        r"bottle|bottles)?"
        r"\b",
        text_clean,
        flags=re.IGNORECASE,
    )

    if qty_match:

        qty = float(
            qty_match.group(1)
        )

        if qty.is_integer():
            qty = int(qty)

        unit = _normalize_unit(
            qty_match.group(2)
        )

    # -----------------------------------------------------------------------
    # Hindi number fallback
    #
    # text_clean already converts:
    #
    # ek -> 1
    # do -> 2
    # teen -> 3
    # etc.
    # -----------------------------------------------------------------------

    # -----------------------------------------------------------------------
    # Spoken unit fallback
    # -----------------------------------------------------------------------

    if unit is None:

        unit_patterns = [

            (r"\bkg\b", "kg"),
            (r"\bkilo\b", "kg"),
            (r"\bkilos\b", "kg"),
            (r"\bkilogram\b", "kg"),
            (r"\bkilograms\b", "kg"),

            (r"\bgm\b", "g"),
            (r"\bgms\b", "g"),
            (r"\bgram\b", "g"),
            (r"\bgrams\b", "g"),
            (r"\bg\b", "g"),

            (r"\bliter\b", "liter"),
            (r"\blitre\b", "liter"),
            (r"\bliters\b", "liter"),
            (r"\blitres\b", "liter"),
            (r"\bltr\b", "liter"),

            (r"\bml\b", "ml"),

            (r"\bpacket\b", "packet"),
            (r"\bpackets\b", "packet"),
            (r"\bpack\b", "packet"),

            (r"\bpcs\b", "pcs"),
            (r"\bpc\b", "pcs"),
            (r"\bpiece\b", "pcs"),
            (r"\bpieces\b", "pcs"),

            (r"\bbottle\b", "bottle"),
            (r"\bbottles\b", "bottle"),

            (r"\bcan\b", "can"),
            (r"\bcans\b", "can"),
        ]

        for pattern, canonical_unit in unit_patterns:

            if re.search(
                pattern,
                text_clean,
                flags=re.IGNORECASE,
            ):

                unit = canonical_unit
                break

    # -----------------------------------------------------------------------
    # 5. Discount
    # -----------------------------------------------------------------------

    discount_match = re.search(
        r"(\d+(?:\.\d+)?)"
        r"\s*"
        r"(?:%|percent|pratishat|discount)",
        text_clean,
        flags=re.IGNORECASE,
    )

    discount_percent = (
        float(discount_match.group(1))
        if discount_match
        else None
    )

    # -----------------------------------------------------------------------
    # 6. Price update detection
    # -----------------------------------------------------------------------

    has_update_verb = (
        any(
            word in text_clean
            for word in [
                "update",
                "rate",
                "karo",
                "kar do",
            ]
        )
        and
        (
            "price" in text_clean
            or "rate" in text_clean
            or "daam" in text_clean
        )
    )

    price_match = re.search(
        r"(?:to|set|price|daam|rate|rs|rupees|₹)"
        r"\s*"
        r"(\d+(?:\.\d+)?)",
        text_clean,
        flags=re.IGNORECASE,
    )

    new_price = (
        float(price_match.group(1))
        if price_match and has_update_verb
        else None
    )

    # -----------------------------------------------------------------------
    # 7. Customer Name
    # -----------------------------------------------------------------------

    customer_name = None

    name_before_match = re.search(
        r"^([a-zA-Z]+)\s+"
        r"(?:ke\s+khate|ke\s+khata|ka\s+khata|"
        r"ka\s+naam|ko|mein|me|ne)",
        text_raw,
        flags=re.IGNORECASE,
    )

    if name_before_match:

        candidate = (
            name_before_match
            .group(1)
            .title()
        )

        if candidate.lower() not in [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10",
            "ek",
            "do",
            "one",
            "kg",
            "kilo",
        ]:

            customer_name = candidate

    if not customer_name:

        customer_match = re.search(
            r"(?:to|for|ko|mein|me|in|named|from)\s+"
            r"([a-zA-Z]+)",
            text_raw,
            flags=re.IGNORECASE,
        )

        if customer_match:

            extracted_name = (
                customer_match
                .group(1)
                .title()
            )

            if extracted_name.lower() not in [
                "khata",
                "cash",
                "cart",
                "stock",
                "the",
                "cell",
                "sell",
                "dalo",
                "mein",
                "me",
                "khate",
                "account",
                "acc",
            ]:

                customer_name = extracted_name

    # -----------------------------------------------------------------------
    # 8. Intent classification
    # -----------------------------------------------------------------------

    intent = None

    if any(
        word in text_clean
        for word in ["received"]
    ):

        intent = "khata.credit"

    elif (
        discount_percent is not None
        or "discount" in text_clean
    ):

        intent = "pos.apply_discount"

    elif customer_name:

        intent = "sale.create"

    elif any(
        word in text_clean
        for word in [
            "sell",
            "becho",
            "bechi",
            "bikri",
            "sale",
            "bill",
        ]
    ):

        intent = "sale.create"

    elif (
        any(
            word in text_clean
            for word in [
                "stock",
                "godown",
                "warehouse",
                "unpacked",
            ]
        )
        and
        any(
            word in text_clean
            for word in [
                "add",
                "jodo",
                "daalo",
                "dalo",
            ]
        )
    ):

        intent = "inventory.add"

    elif (
        new_price is not None
        or has_update_verb
    ):

        intent = "inventory.update_price"

    elif any(
        word in text_clean
        for word in [
            "checkout",
            "invoice",
            "bill banao",
        ]
    ):

        intent = "pos.checkout"

    # -----------------------------------------------------------------------
    # Default
    # -----------------------------------------------------------------------

    if not intent:
        intent = "sale.create"

    # -----------------------------------------------------------------------
    # 9. Product entity extraction
    # -----------------------------------------------------------------------

    noise_words = {

        "add",
        "jodo",
        "daalo",
        "dalo",

        "sell",
        "becho",
        "bechi",
        "bikri",
        "sale",
        "bill",
        "cell",
        "sel",

        "to",
        "the",
        "in",

        "cart",

        "khata",
        "khate",
        "account",
        "acc",
        "ac",

        "udhaar",
        "udhar",

        "cash",
        "nagad",
        "rokar",

        "for",
        "please",

        "kilo",
        "kilos",
        "kg",
        "kgs",

        "kilogram",
        "kilograms",

        "g",
        "gm",
        "gms",
        "gram",
        "grams",

        "liter",
        "litre",
        "liters",
        "litres",
        "ltr",
        "l",

        "ml",

        "pcs",
        "pc",
        "piece",
        "pieces",

        "pack",
        "packet",
        "packets",

        "can",
        "cans",

        "bottle",
        "bottles",

        "and",
        "put",

        "apply",
        "discount",
        "percent",
        "%",

        "rs",
        "rupees",
        "rupee",
        "₹",

        "update",
        "price",
        "daam",
        "rate",
        "set",

        "of",
        "a",

        "ko",
        "mein",
        "me",

        "ka",
        "ki",
        "ke",

        "hai",
        "hui",
        "kya",
        "kitni",
        "kitna",

        "karo",
        "kar",
        "do",

        "from",

        "receive",
        "received",
        "jama",
        "diye",
        "diya",
        "pay",
        "paid",
        "ne",
    }

    # -----------------------------------------------------------------------
    # Remove customer name from product matching
    # -----------------------------------------------------------------------

    def get_clean_entity(t):

        t = t.replace("₹", " ")

        if customer_name:

            t = re.sub(
                r"\b"
                + re.escape(customer_name)
                + r"\b",
                "",
                t,
                flags=re.IGNORECASE,
            )

        filtered = []

        for word in t.split():

            if word.lower() in noise_words:
                continue

            if re.match(
                r"^\d+(?:\.\d+)?$",
                word,
            ):
                continue

            filtered.append(word)

        return " ".join(
            filtered
        ).strip()

    entity_raw = get_clean_entity(
        text_raw
    )

    entity_clean = get_clean_entity(
        text_clean
    )

    # -----------------------------------------------------------------------
    # Product matching
    # -----------------------------------------------------------------------

    matched_product = None

    if inventory_names and (
        entity_raw
        or entity_clean
    ):

        # Clean inventory list
        inventory_names_clean = [
            str(item).strip()
            for item in inventory_names
            if item
            and str(item).strip()
        ]

        candidates = list(
            set(
                [
                    value
                    for value in [
                        entity_raw,
                        entity_clean,
                    ]
                    if value
                ]
            )
        )

        best_match = None
        best_score = 0

        for candidate in candidates:

            result = process.extractOne(
                candidate,
                inventory_names_clean,
                scorer=fuzz.token_set_ratio,
            )

            if result:

                match, score, _ = result

                if score > best_score:

                    best_score = score
                    best_match = match

        # -------------------------------------------------------------------
        # IMPORTANT:
        #
        # Only accept a product as resolved if fuzzy matching is strong.
        # -------------------------------------------------------------------

        if best_score >= 70:

            matched_product = best_match

        elif best_score >= 45:

            # Moderate match.
            #
            # Keep it as unresolved rather than pretending it is definitely
            # an inventory product.

            matched_product = None

        else:

            matched_product = None

    else:

        matched_product = None

    # -----------------------------------------------------------------------
    # Unknown product confidence
    # -----------------------------------------------------------------------

    if matched_product:

        confidence = 0.95

    elif entity_raw or entity_clean:

        confidence = 0.40

    else:

        confidence = 0.30

    # -----------------------------------------------------------------------
    # Return canonical result
    # -----------------------------------------------------------------------

    return _result(

        intent=intent,

        confidence=confidence,

        product=matched_product,

        qty=qty,

        unit=unit,

        discount_percent=discount_percent,

        new_price=new_price,

        customer_name=customer_name,

        time_period=(
            "today"
            if intent == "query.sales"
            else None
        ),

        source="rules_local",

        payment_type=payment_type,

        price_hint=new_price,

        amount=None,
    )


# ===========================================================================
# PUBLIC API
# ===========================================================================

def parse_voice_command(
    text: str,
    inventory_names: list = None,
    customer_names: list = None,
):

    return parse_with_rules(
        text,
        inventory_names,
        customer_names,
    )