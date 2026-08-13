import os
import re
import threading

import torch
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel
from dotenv import load_dotenv
from google import genai

# ==========================================
# 1. ENVIRONMENT
# ==========================================

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)
else:
    client = None
    print("⚠️ GEMINI_API_KEY is not configured")


# ==========================================
# 2. DONUT CONFIGURATION
# ==========================================

MODEL_NAME = "naver-clova-ix/donut-base-finetuned-cord-v2"

# Do NOT load the model during application startup.
processor = None
model = None
device = "cuda" if torch.cuda.is_available() else "cpu"

_model_lock = threading.Lock()


def load_donut_model():
    """
    Lazily load the Donut model only when invoice processing
    is actually requested.

    This prevents Gunicorn from loading Donut during startup.
    """

    global processor
    global model

    if processor is not None and model is not None:
        return processor, model

    with _model_lock:

        # Another thread may have loaded it while we waited.
        if processor is not None and model is not None:
            return processor, model

        print("🧠 Loading Donut ML Model...")

        processor = DonutProcessor.from_pretrained(
            MODEL_NAME,
            use_fast=False
        )

        model = VisionEncoderDecoderModel.from_pretrained(
            MODEL_NAME
        )

        model.to(device)
        model.eval()

        print(f"✅ Donut model loaded on {device}")

    return processor, model


# ==========================================
# 3. INVOICE PROCESSING
# ==========================================

def process_invoice_image(file_path):
    """
    Reads an uploaded invoice image using Donut ML
    and returns parsed product names, quantities,
    and prices.
    """

    try:

        # Load model ONLY when this function is actually called.
        processor, model = load_donut_model()

        image = Image.open(file_path).convert("RGB")

        # --------------------------------------
        # Donut task prompt
        # --------------------------------------

        task_prompt = "<s_cord-v2>"

        decoder_input_ids = processor.tokenizer(
            task_prompt,
            add_special_tokens=False,
            return_tensors="pt"
        ).input_ids

        # --------------------------------------
        # Process image
        # --------------------------------------

        pixel_values = processor(
            image,
            return_tensors="pt"
        ).pixel_values

        # --------------------------------------
        # Run inference
        # --------------------------------------

        with torch.no_grad():

            outputs = model.generate(
                pixel_values.to(device),
                decoder_input_ids=decoder_input_ids.to(device),
                max_length=model.decoder.config.max_position_embeddings,
                pad_token_id=processor.tokenizer.pad_token_id,
                eos_token_id=processor.tokenizer.eos_token_id,
                use_cache=True,
                bad_words_ids=[
                    [processor.tokenizer.unk_token_id]
                ],
                return_dict_in_generate=True,
            )

        # --------------------------------------
        # Decode
        # --------------------------------------

        sequence = processor.batch_decode(
            outputs.sequences
        )[0]

        sequence = sequence.replace(
            processor.tokenizer.eos_token,
            ""
        )

        sequence = sequence.replace(
            processor.tokenizer.pad_token,
            ""
        )

        sequence = re.sub(
            r"<.*?>",
            "",
            sequence,
            count=1
        ).strip()

        extracted_donut_json = processor.token2json(
            sequence
        )

        # --------------------------------------
        # Convert Donut data
        # --------------------------------------

        formatted_items = []

        def extract_items_from_donut(data):

            found = []

            if isinstance(data, dict):

                for key, value in data.items():

                    if isinstance(value, list):

                        for item in value:

                            if isinstance(item, dict):

                                name = item.get(
                                    "nm",
                                    item.get(
                                        "name",
                                        "Unknown Item"
                                    )
                                )

                                qty_str = item.get(
                                    "cnt",
                                    item.get(
                                        "count",
                                        item.get(
                                            "qty",
                                            "1"
                                        )
                                    )
                                )

                                price_str = item.get(
                                    "price",
                                    item.get(
                                        "unitprice",
                                        "0"
                                    )
                                )

                                if (
                                    name != "Unknown Item"
                                    and isinstance(name, str)
                                ):

                                    try:

                                        qty = int(
                                            re.sub(
                                                r"[^\d]",
                                                "",
                                                str(qty_str)
                                            ) or 1
                                        )

                                        price = float(
                                            re.sub(
                                                r"[^\d.]",
                                                "",
                                                str(price_str)
                                            ) or 0.0
                                        )

                                        found.append({
                                            "productName": name.title(),
                                            "quantity": qty,
                                            "purchasePrice": price,
                                            "sellingPrice": round(
                                                price * 1.15,
                                                2
                                            )
                                        })

                                    except Exception:
                                        pass

                    elif isinstance(value, dict):

                        found.extend(
                            extract_items_from_donut(value)
                        )

            return found

        formatted_items = extract_items_from_donut(
            extracted_donut_json
        )

        return {
            "items": formatted_items,
            "raw_text": str(extracted_donut_json)
        }

    except Exception as e:

        print(
            f"❌ Donut ML Processing Error: {e}"
        )

        return {
            "items": [],
            "raw_text": "",
            "error": str(e)
        }
