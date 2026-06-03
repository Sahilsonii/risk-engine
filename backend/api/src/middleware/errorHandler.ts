import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error reached global error handler');
  res.status(500).json({
    error:   'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
}
