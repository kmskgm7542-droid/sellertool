import type { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};
