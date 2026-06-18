const branchService = require('./branches');

module.exports = {
  createArea: branchService.createArea,
  deleteArea: branchService.deleteArea,
  getAreaById: branchService.getAreaById,
  listAreas: branchService.listAreas,
  updateArea: branchService.updateArea
};
