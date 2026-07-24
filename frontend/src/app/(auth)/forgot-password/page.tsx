import { redirect } from 'next/navigation'

// Password reset retired (no login system) — redirect into the app.
export default function ForgotPasswordPage() {
  redirect('/projects')
}
