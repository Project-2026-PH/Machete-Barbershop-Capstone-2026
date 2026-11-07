import express from 'express';
import path from 'path';

export const uploadsMiddleware = express.static(path.join(__dirname, '../../uploads'));
