import { getEndpointById, parseEndpointId } from '../../../../../services/endpoints';
import { getEndpointMetrics } from '../../../../../services/metrics';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseEndpointId(rawId);
    if (id === null) {
      return Response.json({ error: 'Invalid endpoint ID' }, { status: 400 });
    }

    const endpoint = await getEndpointById(id);
    if (!endpoint) {
      return Response.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    const metrics = await getEndpointMetrics(id);
    return Response.json(metrics, { status: 200 });
  } catch (error) {
    console.error('Failed to get endpoint metrics:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
