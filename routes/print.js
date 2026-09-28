const express = require('express');
const path = require('path');
const { print, getPrinters } = require('pdf-to-printer');
const { readDB, writeDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// IMPORTANT: change this to match the exact printer name as it appears
// in Windows "Devices and Printers" (or `lpstat -p` on Linux/Mac)
const PRINTER_NAME = 'YourPrinterName';
