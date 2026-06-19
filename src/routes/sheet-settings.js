const express = require('express');
const sheetSettingsService = require('../services/sheet-settings');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const requireAdmin = requireRole('admin');

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const targets = await sheetSettingsService.listSheetTargets();
    res.json({ data: targets });
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await sheetSettingsService.createSheetTarget(req.body);
    res.status(201).json({ data: target });
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await sheetSettingsService.updateSheetTarget(req.params.id, req.body);
    res.json({ data: target });
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await sheetSettingsService.deleteSheetTarget(req.params.id);
    res.json({ data: target });
  })
);

module.exports = router;
