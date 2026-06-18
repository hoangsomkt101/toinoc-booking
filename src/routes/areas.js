const express = require('express');
const areaService = require('../services/areas');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const requireManager = requireRole('manager');
const requireAdmin = requireRole('admin');

router.get(
  '/',
  requireManager,
  asyncHandler(async (req, res) => {
    const areas = await areaService.listAreas(req.query);
    res.json({ data: areas });
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const area = await areaService.createArea(req.body);
    res.status(201).json({ data: area });
  })
);

router.get(
  '/:id',
  requireManager,
  asyncHandler(async (req, res) => {
    const area = await areaService.getAreaById(req.params.id);
    res.json({ data: area });
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const area = await areaService.updateArea(req.params.id, req.body);
    res.json({ data: area });
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const area = await areaService.deleteArea(req.params.id);
    res.json({ data: area });
  })
);

module.exports = router;
