const express = require('express');
const router = express.Router();
const maintenanceController = require('./controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.post('/', maintenanceController.createRequest);
router.get('/tenant', maintenanceController.getTenantRequests);
router.get('/owner', maintenanceController.getOwnerRequests);
router.patch('/:id', maintenanceController.updateRequestStatus);

module.exports = router;
