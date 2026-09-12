import { expect } from "vitest";
import type { Mock } from "vitest";
import type { APIContext, APIRoute } from "astro";

export async function assertRequiresApiAuth(
  handler: APIRoute,
  buildContext: (user: null) => APIContext,
  createClientMock: Mock,
): Promise<void> {
  const response = await handler(buildContext(null));

  expect(response.status).toBe(401);
  const body = (await response.json()) as { error: { message: string } };
  expect(body.error.message).toBeTruthy();
  expect(createClientMock).not.toHaveBeenCalled();
}
