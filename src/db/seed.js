const { withTransaction, close } = require('./pool');
const { authPasswords } = require('../config');
const { hashPassword } = require('../domain/passwords');

const DEFAULT_TABLE_CAPACITY = 4;

// Source: https://nguyenngocphu.com/dat-ban (public CFG configuration).
const branchSeeds = [
  {
    name: 'Quận 1',
    address: 'Quận 1, TP.HCM',
    areas: [
      { name: 'Trong nhà', first_table: 1, last_table: 18 },
      { name: 'Vỉa hè', first_table: 19, last_table: 38 },
      { name: 'Trên lầu', first_table: 39, last_table: 48 }
    ]
  },
  {
    name: 'Bình Thạnh',
    address: 'Quận Bình Thạnh, TP.HCM',
    areas: [
      { name: 'Trong nhà', first_table: 1, last_table: 8 },
      { name: 'Vỉa hè', first_table: 9, last_table: 29 },
      { name: 'Trên lầu', first_table: 30, last_table: 43 },
      { name: 'Tiệm phở', first_table: 44, last_table: 49 }
    ]
  },
  {
    name: 'Quận 10',
    address: 'Quận 10, TP.HCM',
    areas: [
      { name: 'Trong nhà', first_table: 1, last_table: 72 },
      { name: 'Vỉa hè', first_table: 73, last_table: 96 }
    ]
  }
];

const staffSeeds = [
  { name: 'Chủ quán', email: 'owner@example.local', role: 'Owner' },
  { name: 'Quản lý', email: 'manager@example.local', role: 'Manager' },
  { name: 'Nhân viên kinh doanh', email: 'sale@example.local', role: 'Sale' }
];

const userSeeds = [
  { username: 'admin', display_name: 'Quản trị viên', role: 'admin', password: authPasswords.admin },
  { username: 'manager', display_name: 'Quản lý', role: 'manager', password: authPasswords.manager },
  { username: 'sale', display_name: 'Nhân viên kinh doanh', role: 'sale', password: authPasswords.sale }
];

function tableNumbers(area) {
  return Array.from(
    { length: area.last_table - area.first_table + 1 },
    (_, index) => area.first_table + index
  );
}

async function upsertBranchStructure(client, branch) {
  const branchResult = await client.query(
    `INSERT INTO branches (name, address)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET address = EXCLUDED.address
     RETURNING id`,
    [branch.name, branch.address]
  );
  const branchId = branchResult.rows[0].id;

  for (const area of branch.areas) {
    const areaResult = await client.query(
      `INSERT INTO areas (branch_id, name)
       VALUES ($1, $2)
       ON CONFLICT (branch_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [branchId, area.name]
    );
    const areaId = areaResult.rows[0].id;

    for (const tableNumber of tableNumbers(area)) {
      await client.query(
        `INSERT INTO tables (branch_id, area_id, table_code, capacity, status)
         VALUES ($1, $2, $3, $4, 'AVAILABLE')
         ON CONFLICT (branch_id, table_code)
         DO UPDATE SET area_id = EXCLUDED.area_id, capacity = EXCLUDED.capacity`,
        [branchId, areaId, String(tableNumber), DEFAULT_TABLE_CAPACITY]
      );
    }
  }

  return branchId;
}

async function seed({ skipIfUsersExist = false } = {}) {
  await withTransaction(async (client) => {
    if (skipIfUsersExist) {
      const existingUsers = await client.query('SELECT 1 FROM users LIMIT 1');

      if (existingUsers.rowCount > 0) {
        console.log('Seed skipped because user accounts already exist');
        return;
      }
    }

    for (const branch of branchSeeds) {
      await upsertBranchStructure(client, branch);
    }

    for (const staff of staffSeeds) {
      await client.query(
        `INSERT INTO staffs (branch_id, name, email, role)
         VALUES (NULL, $1, $2, $3)
         ON CONFLICT (email)
         DO UPDATE SET branch_id = NULL, name = EXCLUDED.name, role = EXCLUDED.role`,
        [staff.name, staff.email, staff.role]
      );
    }

    for (const user of userSeeds) {
      if (!user.password) {
        throw new Error(`Missing seed password for ${user.username}`);
      }

      await client.query(
        `INSERT INTO users (branch_id, username, display_name, role, password_hash)
         VALUES (NULL, $1, $2, $3, $4)
         ON CONFLICT (username)
         DO UPDATE SET branch_id = NULL,
                       display_name = EXCLUDED.display_name,
                       role = EXCLUDED.role,
                       password_hash = EXCLUDED.password_hash`,
        [user.username, user.display_name, user.role, hashPassword(user.password)]
      );
    }
  });

  console.log('Đã tạo dữ liệu 3 chi nhánh và 193 bàn');
}

if (require.main === module) {
  seed()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => close());
}

module.exports = { branchSeeds, seed, tableNumbers };
