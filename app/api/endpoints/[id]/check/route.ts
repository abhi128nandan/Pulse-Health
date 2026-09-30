import { parseEndpointId } from '../../../../../services/endpoints';
import { runCheck } from '../../../../../services/monitor';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseEndpointId(rawId);
    if (id === null) {
      return Response.json({ error: 'Invalid endpoint ID' }, { status: 400 });
    }

    const checkOutcome = await runCheck(id);
    if (!checkOutcome.ok) {
      if (checkOutcome.error === 'ENDPOINT_NOT_FOUND') {
        return Response.json({ error: 'Endpoint not found' }, { status: 404 });
      }
      return Response.json({ error: checkOutcome.message }, { status: 400 });
    }

    // Monitoring probe executed and result persisted (even if target API was down)
    return Response.json(checkOutcome, { status: 200 });
  } catch (error) {
    console.error('Failed to run check:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
