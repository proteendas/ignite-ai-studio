import type { NextAuthOptions } from 'next-auth';
import type { Provider } from 'next-auth/providers/index';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import { v4 as uuidv4 } from 'uuid';
import { getUserByEmail, createUser } from '@/lib/db/sql/client';
import { verifyPassword } from '@/lib/auth/password';

const credentialsProvider = CredentialsProvider({
  name: 'Credentials',
  credentials: {
    email: {},
    password: {},
  },
  async authorize(credentials) {
    if (!credentials?.email || !credentials?.password) {
      return null;
    }

    const user = await getUserByEmail(credentials.email);
    if (!user || !user.passwordHash) {
      return null;
    }

    const valid = await verifyPassword(credentials.password, user.passwordHash);
    if (!valid) {
      return null;
    }

    return { id: user.id, email: user.email, name: user.name ?? undefined };
  },
});

// OAuth providers are only registered when their env vars are actually
// present. NextAuth's Google/GitHub provider factories throw ("client_id is
// required") the moment sign-in is attempted if constructed with an empty
// clientId, so we must not add them at all rather than passing empty strings.
const oauthProviders: Provider[] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

// Note: NextAuth's own docs commonly use GITHUB_ID / GITHUB_SECRET for this
// provider, but we use GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET here for
// naming consistency with the Google provider's env vars above.
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  oauthProviders.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers: [credentialsProvider, ...oauthProviders],
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Credentials provider already returns our local user id.
        let localId = user.id;

        // For OAuth sign-ins, look up (or auto-create) a local `users` row
        // keyed by email so OAuth users also get a stable local id usable as
        // ownerId elsewhere in the app (documents, chat sessions, etc.).
        if (user.email) {
          const existing = await getUserByEmail(user.email);
          if (existing) {
            localId = existing.id;
          } else {
            const created = await createUser({
              id: uuidv4(),
              email: user.email,
              name: user.name ?? null,
              provider: 'oauth',
            });
            localId = created.id;
          }
        }

        token.sub = localId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
