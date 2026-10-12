// DEV MODE: auth middleware disabled — uncomment to re-enable
// import { withAuth } from "next-auth/middleware";
// export default withAuth({ pages: { signIn: "/login" } });
// export const config = {
//   matcher: ["/projects/:path*", "/assess/:path*", "/history/:path*", "/herbs/:path*", "/models", "/settings/:path*", "/skin-viewer/:path*", "/symptom-lab/:path*"],
// };

export function middleware() {}
export const config = { matcher: [] };
