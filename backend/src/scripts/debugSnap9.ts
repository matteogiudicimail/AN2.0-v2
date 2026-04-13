import '../config/env';
import { getPool, closePool } from '../config/db';
import * as sql from 'mssql';
import { loadFiltriDimMapping } from '../services/dataEntryGridService';

async function main() {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, 9)
    .query('SELECT LayoutJson, BindingJson FROM dbo.cfg_Snapshot WHERE SnapshotId=@id');

  if (!r.recordset.length) { console.log('Snapshot #9 not found'); process.exit(1); }

  const layout  = JSON.parse(r.recordset[0].LayoutJson);
  const binding = JSON.parse(r.recordset[0].BindingJson);

  const [schemaName, factTable] = (binding.factTable as string).includes('.')
    ? (binding.factTable as string).split('.') : ['dbo', binding.factTable];
  const joinConfig = binding.joinConfig ?? [];

  console.log('\n=== factTable:', schemaName + '.' + factTable);
  console.log('=== joinConfig:', JSON.stringify(joinConfig, null, 2));
  console.log('\n=== filtri with dimTable (no paramTableId):');
  (layout.filtri ?? []).filter((f: any) => f.dimTable && !f.paramTableId)
    .forEach((f: any) => console.log(' -', f.fieldName, '→', f.dimTable));
  console.log('\n=== righe with dimTable (no paramTableId):');
  (layout.righe ?? []).filter((f: any) => f.dimTable && !f.paramTableId)
    .forEach((f: any) => console.log(' -', f.fieldName, '→', f.dimTable));

  console.log('\n=== Calling loadFiltriDimMapping...');
  const mapping = await loadFiltriDimMapping(schemaName, factTable, joinConfig, layout, 0);
  console.log('Result keys:', Object.keys(mapping));
  for (const [k, v] of Object.entries(mapping)) {
    const vals = Object.keys(v);
    console.log(` ${k}: ${vals.length} distinct values, sample:`, vals.slice(0, 3));
    if (vals.length > 0) {
      console.log(`   First value "${vals[0]}" → ${(v[vals[0]] as string[]).length} row keys, sample:`, (v[vals[0]] as string[]).slice(0, 3));
    }
  }

  await closePool();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
