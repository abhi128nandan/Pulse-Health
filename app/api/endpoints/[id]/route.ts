import { deleteEndpoint, parseEndpointId } from '../../../../services/endpoints';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseEndpointId(rawId);
    if (id === null) {
      return Response.json({ error: 'Invalid endpoint ID' }, { status: 400 });
    }

    const deleted = await deleteEndpoint(id);
    if (!deleted) {
      return Response.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Failed to delete endpoint:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
