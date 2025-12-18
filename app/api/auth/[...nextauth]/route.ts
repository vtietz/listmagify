import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/auth";

// @ts-expect-error - next-auth callable signature
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };