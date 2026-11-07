import fs from 'node:fs';
import path from 'node:path';

const logoPath = [
  path.resolve(__dirname, 'demoshop_logo.png'),
  path.resolve(process.cwd(), 'src/utils/receipt/demoshop_logo.png'),
  path.resolve(process.cwd(), 'demoshop-backend/src/utils/receipt/demoshop_logo.png'),
].find(candidate => fs.existsSync(candidate));

export const receiptLogoDataUri = logoPath
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  : '';
