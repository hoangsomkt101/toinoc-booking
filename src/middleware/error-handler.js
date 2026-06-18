const { ApiError } = require('../domain/errors');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, 'Không tìm thấy đường dẫn'));
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;
  const response = {
    error: {
      message: statusCode === 500 ? 'Lỗi máy chủ nội bộ' : error.message
    }
  };

  if (error.details) {
    response.error.details = error.details;
  }

  if (statusCode === 500) {
    console.error(error);
  }

  if (!req.path.startsWith('/api') && req.accepts('html')) {
    return res.status(statusCode).render('error', {
      title: 'Lỗi',
      statusCode,
      message: response.error.message
    });
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
