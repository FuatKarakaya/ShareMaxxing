import 'dotenv/config';
import app from './app';
import { getJwtSecret } from './lib/tokens';

// Fail on missing configuration before accepting requests.
getJwtSecret();
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set.');
}

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`ShareMaxxing API listening on port ${port}`);
});
