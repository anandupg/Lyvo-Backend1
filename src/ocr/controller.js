const axios = require('axios');
const FormData = require('form-data');

const getOcrServiceUrl = () => {
    // In production (Render), this env var should be set.
    // Locally, it defaults to localhost:5003
    return process.env.OCR_SERVICE_URL || 'http://localhost:5001';
};

const extractText = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }

        const formData = new FormData();
        formData.append('image', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const ocrUrl = `${getOcrServiceUrl()}/ocr/extract-text`;
        console.log(`Calling OCR Service at: ${ocrUrl}`);

        const response = await axios.post(ocrUrl, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('OCR Controller extractText error:', error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ success: false, error: 'OCR Service unreachable' });
        }
    }
};

const processAadhar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }

        const formData = new FormData();
        formData.append('image', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const ocrUrl = `${getOcrServiceUrl()}/ocr/aadhar`;
        console.log(`Calling OCR Service at: ${ocrUrl}`);

        const response = await axios.post(ocrUrl, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('OCR Controller processAadhar error:', error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ success: false, error: 'OCR Service unreachable' });
        }
    }
};

module.exports = {
    extractText,
    processAadhar
};
