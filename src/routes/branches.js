const express = require('express');
const branchService = require('../services/branches');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const requireManager = requireRole('manager');
const requireAdmin = requireRole('admin');

router.get(
  '/',
  requireManager,
  asyncHandler(async (req, res) => {
    const branches = await branchService.listBranches();
    res.json({ data: branches });
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const branch = await branchService.createBranch(req.body);
    res.status(201).json({ data: branch });
  })
);

router.get(
  '/:id',
  requireManager,
  asyncHandler(async (req, res) => {
    const branch = await branchService.getBranchById(req.params.id);
    res.json({ data: branch });
  })
);

router.post(
  '/:id/areas',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const branch = await branchService.createBranchArea(req.params.id, req.body);
    res.status(201).json({ data: branch });
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const branch = await branchService.updateBranch(req.params.id, req.body);
    res.json({ data: branch });
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const branch = await branchService.deleteBranch(req.params.id);
    res.json({ data: branch });
  })
);

module.exports = router;
