import { userForAuthorization } from "./tokens";

export function tokenUser(request: Request) {
  return userForAuthorization(request.headers.get("authorization"), request.headers.get("user-agent"));
}

export function unauthorized() {
  return Response.json({ error: "Invalid authorization token." }, { status: 401 });
}
