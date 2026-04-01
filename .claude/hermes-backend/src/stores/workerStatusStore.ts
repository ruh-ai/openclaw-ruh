import { v4 as uuidv4 } from 'uuid';
import { withConn } from '../db';

export interface WorkerStatus {
  id: string;
  workerName: string;
  queueName: string;
  status: string;
  currentJobId: string | null;
  pid: number | null;
  startedAt: string;
  lastHeartbeat: string;
}

function serialize(row: Record<string, unknown>): WorkerStatus {
  return {
    id: String(row.id),
    workerName: String(row.worker_name),
    queueName: String(row.queue_name),
    status: String(row.status),
    currentJobId: row.current_job_id ? String(row.current_job_id) : null,
    pid: row.pid != null ? Number(row.pid) : null,
    startedAt: String(row.started_at),
    lastHeartbeat: String(row.last_heartbeat),
  };
}

export async function upsertWorkerStatus(data: {
  workerName: string;
  queueName: string;
  status: string;
  currentJobId?: string;
  pid?: number;
}): Promise<WorkerStatus> {
  return withConn(async (client) => {
    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO worker_status (id, worker_name, queue_name, status, current_job_id, pid, last_heartbeat)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (worker_name) DO UPDATE SET
         status = EXCLUDED.status,
         current_job_id = EXCLUDED.current_job_id,
         pid = EXCLUDED.pid,
         last_heartbeat = NOW()
       RETURNING *`,
      [id, data.workerName, data.queueName, data.status, data.currentJobId || null, data.pid || null],
    );
    return serialize(result.rows[0]);
  });
}

export async function listWorkerStatuses(): Promise<WorkerStatus[]> {
  return withConn(async (client) => {
    const result = await client.query('SELECT * FROM worker_status ORDER BY queue_name, worker_name');
    return result.rows.map(serialize);
  });
}

export async function heartbeat(workerName: string): Promise<void> {
  return withConn(async (client) => {
    await client.query(
      `UPDATE worker_status SET last_heartbeat = NOW() WHERE worker_name = $1`,
      [workerName],
    );
  });
}
