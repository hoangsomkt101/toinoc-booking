class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new ApiError(400, message, details);
}

function notFound(message = 'Không tìm thấy tài nguyên') {
  return new ApiError(404, message);
}

function forbidden(message = 'Bạn không có quyền thực hiện thao tác này') {
  return new ApiError(403, message);
}

function conflict(message, details) {
  return new ApiError(409, message, details);
}

module.exports = {
  ApiError,
  badRequest,
  forbidden,
  notFound,
  conflict
};
