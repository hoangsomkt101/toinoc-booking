const path = require('path');
const express = require('express');
const hbs = require('hbs');
const apiClientRoutes = require('./routes/api-clients');
const apiRoutes = require('./routes/api');
const areaRoutes = require('./routes/areas');
const branchRoutes = require('./routes/branches');
const bookingRoutes = require('./routes/bookings');
const customerRoutes = require('./routes/customers');
const pageRoutes = require('./routes/pages');
const publicApiRoutes = require('./routes/public-api');
const sheetSettingsRoutes = require('./routes/sheet-settings');
const userRoutes = require('./routes/users');
const { query } = require('./db/pool');
const { loadSession } = require('./middleware/auth');
const asyncHandler = require('./middleware/async-handler');
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');

function registerHandlebarsHelpers() {
  hbs.registerPartials(path.join(__dirname, 'views', 'partials'));

  hbs.registerHelper('json', (value) =>
    JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => {
      const escapes = {
        '<': '\\u003c',
        '>': '\\u003e',
        '&': '\\u0026',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029'
      };

      return escapes[character];
    })
  );
}

function createApp() {
  registerHandlebarsHelpers();

  const app = express();

  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'hbs');
  app.set('trust proxy', 1);

  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/readyz', asyncHandler(async (req, res) => {
    await query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/vendor/bootstrap', express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap', 'dist')));
  app.use('/vendor/fontawesome', express.static(path.join(__dirname, '..', 'node_modules', '@fortawesome', 'fontawesome-free')));
  app.use(loadSession);

  app.use('/', pageRoutes);
  app.use('/api/public', publicApiRoutes);
  app.use('/api/api-clients', apiClientRoutes);
  app.use('/api/areas', areaRoutes);
  app.use('/api/branches', branchRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/sheet-settings', sheetSettingsRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
