import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">サインイン</CardTitle>
          <CardDescription>
            Googleアカウントでサインインして日程調整を始めましょう
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <SignInButton />
        </CardContent>
      </Card>
    </div>
  );
}
