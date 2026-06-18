const apiClientService = require('../services/api-clients');
const asyncHandler = require('./async-handler');

function requestOrigin(req) {
  return req.get('origin') || req.get('referer') || '';
}

const requirePublicApiOrigin = asyncHandler(async (req, res, next) => {
  const client = await apiClientService.findActiveClientByOrigin(requestOrigin(req));
  req.publicApiClient = client;
  res.setHeader('Access-Control-Allow-Origin', client.allowed_origin);
  res.setHeader('Vary', 'Origin');
  next();
});

const requirePublicApiClient = asyncHandler(async (req, res, next) => {
  const origin = requestOrigin(req);
  const originClient = await apiClientService.findActiveClientByOrigin(origin);
  res.setHeader('Access-Control-Allow-Origin', originClient.allowed_origin);
  res.setHeader('Vary', 'Origin');

  const client = await apiClientService.authenticatePublicApiClient(
    origin,
    req.get('x-booking-api-key')
  );
  req.publicApiClient = client;
  next();
});

function publicApiOptions(req, res, next) {
  const origin = requestOrigin(req);

  if (!origin) {
    return res.sendStatus(204);
  }

  return apiClientService.findActiveClientByOrigin(origin)
    .then((client) => {
      res.setHeader('Access-Control-Allow-Origin', client.allowed_origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Booking-Api-Key');
      res.setHeader('Vary', 'Origin');
      res.sendStatus(204);
    })
    .catch(next);
}

module.exports = {
  publicApiOptions,
  requirePublicApiClient,
  requirePublicApiOrigin
};
