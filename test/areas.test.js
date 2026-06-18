const test = require('node:test');
const assert = require('node:assert/strict');
const areaRouter = require('../src/routes/areas');

function routeMethods(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort()
    }));
}

test('area API exposes full CRUD routes', () => {
  assert.deepEqual(routeMethods(areaRouter), [
    { path: '/', methods: ['get'] },
    { path: '/', methods: ['post'] },
    { path: '/:id', methods: ['get'] },
    { path: '/:id', methods: ['put'] },
    { path: '/:id', methods: ['delete'] }
  ]);
});
