import re

def parse_store_intent(transcript: str):
    """
    This is our V1 heuristic NLP parser. 
    In V2, this function will simply pass the transcript to a local Llama-3 model.
    """
    text = transcript.lower()
    
    # 1. Detect Ledger Addition (e.g., "Add 500 to Ramesh")
    if "add" in text and any(word in text for word in ["khata", "account", "to"]):
        # Extract the first number found in the text
        numbers = re.findall(r'\d+', text)
        amount = float(numbers[0]) if numbers else 0.0
        
        # Super basic name extraction (assuming name comes after 'to')
        name_match = re.search(r'to\s+([a-z]+)', text)
        customer_name = name_match.group(1).capitalize() if name_match else "Unknown"

        return {
            "intent": "ADD_LEDGER_CREDIT",
            "confidence": 0.85,
            "parameters": {"amount": amount, "customer_name": customer_name}
        }

    # 2. Detect Inventory Check (e.g., "Check stock for milk")
    elif "check" in text or "stock" in text:
        item_match = re.search(r'(for|of)\s+([a-z]+)', text)
        item_name = item_match.group(2).capitalize() if item_match else "Unknown"
        
        return {
            "intent": "CHECK_INVENTORY",
            "confidence": 0.90,
            "parameters": {"item_name": item_name}
        }

    # 3. Fallback
    return {
        "intent": "UNKNOWN",
        "confidence": 0.10,
        "parameters": {}
    }