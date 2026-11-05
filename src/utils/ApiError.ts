export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(msg: string, details?: unknown) { return new ApiError(400, msg, details); }
  static unauthorized(msg = "Authentication required") { return new ApiError(401, msg); }
  static forbidden(msg = "You do not have permission to perform this action") { return new ApiError(403, msg); }
  static notFound(msg = "Resource not found") { return new ApiError(404, msg); }
  static conflict(msg: string) { return new ApiError(409, msg); }
}
