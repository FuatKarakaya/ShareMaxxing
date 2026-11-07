import { hashPassword, verifyPassword } from '../src/lib/passwords';

test('password hashes have independent salts and reject wrong passwords', async () => {
  const password = 'Space sensitive parola 42 ';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  expect(first).not.toBe(second);
  expect(first).not.toContain(password);
  await expect(verifyPassword(password, first)).resolves.toBe(true);
  await expect(verifyPassword(password.trim(), first)).resolves.toBe(false);
  await expect(verifyPassword('wrong-password', first)).resolves.toBe(false);
  await expect(verifyPassword(password, 'corrupt-database-value')).resolves.toBe(false);
});
