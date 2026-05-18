import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="authPage">
      <SignIn />
    </main>
  );
}
