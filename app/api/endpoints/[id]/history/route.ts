import { getEndpointById, parseEndpointId } from '../../../../../services/endpoints';
import { getRecentChecks } from '../../../../../services/metrics';

export async function GET(
  request: Request,
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

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    let limit: number | undefined;

    if (limitParam !== null) {
      const parsedLimit = Number(limitParam);
      if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit <= 0 ||
        parsedLimit > 100
      ) {
        return Response.json(
          {
            error:
              'Invalid limit parameter. Must be an integer between 1 and 100',
          },
          { status: 400 }
        );
      }
      limit = parsedLimit;
    }

    const history = await getRecentChecks(id, limit);
    return Response.json(history, { status: 200 });
  } catch (error) {
    console.error('Failed to get check history:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
