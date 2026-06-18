const express = require('express');
const apiClientService = require('../services/api-clients');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const requireAdmin = requireRole('admin');

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const clients = await apiClientService.listApiClients();
    res.json({ data: clients });
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await apiClientService.createApiClient(req.body);
    res.status(201).json({ data: result });
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const client = await apiClientService.updateApiClient(req.params.id, req.body);
    res.json({ data: client });
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const client = await apiClientService.deleteApiClient(req.params.id);
    res.json({ data: client });
  })
);

router.post(
  '/:id/rotate-key',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await apiClientService.rotateApiClientKey(req.params.id);
    res.json({ data: result });
  })
);

module.exports = router;
