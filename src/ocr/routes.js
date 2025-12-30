const express = require('express');
const router = express.Router();
const multer = require('multer');
const ocrController = require('./controller');

// Memory storage for Tesseract (avoid disk I/O for speed/simplicity)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    }
});

router.post('/extract-text', upload.single('image'), ocrController.extractText);
router.post('/aadhar', upload.single('image'), ocrController.processAadhar);

module.exports = router;
