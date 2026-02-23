import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.freebusy",
          ].join(" "),
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.email && user.id) {
        const baseSlug = user.email
          .split("@")[0]
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        // Check for uniqueness and append number if needed
        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const existing = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.username, slug))
            .limit(1);
          if (existing.length === 0) break;
          slug = `${baseSlug}-${counter}`;
          counter++;
        }

        await db
          .update(schema.users)
          .set({ username: slug })
          .where(eq(schema.users.id, user.id));

        // Create default availability schedule
        const [schedule] = await db
          .insert(schema.availabilitySchedules)
          .values({
            userId: user.id,
            name: "Default",
            isDefault: true,
            timezone: "Asia/Tokyo",
          })
          .returning();

        // Add default weekday availability (9:00-17:00)
        const weekdays = [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
        ] as const;
        await db.insert(schema.availabilityRules).values(
          weekdays.map((day) => ({
            scheduleId: schedule.id,
            dayOfWeek: day,
            startTime: "09:00",
            endTime: "17:00",
          }))
        );
      }
    },
  },
});
