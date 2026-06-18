const express = require('express');
const userService = require('../services/users');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const requireAdmin = requireRole('admin');

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const users = await userService.listUsers(req.user);
    res.json({ data: users });
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await userService.createUser(req.body, req.user);
    res.status(201).json({ data: user });
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.params.id, req.user);
    res.json({ data: user });
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await userService.updateUser(req.params.id, req.body, req.user);
    res.json({ data: user });
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await userService.deleteUser(req.params.id, req.user);
    res.json({ data: user });
  })
);

module.exports = router;
