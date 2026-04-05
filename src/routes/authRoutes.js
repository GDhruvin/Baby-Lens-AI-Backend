const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');

// Defines the POST /api/auth/login endpoint
router.post('/login', login);

module.exports = router;