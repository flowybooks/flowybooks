import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  const filePath = path.join(process.cwd(), 'Standard-COA-v2.csv');

  let csv: string;
  try {
    csv = await fs.readFile(filePath, 'utf8');
  } catch {
    return new Response(JSON.stringify({ error: 'Standard CoA file not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="Standard-COA-v2.csv"',
    },
  });
}
