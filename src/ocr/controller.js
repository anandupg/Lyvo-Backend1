const axios = require('axios');
const FormData = require('form-data');

const getOcrApiKey = () => {
    return process.env.OCR_SPACE_API_KEY || 'K86000038088957';
};

const callOcrSpace = async (fileBuffer, filename, mimetype) => {
    const formData = new FormData();
    formData.append('file', fileBuffer, {
        filename: filename,
        contentType: mimetype
    });
    formData.append('apikey', getOcrApiKey());
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');

    const response = await axios.post('https://api.ocr.space/parse/image', formData, {
        headers: {
            ...formData.getHeaders()
        }
    });

    return response.data;
};

const extractText = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }

        console.log('Calling OCR.space API...');
        const ocrData = await callOcrSpace(req.file.buffer, req.file.originalname, req.file.mimetype);

        if (ocrData.OCRExitCode !== 1) {
            console.error('OCR.space Error:', ocrData);
            return res.status(500).json({
                success: false,
                error: typeof ocrData.ErrorMessage === 'string' ? ocrData.ErrorMessage : 'OCR Processing Failed',
                details: ocrData.ErrorMessage
            });
        }

        const parsedText = ocrData.ParsedResults?.[0]?.ParsedText || '';

        res.json({
            success: true,
            text: parsedText,
            data: { text: parsedText }
        });

    } catch (error) {
        console.error('OCR Controller extractText error:', error.message);
        res.status(500).json({ success: false, error: 'OCR Service unreachable: ' + error.message });
    }
};

const processAadhar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }

        console.log('Processing Aadhar with OCR.space...');
        const ocrData = await callOcrSpace(req.file.buffer, req.file.originalname, req.file.mimetype);

        if (ocrData.OCRExitCode !== 1) {
            console.error('OCR.space Error:', ocrData);
            return res.status(500).json({
                success: false,
                error: typeof ocrData.ErrorMessage === 'string' ? ocrData.ErrorMessage : 'OCR Processing Failed',
                details: ocrData.ErrorMessage
            });
        }

        const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || '';

        // Basic Aadhar Extraction Logic
        const lines = extractedText.split(/[\r\n]+/);
        let idNumber = null;
        let name = null;

        // Regex for Aadhar: 4 digits space 4 digits space 4 digits (e.g., 1234 5678 9012)
        const aadharRegex = /\b\d{4}\s\d{4}\s\d{4}\b/;
        const match = extractedText.match(aadharRegex);
        if (match) {
            idNumber = match[0];
        }

        // DOB regex: dd/mm/yyyy or dd-mm-yyyy or yyyy
        const dobRegex = /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/;
        const dobMatch = extractedText.match(dobRegex);
        const dob = dobMatch ? dobMatch[0] : null;

        // Gender regex
        let gender = null;
        if (/female|महिल/i.test(extractedText)) gender = 'Female';
        else if (/male|पुरुष/i.test(extractedText)) gender = 'Male';

        // Mobile regex (10 digits, possibly separated)
        const mobileRegex = /[6-9]\d{9}/;
        const mobileMatch = extractedText.replace(/\s+/g, '').match(mobileRegex);
        const mobile = mobileMatch ? mobileMatch[0] : null;

        // Attempt to find name - heuristic
        for (const line of lines) {
            const trimmed = line.trim();
            // Ignore common Aadhar keywords
            if (/government|india|male|female|dob|year|birth|father|mother/i.test(trimmed)) continue;
            // Check if line is mostly letters and has length
            if (/^[a-zA-Z\s.]+$/.test(trimmed) && trimmed.length > 3) {
                if (!name) name = trimmed;
            }
        }

        res.json({
            success: true,
            text: extractedText,
            data: {
                id: idNumber,
                name: name,
                dob: dob,
                gender: gender,
                mobile: mobile,
                rawText: extractedText
            }
        });

    } catch (error) {
        console.error('OCR Controller processAadhar error:', error.message);
        res.status(500).json({ success: false, error: 'OCR Service unreachable: ' + error.message });
    }
};

module.exports = {
    extractText,
    processAadhar
};
