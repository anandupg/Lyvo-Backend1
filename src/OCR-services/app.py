from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "OCR service running"})

@app.route("/ocr/extract-text", methods=["POST"])
def ocr_extract():
    return jsonify({"text": "OCR result placeholder", "success": True, "data": {"text": "Placeholder Text"}})

@app.route("/ocr/aadhar", methods=["POST"])
def ocr_aadhar():
    return jsonify({"text": "Aadhar result placeholder", "success": True, "data": {"name": "Placeholder Name", "id": "0000 0000 0000"}})

@app.route("/ocr", methods=["POST"])
def ocr():
    return jsonify({"text": "OCR result placeholder"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
