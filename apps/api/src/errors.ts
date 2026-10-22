import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { createLogger, describeError } from '@flash-sale/core';
import type { ErrorResponse } from '@flash-sale/shared';

const logger = createLogger('api');

export function sendError(
  res: Response,
  httpStatus: number,
  error: ErrorResponse['error'],
  message: string,
): void {
  const body: ErrorResponse = { error, message };
  res.status(httpStatus).json(body);
}

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, 404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
};

/**
 * Express 5 forwards rejected promises from async handlers here. Client errors
 * raised by middleware (e.g. malformed JSON) carry a 4xx `status`; anything else
 * is ours and is logged.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const status = typeof error?.status === 'number' ? error.status : 500;

  if (status >= 400 && status < 500) {
    sendError(res, status, 'BAD_REQUEST', describeError(error));
    return;
  }

  logger.error('Unhandled error', { method: req.method, path: req.path, error: describeError(error) });
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
};
