const express = require('express');
const router = express.Router();
const login = require('../controllers/auth/login');

// Defines the POST /api/auth/login endpoint
router.post('/login', login);

module.exports = router;