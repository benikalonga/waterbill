/**
 * Create the first administrator, or reset one.
 *   npm run staff:admin -w api -- YOUR_EMAIL@fakeemail.com 'YOUR_PASSWORD' "YOUR_NAME"
 */
import bcrypt from 'bcryptjs';
import '../lib/config';
import { db } from '../lib/db';

async function main() {
  const [rawEmail, password, ...name] = process.argv.slice(2);
  if (!rawEmail || !password) {
    console.error('Usage: createAdmin <email> <password> [full name]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('✖ Administrator passwords must be at least 12 characters.');
    process.exit(1);
  }
  const email = rawEmail.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  await db.staff.upsert({
    where: { email },
    create: { email, passwordHash, role: 'ADMIN', fullName: name.join(' ') || email.split('@')[0] },
    update: { passwordHash, role: 'ADMIN', isActive: true },
  });
  console.log(`✓ administrator ready: ${email}`);
}

main()
  .catch((err) => {
    console.error('✖', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
