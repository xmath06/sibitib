// Error domain terpusat — semua controller melempar AppError
// dan ditangani sekali di middleware/error.ts.

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = "Bad request", details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Unauthorized") =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "Forbidden") =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found") =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message = "Conflict") =>
  new AppError(409, "CONFLICT", message);

export const unprocessable = (message = "Unprocessable entity", details?: unknown) =>
  new AppError(422, "UNPROCESSABLE_ENTITY", message, details);