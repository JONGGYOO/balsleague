"use client";

import { ClerkProvider, useAuth, useUser } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient, useMutation } from "convex/react";
import { ReactNode, useEffect } from "react";
import { api } from "@/convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Clerk 사용자의 이메일을 Convex DB에 동기화 (JWT에 email 클레임이 없는 경우 보완)
function EmailSync() {
  const { user } = useUser();
  const syncEmail = useMutation(api.users.syncEmail);

  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) return;
    syncEmail({ email });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      signInFallbackRedirectUrl="/leagues"
      signUpFallbackRedirectUrl="/leagues"
      signOutForceRedirectUrl="/sign-in"
      localization={{
        signIn: {
          start: {
            actionText: "계정이 없으신가요?",
            actionLink: "회원가입",
          },
        },
        signUp: {
          start: {
            actionText: "이미 계정이 있으신가요?",
            actionLink: "로그인",
          },
        },
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <EmailSync />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
