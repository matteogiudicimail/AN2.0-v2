/**
 * TypeORM DataSource for MESA Data Collection (SQL Server / Azure SQL).
 * Separate from the CFS mssql pool — each service uses its own connection.
 *
 * Env vars required:
 *   MESA_DB_SERVER, MESA_DB_DATABASE
 *   MESA_DB_WINDOWS_AUTH=true  OR  MESA_DB_USER + MESA_DB_PASSWORD
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';

// Entities
import { MesaApplicationModule }  from '../entities/mesa/ApplicationModule';
import { MesaNavigationItem }     from '../entities/mesa/NavigationItem';
import { MesaUser }               from '../entities/mesa/User';
import { MesaRole }               from '../entities/mesa/Role';
import { MesaUserRole }           from '../entities/mesa/UserRole';
import { MesaScope }              from '../entities/mesa/Scope';
import { MesaReport }             from '../entities/mesa/Report';
import { MesaSection }            from '../entities/mesa/Section';
import { MesaDimension }          from '../entities/mesa/Dimension';
import { MesaDimensionValue }     from '../entities/mesa/DimensionValue';
import { MesaReportDimension }    from '../entities/mesa/ReportDimension';
import { MesaKpi }                from '../entities/mesa/Kpi';
import { MesaFactValue }          from '../entities/mesa/FactValue';
import { MesaCellChange }         from '../entities/mesa/CellChange';
import { MesaValidation }         from '../entities/mesa/Validation';
import { MesaComment }            from '../entities/mesa/Comment';

const winAuth   = process.env['MESA_DB_WINDOWS_AUTH'] === 'true';
const server    = process.env['MESA_DB_SERVER'] ?? 'localhost';
const database  = process.env['MESA_DB_DATABASE'] ?? 'mesa_dc';
const user      = process.env['MESA_DB_USER'];
const password  = process.env['MESA_DB_PASSWORD'];

export const mesaDataSource = new DataSource({
  type: 'mssql',
  host: server,
  database,
  ...(winAuth
    ? { options: { trustedConnection: true, trustServerCertificate: true } }
    : { username: user, password, options: { trustServerCertificate: true } }),
  synchronize: false, // handled manually in initMesaDb() after optional table drop
  logging: process.env['NODE_ENV'] === 'development',
  entities: [
    MesaApplicationModule,
    MesaNavigationItem,
    MesaUser,
    MesaRole,
    MesaUserRole,
    MesaScope,
    MesaReport,
    MesaSection,
    MesaDimension,
    MesaDimensionValue,
    MesaReportDimension,
    MesaKpi,
    MesaFactValue,
    MesaCellChange,
    MesaValidation,
    MesaComment,
  ],
});

export async function initMesaDb(): Promise<void> {
  if (!mesaDataSource.isInitialized) {
    await mesaDataSource.initialize();
    await mesaDataSource.synchronize(); // creates missing tables, no-op if already up-to-date
    console.log('[mesa-db] Connected to Azure SQL — database:', database);
  }
}

export async function closeMesaDb(): Promise<void> {
  if (mesaDataSource.isInitialized) {
    await mesaDataSource.destroy();
  }
}
