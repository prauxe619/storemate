import torch
import re
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel

# 1. Use the fine-tuned receipt/invoice model
MODEL_NAME = "naver-clova-ix/donut-base-finetuned-cord-v2"
print("🧠 Loading Donut ML Model... (This may take a moment on startup)")

processor = DonutProcessor.from_pretrained(MODEL_NAME)
model = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME)

# Push to GPU if available (makes inference 10x faster), otherwise use CPU
device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)

def process_invoice_image(file_path):
    """
    Reads an uploaded invoice image using Donut ML, 
    and returns parsed product names, quantities, and prices.
    """
    try:
        # 2. Open image from the saved file path
        image = Image.open(file_path).convert("RGB")
        
        # 3. Prepare the prompt for the fine-tuned model
        task_prompt = "<s_cord-v2>"
        decoder_input_ids = processor.tokenizer(task_prompt, add_special_tokens=False, return_tensors="pt").input_ids
        
        # 4. Run Inference
        pixel_values = processor(image, return_tensors="pt").pixel_values
        
        outputs = model.generate(
            pixel_values.to(device),
            decoder_input_ids=decoder_input_ids.to(device),
            max_length=model.decoder.config.max_position_embeddings,
            pad_token_id=processor.tokenizer.pad_token_id,
            eos_token_id=processor.tokenizer.eos_token_id,
            use_cache=True,
            bad_words_ids=[[processor.tokenizer.unk_token_id]],
            return_dict_in_generate=True,
        )
        
        # 5. Decode the output sequence into raw JSON
        sequence = processor.batch_decode(outputs.sequences)[0]
        sequence = sequence.replace(processor.tokenizer.eos_token, "").replace(processor.tokenizer.pad_token, "")
        sequence = re.sub(r"<.*?>", "", sequence, count=1).strip()  # Remove task prompt token
        
        extracted_donut_json = processor.token2json(sequence)
        
        # 6. Map Donut's nested JSON to our Mobile App's format
        formatted_items = []
        
        def extract_items_from_donut(data):
            found = []
            if isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, list):
                        for item in value:
                            if isinstance(item, dict):
                                # Extract standard CORD keys: 'nm' (name), 'cnt' (count), 'price'
                                name = item.get('nm', item.get('name', 'Unknown Item'))
                                qty_str = item.get('cnt', item.get('count', item.get('qty', '1')))
                                price_str = item.get('price', item.get('unitprice', '0'))
                                
                                if name != 'Unknown Item' and type(name) == str:
                                    try:
                                        # Clean symbols and convert to numbers
                                        qty = int(re.sub(r'[^\d]', '', str(qty_str)) or 1)
                                        price = float(re.sub(r'[^\d\.]', '', str(price_str)) or 0.0)
                                        found.append({
                                            "productName": name.title(),
                                            "quantity": qty,
                                            "purchasePrice": price,
                                            "sellingPrice": round(price * 1.15, 2) # Auto 15% margin
                                        })
                                    except Exception as calc_err:
                                        pass
                    elif isinstance(value, dict):
                        found.extend(extract_items_from_donut(value))
            return found
        
        formatted_items = extract_items_from_donut(extracted_donut_json)

        return {
            "items": formatted_items,
            "raw_text": str(extracted_donut_json) # Send raw JSON back for debugging
        }

    except Exception as e:
        print(f"❌ Donut ML Processing Error: {e}")
        return {
            "items": [],
            "raw_text": "",
            "error": str(e)
        }