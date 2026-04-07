import { dbAll } from '../config/dbHelpers';
import { Process } from '../models/dimension.models';

interface ProcessRow {
  LoadId: number;
  Process: string;
  Scenario: string;
  Year: number;
  Month: string;
}

interface LockRow { LoadId: number; IsLocked: number; }

function mapProcess(row: ProcessRow, isLocked: boolean): Process {
  return {
    loadId:             row.LoadId,
    processDescription: row.Process,
    scenario:           row.Scenario,
    year:               row.Year,
    month:              row.Month,
    isLocked,
  };
}

export async function getAllProcesses(): Promise<Process[]> {
  // app_ProcessLock non presente nel DB: tutti i processi sono considerati unlocked
  const processRows = await dbAll<ProcessRow>(`SELECT LoadId, Process, Scenario,
     YEAR(EndDate) AS Year,
     CAST(YEAR(EndDate) AS NVARCHAR(4)) + '-' + RIGHT('0' + CAST(MONTH(EndDate) AS NVARCHAR(2)), 2) AS Month
   FROM tCFS_Process ORDER BY Year DESC, Month DESC`);
  return processRows.map((row) => mapProcess(row, false));
}

export async function getProcessLockStatus(loadIds: number[]): Promise<Map<number, boolean>> {
  // app_ProcessLock non presente: nessun lock
  return new Map(loadIds.map((id) => [id, false]));
}

export async function isProcessLocked(_loadId: number): Promise<boolean> {
  return false;
}
