import { Elysia } from 'elysia';
import { addClient, removeClient } from '../services/sse-bus';

export const sseRoutes = new Elysia()
  .get('/api/sse', ({ set }) => {
    set.headers['Content-Type'] = 'text/event-stream';
    set.headers['Cache-Control'] = 'no-cache';
    set.headers['Connection'] = 'keep-alive';
    set.headers['X-Accel-Buffering'] = 'no';

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const writer = {
          write(data: string) {
            try {
              controller.enqueue(encoder.encode(data));
            } catch {
              // stream closed
            }
          },
          close() {
            try {
              controller.close();
            } catch {
              // already closed
            }
          },
          closed: false,
        };

        addClient(writer);

        // Send initial keepalive
        writer.write(': connected\n\n');

        // Keepalive every 15s
        const keepalive = setInterval(() => {
          if (writer.closed) {
            clearInterval(keepalive);
            return;
          }
          writer.write(': keepalive\n\n');
        }, 15000);

        // Cleanup on cancel
        const originalCancel = controller.close.bind(controller);
        const cleanup = () => {
          writer.closed = true;
          removeClient(writer);
          clearInterval(keepalive);
        };

        // Handle stream abort
        setTimeout(() => {
          // Poll for closed state
          const check = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(''));
            } catch {
              cleanup();
              clearInterval(check);
            }
          }, 5000);
        }, 1000);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });
