import { AppError } from "./errors";

type ErrorContext = {
  error: unknown;
  // set di Elysia menerima number | string status code (mis. 401, "Unauthorized")
  set: { status?: number | string };
  // code bisa berupa string (mis. VALIDATION) atau status number
  code: string | number;
};

// Global error handler yang didaftarkan di root app.
export const handleError = ({ error, set, code }: ErrorContext) => {
  if (error instanceof AppError) {
    set.status = error.statusCode;
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    };
  }

  // Error validasi Elysia (dari t.Object schema)
  if (code === "VALIDATION") {
    set.status = 422;
    return {
      success: false,
      error: {
        code: "VALIDATION",
        message: error instanceof Error ? error.message : "Validation failed",
      },
    };
  }

  console.error(
    `[ERROR] ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );

  set.status = 500;
  return {
    success: false,
    error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
  };
};