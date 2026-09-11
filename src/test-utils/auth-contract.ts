import { expect } from "vitest";
import type { Mock } from "vitest";
import type { APIContext, APIRoute } from "astro";

export async function assertRequiresAuth(
  handler: APIRoute,
  buildContext: (user: null) => APIContext,
  createClientMock: Mock,
): Promise<void> {
  const response = await handler(buildContext(null));

  expect(response.headers.get("Location")).toBe("/auth/signin");
  expect(createClientMock).not.toHaveBeenCalled();
}
