export function LoginPage() {
  const loginError = new URLSearchParams(window.location.search).get("error");
  const handleLogin = () => {
    window.location.href = "/jobs/auth/google";
  };

  return (
    <div className="min-h-screen bg-hermes-bg flex flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-hermes-text mb-2">
          Job Openings Dashboard
        </h1>
        <p className="text-hermes-muted">Track your next career move</p>
        {loginError === "auth_failed" && (
          <p className="mt-3 text-sm text-hermes-red" role="alert">
            Google sign-in failed. Please try again.
          </p>
        )}
      </div>

      <button
        onClick={handleLogin}
        className="flex items-center gap-3 bg-white text-gray-800 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors shadow-lg"
      >
        <svg className="w-5 h-5" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
          <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
          <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
          <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
        </svg>
        Sign in with Google
      </button>
    </div>
  );
}