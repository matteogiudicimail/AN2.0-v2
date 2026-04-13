/**
 * Socket.io gateway for MESA real-time collaboration.
 * Replaces NestJS WebSocketGateway — uses socket.io standalone.
 * Must be initialized after the HTTP server is created (see server.ts).
 */
import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';

interface JoinPayload  { reportId: number; sectionId: number; userId: number }
interface CellPayload  {
  reportId: number; sectionId: number; kpiId: number;
  dimensionValueId: number; numericValue: number | null; userId: number;
}

let io: SocketServer | null = null;

export function initRealtime(httpServer: HttpServer, allowedOrigins: string[]): void {
  io = new SocketServer(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: false },
    path: '/realtime/socket.io',
  });

  io.of('/realtime').on('connection', (socket: Socket) => {
    console.log(`[realtime] Client connected: ${socket.id}`);

    socket.on('join', (data: JoinPayload) => {
      const room = `report:${data.reportId}:section:${data.sectionId}`;
      socket.join(room);
      socket.emit('joined', { room });
    });

    socket.on('leave', (data: JoinPayload) => {
      const room = `report:${data.reportId}:section:${data.sectionId}`;
      socket.leave(room);
    });

    socket.on('disconnect', () => {
      console.log(`[realtime] Client disconnected: ${socket.id}`);
    });
  });
}

export function broadcastCellSaved(payload: CellPayload): void {
  if (!io) return;
  const room = `report:${payload.reportId}:section:${payload.sectionId}`;
  io.of('/realtime').to(room).emit('cellSaved', payload);
}

export function broadcastStatusChanged(reportId: number, newStatus: string): void {
  if (!io) return;
  io.of('/realtime').emit('statusChanged', { reportId, status: newStatus });
}
