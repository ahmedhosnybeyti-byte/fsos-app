import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

// Marks a route as not requiring JwtAuthGuard — used for login/register and
// the two publicly-reachable GPT Action entry points (which authenticate via
// their own API-key/launch-token scheme instead of the user session cookie).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
