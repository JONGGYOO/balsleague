import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import balsLogo from "@/image/bals.jpg";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        {/* 로고 + 브랜드 */}
        <div className="text-center mb-6">
          <Image
            src={balsLogo}
            alt="BALS 로고"
            width={180}
            height={180}
            className="mx-auto"
            priority
          />
          <p className="mt-3 text-sm text-gray-500 leading-relaxed">
            발스 리그에 오신걸 환영합니다<br />
            회원가입 및 로그인 해주세요.
          </p>
        </div>

        {/* Clerk 폼 */}
        <div className="flex justify-center">
          <SignUp
            fallbackRedirectUrl="/leagues"
            appearance={{
              elements: {
                headerTitle: "hidden",
                headerSubtitle: "hidden",
              },
            }}
          />
        </div>

      </div>
    </div>
  );
}
