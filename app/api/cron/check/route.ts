import { timingSafeEqual } from 'crypto';
import {
  acquireExecutionGuard,
  releaseExecutionGuard,
  runScheduledChecks,
} from '../../../../services/scheduler';

/**
 * POST /api/cron/check
 *
 * Externally-triggered cron endpoint for scheduled API monitoring.
 * Authenticates via CRON_SECRET, acquires process-local execution guard,
 * invokes the scheduler, and returns a JSON summary.
 *
 * The route handler owns the execution guard lifecycle (acquire/release).
 */
export async function POST(request: Request) {
  // Step 1: Verify server-side CRON_SECRET configuration
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not configured');
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }

  // Step 2: Extract and validate Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice('Bearer '.length);

  // Step 3: Constant-time token comparison
  const expectedBuffer = Buffer.from(cronSecret, 'utf-8');
  const receivedBuffer = Buffer.from(token, 'utf-8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 4: Acquire execution guard to prevent overlapping runs
  if (!acquireExecutionGuard()) {
    console.warn('Scheduled check run skipped: previous run still active');
    return Response.json(
      {
        success: true,
        skipped: true,
        reason: 'Previous scheduled check run is still active',
      },
      { status: 200 }
    );
  }

  // Step 5: Execute scheduled checks with guard lifecycle
  try {
    const summary = await runScheduledChecks();
    return Response.json(summary, { status: 200 });
  } catch (error) {
    console.error('Scheduled check run failed:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    releaseExecutionGuard();
  }
}
