require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const isLocal = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.log('------------------------------------------------------------');
    console.log('ChongZi CLI: Nâng cấp tài khoản lên quyền ADMIN');
    console.log('Cách dùng: node promote-admin.js <email>');
    console.log('Ví dụ: node promote-admin.js test@example.com');
    console.log('------------------------------------------------------------');
    process.exit(1);
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: cleanEmail }
  });

  if (!user) {
    console.error(`❌ Không tìm thấy người dùng có email: ${cleanEmail}`);
    process.exit(1);
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' },
    select: { id: true, name: true, email: true, role: true }
  });

  console.log('------------------------------------------------------------');
  console.log('🎉 THÀNH CÔNG!');
  console.log(`Đã nâng cấp tài khoản: ${updatedUser.name}`);
  console.log(`Email: ${updatedUser.email}`);
  console.log(`Vai trò mới: ${updatedUser.role}`);
  console.log('------------------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('❌ Lỗi khi thực thi script:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

