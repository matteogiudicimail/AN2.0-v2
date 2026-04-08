/**
 * MESA Data Collection — Seed Script (Azure SQL / SQL Server)
 * Popola il database con dati di riferimento per lo sviluppo.
 *
 * Run: npm run mesaSeed
 *
 * Requires MESA_DB_* env vars (from .env).
 */
import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

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

const winAuth  = process.env['MESA_DB_WINDOWS_AUTH'] === 'true';
const server   = process.env['MESA_DB_SERVER']   ?? 'localhost';
const database = process.env['MESA_DB_DATABASE'] ?? 'mesa_dc';

const ds = new DataSource({
  type: 'mssql',
  host: server,
  database,
  ...(winAuth
    ? { options: { trustedConnection: true, trustServerCertificate: true } }
    : {
        username: process.env['MESA_DB_USER'],
        password: process.env['MESA_DB_PASSWORD'],
        options:  { trustServerCertificate: true },
      }),
  synchronize: true,
  logging: false,
  entities: [
    MesaApplicationModule, MesaNavigationItem,
    MesaUser, MesaRole, MesaUserRole, MesaScope,
    MesaReport, MesaSection,
    MesaDimension, MesaDimensionValue, MesaReportDimension,
    MesaKpi, MesaFactValue, MesaCellChange, MesaValidation, MesaComment,
  ],
});

const ENTITY_CODES = [
  'EB0144', 'EB0123', 'EB0226', 'EB0548', 'EB0202',
  'EB4723', 'EB0310', 'EB0415', 'EB0522', 'EB0618',
  'EB0725', 'EB0831', 'EB0944', 'EB1050', 'EB1162',
  'EB1278', 'EB1385', 'EB1491', 'EB1597', 'EB1703',
];

const SECTIONS = [
  { code: '1', name: 'Organico e struttura' },
  { code: '2', name: 'Presenze e assenze' },
  { code: '3', name: 'Retribuzioni e costi' },
  { code: '4', name: 'Formazione' },
  { code: '5', name: 'Welfare aziendale' },
  { code: '6', name: 'Diversity & Inclusion' },
  { code: '7', name: 'Sicurezza sul lavoro' },
  { code: '8', name: 'Relazioni industriali' },
  { code: '9', name: 'Contenzioso e compliance' },
];

function rand(min: number, max: number): number {
  return Math.round(Math.random() * (max - min) + min);
}

async function seed(): Promise<void> {
  await ds.initialize();
  console.log('[mesa-seed] Connected to SQL Server:', server, '/', database);

  // Clear existing data (SQL Server — no PRAGMA needed)
  const tables = [
    'mesa_aud_cell_change', 'mesa_dc_fact_value', 'mesa_dc_comment',
    'mesa_md_validation', 'mesa_md_kpi', 'mesa_cfg_report_dimension',
    'mesa_sys_scope', 'mesa_sys_user_role', 'mesa_md_dimension_value',
    'mesa_md_dimension', 'mesa_md_section', 'mesa_cfg_report',
    'mesa_admin_navigation_item', 'mesa_admin_application_module',
    'mesa_sys_user', 'mesa_sys_role',
  ];
  // Disable FK checks temporarily via SET NOCOUNT + individual disables
  for (const table of tables) {
    try { await ds.query(`DELETE FROM ${table}`); } catch { /* table may not exist yet */ }
  }

  // ── Roles ─────────────────────────────────────────────────────────────────
  const roleRepo = ds.getRepository(MesaRole);
  const adminRole    = await roleRepo.save({ code: 'ADMIN',       name: 'Administrator' });
  const coordRole    = await roleRepo.save({ code: 'COORDINATOR', name: 'Coordinator' });
  const compilerRole = await roleRepo.save({ code: 'COMPILER',    name: 'Compiler' });

  // ── Users ─────────────────────────────────────────────────────────────────
  const userRepo = ds.getRepository(MesaUser);
  const adminUser = await userRepo.save({
    username: 'admin', displayName: 'Administrator', initials: 'AD',
    email: 'admin@mesa.local', isActive: true, passwordHash: 'mesa2025',
  });
  const coordUser = await userRepo.save({
    username: 'abianco', displayName: 'Anna Bianchi', initials: 'AB',
    email: 'a.bianchi@mesa.local', isActive: true, passwordHash: 'mesa2025',
  });
  const compilerUser = await userRepo.save({
    username: 'mrossi', displayName: 'Mario Rossi', initials: 'MR',
    email: 'm.rossi@mesa.local', isActive: true, passwordHash: 'mesa2025',
  });

  const urRepo = ds.getRepository(MesaUserRole);
  await urRepo.save([
    { user: adminUser, role: adminRole },
    { user: coordUser, role: coordRole },
    { user: compilerUser, role: compilerRole },
  ]);

  // ── Application modules ───────────────────────────────────────────────────
  const modRepo = ds.getRepository(MesaApplicationModule);
  await modRepo.save([
    { code: 'HR_DC', name: 'HR Data Collection', moduleType: 'capability', sortOrder: 1, isActive: true, version: '1.0.0' },
    { code: 'ESG',   name: 'ESG Reporting',       moduleType: 'capability', sortOrder: 2, isActive: true, version: '1.0.0' },
  ]);

  // ── Navigation items ──────────────────────────────────────────────────────
  const navRepo = ds.getRepository(MesaNavigationItem);
  await navRepo.save([
    { menuKey: 'home',            label: 'Home',               route: '/',               icon: 'home',         sortOrder: 0, isActive: true, parentId: null, moduleCode: null },
    { menuKey: 'cfs-report',      label: 'HR Data Collection', route: '/cfs',            icon: 'table_chart',  sortOrder: 1, isActive: true, parentId: null, moduleCode: 'HR_DC' },
    { menuKey: 'esg-configurator',label: 'ESG Reporting',      route: '/esg',            icon: 'eco',          sortOrder: 2, isActive: true, parentId: null, moduleCode: 'ESG'   },
    { menuKey: 'moduli',          label: 'Moduli',             route: '/admin/modules',  icon: 'extension',    sortOrder: 4, isActive: true, parentId: null, moduleCode: null },
    { menuKey: 'users',           label: 'Utenti',             route: '/admin/users',    icon: 'people',       sortOrder: 5, isActive: true, parentId: null, moduleCode: null },
    { menuKey: 'nav',             label: 'Navigazione',        route: '/admin/nav',      icon: 'menu',         sortOrder: 6, isActive: true, parentId: null, moduleCode: null },
  ]);

  // ── Report ────────────────────────────────────────────────────────────────
  const reportRepo = ds.getRepository(MesaReport);
  const report = await reportRepo.save({
    code: 'HR-DIV-DC', name: 'HR Data Collection',
    description: 'Raccolta dati HR annuale - 20 società del Gruppo',
    period: 'Dicembre 2025', status: 'DRAFT',
  });

  // ── Sections ──────────────────────────────────────────────────────────────
  const sectionRepo = ds.getRepository(MesaSection);
  const sections: MesaSection[] = [];
  for (let i = 0; i < SECTIONS.length; i++) {
    const s = SECTIONS[i];
    const sec = await sectionRepo.save({
      report, code: s.code!, name: s.name!,
      sortOrder: i + 1,
      status: i === 3 ? 'INCOMPLETE' : (i < 2 ? 'COMPLETE' : 'EMPTY'),
    });
    sections.push(sec);
  }

  // ── Dimension ─────────────────────────────────────────────────────────────
  const dimRepo  = ds.getRepository(MesaDimension);
  const dvRepo   = ds.getRepository(MesaDimensionValue);
  const entityDim = await dimRepo.save({ code: 'ENTITY', name: 'Società / Entità', type: 'entity' });

  const dimValues: MesaDimensionValue[] = [];
  for (let i = 0; i < ENTITY_CODES.length; i++) {
    const dv = await dvRepo.save({
      dimension: entityDim, code: ENTITY_CODES[i]!, name: `Società ${ENTITY_CODES[i]}`, sortOrder: i + 1,
    });
    dimValues.push(dv);
  }

  // ── Scope: compiler sees first 10 entities ────────────────────────────────
  const scopeRepo = ds.getRepository(MesaScope);
  for (const dv of dimValues.slice(0, 10)) {
    await scopeRepo.save({ user: compilerUser, dimensionValue: dv });
  }

  // ── Report–Dimension mapping ──────────────────────────────────────────────
  await ds.getRepository(MesaReportDimension).save({ report, dimension: entityDim, role: 'COLUMN' });

  // ── KPIs for Section 4 (Formazione) ──────────────────────────────────────
  const kpiRepo  = ds.getRepository(MesaKpi);
  const factRepo = ds.getRepository(MesaFactValue);
  const sec4     = sections[3]!;
  let kpiOrder   = 0;

  async function saveKpi(params: {
    section: MesaSection; parent?: MesaKpi | null; subSection?: string;
    name: string; unit?: string; isParent?: boolean; childCount?: number;
    indentLevel?: number;
  }): Promise<MesaKpi> {
    return kpiRepo.save({
      section: params.section,
      parent:  params.parent ?? null,
      subSection: params.subSection ?? '',
      name:    params.name,
      unit:    params.unit ?? 'n°',
      sortOrder: ++kpiOrder,
      isCalculated:      params.isParent ?? false,
      formulaType:       params.isParent ? 'SUM' : null,
      formulaOperandCount: params.isParent ? (params.childCount ?? 0) : null,
      isBold:       params.isParent ?? false,
      indentLevel:  params.indentLevel ?? 0,
      isEnabled:    true,
    } as Partial<MesaKpi> as MesaKpi);
  }

  const sec4Groups = [
    { subSection: '4a', kpis: [
      { name: 'Volumi ore formazione erogate totali', unit: 'ore', isParent: true, children: [
        { name: 'Ore formazione in aula', unit: 'ore' },
        { name: 'Ore formazione e-learning', unit: 'ore' },
        { name: 'Ore formazione on-the-job', unit: 'ore' },
      ]},
      { name: 'N° partecipanti totali', unit: 'n°' },
    ]},
    { subSection: '4b', kpis: [
      { name: 'Costi totali formazione', unit: '€/000', isParent: true, children: [
        { name: 'Costi docenza interna', unit: '€/000' },
        { name: 'Costi docenza esterna', unit: '€/000' },
        { name: 'Costi materiali didattici', unit: '€/000' },
      ]},
    ]},
  ];

  const childKpis: MesaKpi[] = [];
  for (const group of sec4Groups) {
    for (const kpiDef of group.kpis as any[]) {
      const parentKpi = await saveKpi({ section: sec4, subSection: group.subSection, name: kpiDef.name, unit: kpiDef.unit, isParent: kpiDef.isParent, childCount: kpiDef.children?.length });
      if (kpiDef.children) {
        for (const childDef of kpiDef.children) {
          const child = await saveKpi({ section: sec4, parent: parentKpi, subSection: group.subSection, name: childDef.name, unit: childDef.unit, indentLevel: 1 });
          childKpis.push(child);
        }
      }
    }
  }

  // ── Generic KPIs for other sections ──────────────────────────────────────
  const genericNames = ['Indicatore A', 'Indicatore B', 'Indicatore C', 'Indicatore D', 'Indicatore E'];
  for (let si = 0; si < sections.length; si++) {
    if (si === 3) continue;
    kpiOrder = 0;
    for (const name of genericNames) {
      await saveKpi({ section: sections[si]!, subSection: `${sections[si]!.code}a`, name });
    }
  }

  // ── Fact values (random data for section 4 children) ─────────────────────
  for (const kpi of childKpis) {
    for (const dv of dimValues) {
      if (Math.random() < 0.25) continue; // 75% fill rate
      await factRepo.save({
        report, section: sec4, kpi, dimensionValue: dv,
        numericValue: rand(50, 3000),
        updatedBy: compilerUser,
      });
    }
  }

  // ── Validation rules ──────────────────────────────────────────────────────
  const validRepo = ds.getRepository(MesaValidation);
  const oreKpis   = childKpis.filter((k) => k.unit === 'ore').slice(0, 3);
  for (const kpi of oreKpis) {
    await validRepo.save([
      { kpi, rule: 'NON_NEGATIVE', severity: 'ERROR',   message: 'Le ore non possono essere negative', minValue: null, maxValue: null },
      { kpi, rule: 'INTEGER',      severity: 'WARNING',  message: 'Le ore dovrebbero essere un valore intero', minValue: null, maxValue: null },
      { kpi, rule: 'MAX',          severity: 'WARNING',  message: 'Valore anomalo: superiore a 8760 ore/anno', minValue: null, maxValue: 8760 },
    ] as Partial<MesaValidation>[]);
  }

  console.log('\n[mesa-seed] Seed completato!');
  console.log(`  Report: HR-DIV-DC`);
  console.log(`  Sezioni: ${sections.length}`);
  console.log(`  Entità: ${dimValues.length}`);
  console.log(`  Utenti: admin, abianco (coordinator), mrossi (compiler)`);
  console.log('\nAvviare il backend: npm run dev');

  await ds.destroy();
}

seed().catch((err) => {
  console.error('[mesa-seed] ERRORE:', err);
  process.exit(1);
});
