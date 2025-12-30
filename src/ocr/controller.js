const ocrService = require('./services/ocrService');

const extractText = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }

        const { buffer } = req.file;
        const result = await ocrService.extractText(buffer);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('OCR Controller extractText error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

const processAadhar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }

        const { buffer } = req.file;
        const result = await ocrService.processAadhar(buffer);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('OCR Controller processAadhar error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

module.exports = {
    extractText,
    processAadhar
};
