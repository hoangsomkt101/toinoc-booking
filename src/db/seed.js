const { withTransaction, close } = require('./pool');
const { authPasswords } = require('../config');
const { hashPassword } = require('../domain/passwords');

const DEFAULT_TABLE_CAPACITY = 4;

// Source: https://nguyenngocphu.com/dat-ban (public CFG configuration).
const branchSeeds = [
  {
    name: 'Quận 1',
    address: 'đường võ văn kiệt, Quận 1, TP.HCM',
    table_count: 48,
    areas: [
      { name: 'Trong nhà' },
      { name: 'Vỉa hè' },
      { name: 'Trên lầu' }
    ]
  },
  {
    name: 'Bình Thạnh',
    address: 'đường điện biên phủ, Quận Bình Thạnh, TP.HCM',
    table_count: 49,
    areas: [
      { name: 'Trong nhà' },
      { name: 'Vỉa hè' },
      { name: 'Trên lầu' },
      { name: 'Tiệm phở' }
    ]
  },
  {
    name: 'Quận 10',
    address: 'đường thành thái, Quận 10, TP.HCM',
    table_count: 96,
    areas: [
      { name: 'Trong nhà' },
      { name: 'Vỉa hè' }
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

function tableNumbers(branch) {
  return Array.from(
    { length: branch.table_count },
    (_, index) => index + 1
  );
}

async function upsertBranchStructure(client, branch) {
  const branchResult = await client.query(
    `INSERT INTO branches (name, address, table_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET address = EXCLUDED.address,
                                      table_count = EXCLUDED.table_count
     RETURNING id`,
    [branch.name, branch.address, branch.table_count]
  );
  const branchId = branchResult.rows[0].id;

  for (const area of branch.areas) {
    await client.query(
      `INSERT INTO areas (branch_id, name)
       VALUES ($1, $2)
       ON CONFLICT (branch_id, name) DO UPDATE SET name = EXCLUDED.name`,
      [branchId, area.name]
    );
  }

  for (const tableNumber of tableNumbers(branch)) {
    await client.query(
      `INSERT INTO tables (branch_id, table_code, capacity, status)
       VALUES ($1, $2, $3, 'AVAILABLE')
       ON CONFLICT (branch_id, table_code)
       DO UPDATE SET capacity = EXCLUDED.capacity`,
      [branchId, String(tableNumber), DEFAULT_TABLE_CAPACITY]
    );
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
