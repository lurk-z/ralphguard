import { redirect } from 'next/navigation'

// Registration retired (no login system) — redirect into the app.
export default function RegisterPage() {
  redirect('/login')
}
