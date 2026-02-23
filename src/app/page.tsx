import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Schedule</h1>
          <SignInButton />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-2xl px-4">
          <h2 className="text-4xl font-bold mb-4">
            日程調整をもっとシンプルに
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Googleカレンダーと連携して、空き時間を自動で共有。
            URLを送るだけで日程調整が完了します。
            Google MeetやZoomのリンクも自動発行。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <SignInButton />
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="p-6 rounded-lg border">
              <h3 className="font-semibold mb-2">カレンダー連携</h3>
              <p className="text-sm text-muted-foreground">
                Googleカレンダーの予定を自動で読み取り、空いている時間だけを表示します。
              </p>
            </div>
            <div className="p-6 rounded-lg border">
              <h3 className="font-semibold mb-2">複数人対応</h3>
              <p className="text-sm text-muted-foreground">
                チームメンバーの空き時間を統合。誰かが空いていればOK、全員空いている時だけ、など柔軟に設定。
              </p>
            </div>
            <div className="p-6 rounded-lg border">
              <h3 className="font-semibold mb-2">会議URL自動発行</h3>
              <p className="text-sm text-muted-foreground">
                予約が確定した瞬間にGoogle MeetまたはZoomのURLを自動発行。
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
