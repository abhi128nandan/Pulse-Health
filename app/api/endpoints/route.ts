import {
  createEndpoint,
  createEndpointSchema,
  DuplicateUrlError,
  listEndpoints,
} from '../../../services/endpoints';

export async function GET() {
  try {
    const endpointsList = await listEndpoints();
    return Response.json(endpointsList, { status: 200 });
  } catch (error) {
    console.error('Failed to list endpoints:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    const parseResult = createEndpointSchema.safeParse(body);
    if (!parseResult.success) {
      return Response.json(
        {
          error: 'Invalid request',
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const newEndpoint = await createEndpoint(parseResult.data);
    return Response.json(newEndpoint, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateUrlError) {
      return Response.json(
        { error: 'An endpoint with this URL already exists' },
        { status: 409 }
      );
    }

    console.error('Failed to create endpoint:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
