ALTER TABLE areas
  ADD CONSTRAINT areas_id_branch_id_unique UNIQUE (id, branch_id),
  ADD CONSTRAINT areas_branch_id_id_unique UNIQUE (branch_id, id);

ALTER TABLE tables
  ADD CONSTRAINT tables_area_branch_fk
  FOREIGN KEY (area_id, branch_id)
  REFERENCES areas(id, branch_id)
  ON DELETE RESTRICT;

CREATE INDEX idx_areas_branch_id ON areas(branch_id);
CREATE INDEX idx_tables_area_status ON tables(area_id, status);
